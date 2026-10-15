-- Tony Next · 0026 content sync with the Talent folder.
-- Until now the index of the folder was live (every 15 minutes) but the content that lives INSIDE the files –
-- squads, presence, speed tests, weight and height, match stats, match reports, training plans, evaluations,
-- finance ledgers, weekly staff reports – was a one-off import of 6.10.2026. From here on the sync reads every
-- workbook that changed and replaces what came from that file, so the screens mirror the files exactly.

-- ───────── What was read, when ─────────
create table if not exists public.talent_content (
  file_id uuid primary key references public.talent_files(id) on delete cascade,
  kind text not null,
  parsed_at timestamptz,
  parsed_modified_at timestamptz,
  rows int,
  error text,
  attempts int not null default 0
);
alter table public.talent_content enable row level security;
drop policy if exists talent_content_admin on public.talent_content;
create policy talent_content_admin on public.talent_content for select to authenticated using (public.is_admin());

-- which parser a file belongs to, from its path
create or replace function public.talent_content_kind(p_path text, p_ext text) returns text
language sql immutable as $$
  select case
    when p_ext not in ('xlsx','xlsm') then null
    when p_path ~ '^Season \d{4}-\d{4}/[^/]+/.*Presence Control' then 'presence'
    when p_path ~ '^Season \d{4}-\d{4}/[^/]+/.*Speed Test' then 'speed'
    when p_path ~ '^Season \d{4}-\d{4}/[^/]+/.*Weight and Height' then 'weight'
    when p_path ~ '^Season \d{4}-\d{4}/[^/]+/.*Match Control' then 'matchstats'
    when p_path ~* '^Season \d{4}-\d{4}/[^/]+/.*squad - \d{4}-\d{4}\.xlsx$' or p_path ~* '^Season \d{4}-\d{4}/[^/]+/[^/]*/[^/]* squad\.xlsx$' then 'squad'
    when p_path ~* '^Season \d{4}-\d{4}/Evaluations.*Evaluations - Tony' then 'evaluations'
    when p_path ~* '^Reports/Finance Momo/.*(EXP|Expenses|Final).*\.xlsx$' then 'finance'
    when p_path ~* '^Reports/Professional/\d{4}/Week Coordinator Reports/' then 'weekreport'
    else null end
$$;

-- the team a path belongs to (longest matching team folder)
create or replace function public.talent_team_for(p_path text) returns uuid
language sql stable as $$
  select id from public.teams where p_path like folder || '/%' order by length(folder) desc limit 1
$$;

-- ───────── Names in the files → players ─────────
create or replace function public.talent_norm(p text) returns text
language sql immutable as $$
  select string_agg(t, ' ' order by t) from regexp_split_to_table(lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z ]', ' ', 'g')), '\s+') t where length(t) > 1
$$;

-- "NDATIMANA DOMINIQUE XAVIER (RB/RW)" -> name without the position; the position; a birth year written in the name
create or replace function public.talent_parse_name(p_raw text, out o_name text, out o_pos text, out o_year int)
language plpgsql immutable as $$
declare s text;
begin
  s := trim(coalesce(p_raw, ''));
  o_pos := nullif(trim(substring(s from '\(([^)]*)\)')), '');
  s := regexp_replace(s, '\([^)]*\)', ' ', 'g');
  o_year := nullif(substring(s from '\m(20[0-2]\d|19[89]\d)\M'), '')::int;
  s := regexp_replace(s, '\m(20[0-2]\d|19[89]\d)\M', ' ', 'g');
  o_name := trim(regexp_replace(s, '\s+', ' ', 'g'));
end $$;

-- the player behind a name in a team file: an existing Tony player with the same name, else a new one
create or replace function public.talent_match_player(p_project uuid, p_raw text, p_team uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare n record; v_id uuid; v_first text; v_last text; parts text[];
begin
  select * into n from public.talent_parse_name(p_raw);
  if n.o_name is null or n.o_name = '' then return null; end if;
  -- 1. already in this team
  if p_team is not null then
    select p.id into v_id from public.team_players tp join public.players p on p.id = tp.player_id
     where tp.team_id = p_team and p.merged_into is null and public.talent_norm(p.first_name || ' ' || p.last_name) = public.talent_norm(n.o_name) limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  -- 2. any Tony player of the project with the same name (squad players first, then by year if the name carries one)
  select p.id into v_id from public.players p
   where p.project_id = p_project and p.merged_into is null and public.talent_norm(p.first_name || ' ' || p.last_name) = public.talent_norm(n.o_name)
     and (n.o_year is null or p.birth_year is null or p.birth_year = n.o_year)
   order by (p.pool_status = 'tony_squad') desc, (p.source = 'import') desc, p.created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  -- 3. new: files write SURNAME GIVEN NAMES; keep the first word as the family name
  parts := regexp_split_to_array(n.o_name, '\s+');
  v_last := parts[1]; v_first := coalesce(nullif(array_to_string(parts[2:], ' '), ''), parts[1]);
  perform set_config('pluribus.system', 'on', true);
  insert into public.players(project_id, first_name, last_name, birth_year, positions, source, pool_status, staff_notes)
  values (p_project, v_first, v_last, n.o_year, n.o_pos, 'import', 'tony_squad', 'Added from the Tony team files in the Talent folder')
  returning id into v_id;
  return v_id;
end $$;

-- ───────── Apply one workbook (the data from that file is replaced) ─────────

-- presence: {months:[{month:'2026-09', days:[{day:'2026-09-15', seq:1, kind:'match'|'training'}],
--                     rows:[{name:'...', cells:[{d:<day index>, v:'60'|'M'|'A'...}]}]}]}
create or replace function public.talent_apply_presence(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare m jsonb; d jsonb; r jsonb; c jsonb; v_month text; v_from date; v_to date; day_ids uuid[]; pid uuid; roster uuid[] := '{}'; n int := 0; v_pos text; nm record; v_day uuid; v_code text; v_min int; v_season uuid;
begin
  if p_team is null then return 0; end if;
  select season_id into v_season from public.teams where id = p_team;
  perform set_config('pluribus.system', 'on', true);
  for m in select * from jsonb_array_elements(coalesce(p->'months', '[]'::jsonb)) loop
    v_month := m->>'month';
    v_from := (v_month || '-01')::date; v_to := (v_from + interval '1 month')::date;
    -- the month is replaced as a whole
    delete from public.team_days where team_id = p_team and day >= v_from and day < v_to;
    day_ids := '{}';
    for d in select * from jsonb_array_elements(coalesce(m->'days', '[]'::jsonb)) loop
      insert into public.team_days(team_id, day, seq, kind) values (p_team, (d->>'day')::date, coalesce((d->>'seq')::int, 1), coalesce(nullif(d->>'kind',''), 'training'))
      on conflict (team_id, day, seq) do update set kind = excluded.kind returning id into v_day;
      day_ids := array_append(day_ids, v_day);
    end loop;
    for r in select * from jsonb_array_elements(coalesce(m->'rows', '[]'::jsonb)) loop
      pid := public.talent_match_player(p_project, r->>'name', p_team);
      if pid is null then continue; end if;
      roster := array_append(roster, pid);
      select * into nm from public.talent_parse_name(r->>'name');
      insert into public.team_players(team_id, player_id, position, status) values (p_team, pid, nm.o_pos, 'active')
      on conflict (team_id, player_id) do update set position = coalesce(excluded.position, team_players.position), status = case when team_players.status in ('left') then 'active' else team_players.status end, left_on = null;
      for c in select * from jsonb_array_elements(coalesce(r->'cells', '[]'::jsonb)) loop
        v_day := day_ids[(c->>'d')::int + 1];
        if v_day is null then continue; end if;
        v_code := nullif(trim(c->>'v'), '');
        v_min := case when v_code ~ '^\d+$' then v_code::int else null end;
        insert into public.attendance(day_id, player_id, minutes, code) values (v_day, pid, v_min, case when v_min is null then v_code end)
        on conflict (day_id, player_id) do update set minutes = excluded.minutes, code = excluded.code;
        n := n + 1;
      end loop;
    end loop;
  end loop;
  -- who is in the file is the squad; whoever is not is marked as left (never deleted: history stays)
  if cardinality(roster) > 0 then
    update public.team_players set status = 'left', left_on = coalesce(left_on, current_date) where team_id = p_team and status <> 'left' and not (player_id = any(roster));
    update public.players set pool_status = 'tony_squad' where id = any(roster) and pool_status <> 'tony_squad';
  end if;
  return n;
end $$;

-- measurements: {metric_set:'speed'|'weight', rows:[{name, values:[{date:'2026-09-22', metric:'sprint_10m', value: 2.1}]}]}
create or replace function public.talent_apply_measurements(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; v jsonb; pid uuid; n int := 0; metrics text[];
begin
  if p_team is null then return 0; end if;
  metrics := case p->>'metric_set' when 'speed' then array['sprint_10m','sprint_20m'] else array['weight_kg','height_cm'] end;
  delete from public.measurements where team_id = p_team and metric = any(metrics);
  for r in select * from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) loop
    pid := public.talent_match_player(p_project, r->>'name', p_team);
    if pid is null then continue; end if;
    for v in select * from jsonb_array_elements(coalesce(r->'values', '[]'::jsonb)) loop
      if (v->>'metric') = any(metrics) and (v->>'value') ~ '^-?\d+(\.\d+)?$' then
        insert into public.measurements(player_id, team_id, taken_on, metric, value) values (pid, p_team, nullif(v->>'date','')::date, v->>'metric', (v->>'value')::numeric);
        n := n + 1;
      end if;
    end loop;
  end loop;
  -- the newest height and weight also live on the player card the coach sees
  update public.players p set height_cm = x.h, weight_kg = x.w, measured_on = x.d
    from (select player_id, max(taken_on) d, max(value) filter (where metric = 'height_cm') h, max(value) filter (where metric = 'weight_kg') w from public.measurements where team_id = p_team and metric in ('height_cm','weight_kg') group by player_id) x
   where p.id = x.player_id and (p.measured_on is null or p.measured_on <= x.d);
  return n;
end $$;

-- match stats: {competition:'Friendly', matches:[{col:5, number:50, opponent:'...', date:'2026-09-12'}], rows:[{name, stats:[{m:<match index>, goals, assists, yc, rc}]}]}
create or replace function public.talent_apply_matchstats(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare m jsonb; r jsonb; s jsonb; ids uuid[] := '{}'; mid uuid; pid uuid; n int := 0; v_comp text;
begin
  if p_team is null then return 0; end if;
  v_comp := coalesce(nullif(p->>'competition',''), 'Friendly');
  for m in select * from jsonb_array_elements(coalesce(p->'matches', '[]'::jsonb)) loop
    mid := null;
    if nullif(m->>'number','') is not null then
      select id into mid from public.matches where team_id = p_team and number = (m->>'number')::int and competition = v_comp limit 1;
    end if;
    if mid is null and nullif(m->>'date','') is not null then
      select id into mid from public.matches where team_id = p_team and played_on = (m->>'date')::date and competition = v_comp order by (opponent = coalesce(m->>'opponent', opponent)) desc limit 1;
    end if;
    if mid is null then
      insert into public.matches(team_id, number, played_on, competition, opponent) values (p_team, nullif(m->>'number','')::int, nullif(m->>'date','')::date, v_comp, coalesce(nullif(m->>'opponent',''), 'Match ' || coalesce(m->>'number', m->>'date', '')))
      returning id into mid;
    else
      update public.matches set number = coalesce(number, nullif(m->>'number','')::int), played_on = coalesce(played_on, nullif(m->>'date','')::date),
             opponent = case when opponent like 'Match %' and nullif(m->>'opponent','') is not null then m->>'opponent' else opponent end where id = mid;
    end if;
    ids := array_append(ids, mid);
  end loop;
  delete from public.match_players where match_id = any(ids);
  for r in select * from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) loop
    pid := public.talent_match_player(p_project, r->>'name', p_team);
    if pid is null then continue; end if;
    for s in select * from jsonb_array_elements(coalesce(r->'stats', '[]'::jsonb)) loop
      mid := ids[(s->>'m')::int + 1];
      if mid is null then continue; end if;
      insert into public.match_players(match_id, player_id, goals, assists, yellow, red)
      values (mid, pid, coalesce((s->>'goals')::int, 0), coalesce((s->>'assists')::int, 0), coalesce((s->>'yc')::int, 0), coalesce((s->>'rc')::int, 0))
      on conflict (match_id, player_id) do update set goals = excluded.goals, assists = excluded.assists, yellow = excluded.yellow, red = excluded.red;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- squad board: {rows:[{name, slot}]} – positions on the board; membership itself comes from the presence file
create or replace function public.talent_apply_squad(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; pid uuid; n int := 0;
begin
  if p_team is null then return 0; end if;
  for r in select * from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) loop
    pid := public.talent_match_player(p_project, r->>'name', p_team);
    if pid is null then continue; end if;
    insert into public.team_players(team_id, player_id, slot, status) values (p_team, pid, nullif(r->>'slot','')::int, 'active')
    on conflict (team_id, player_id) do update set slot = coalesce(excluded.slot, team_players.slot);
    n := n + 1;
  end loop;
  return n;
end $$;

-- evaluations: {season:'2025-2026', rows:[{name, dob:'2007-06-21', grade:'A', note}]}
create or replace function public.talent_apply_evaluations(p_project uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; pid uuid; n int := 0; v_season uuid;
begin
  select id into v_season from public.seasons where project_id = p_project and label = p->>'season';
  if v_season is null then return 0; end if;
  for r in select * from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) loop
    pid := public.talent_match_player(p_project, r->>'name');
    if pid is null then continue; end if;
    if nullif(r->>'dob','') is not null then update public.players set birth_date = coalesce(birth_date, (r->>'dob')::date), birth_year = coalesce(birth_year, extract(year from (r->>'dob')::date)::int) where id = pid; end if;
    if (r->>'grade') in ('A','B','C','D') then
      insert into public.evaluations(player_id, season_id, grade, summary) values (pid, v_season, r->>'grade', nullif(r->>'note',''))
      on conflict (player_id, season_id) do update set grade = excluded.grade, summary = coalesce(excluded.summary, evaluations.summary);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- finance: {file:'EXP TRW MOMO 2026.xlsx', account:'TRW MoMo', sheets:[{name:'JAN 26', rows:[{date, out, in, description, type, subtype, payee, invoice, balance}]}]}
create or replace function public.talent_apply_finance(p_project uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare s jsonb; r jsonb; v_acc uuid; v_src text; n int := 0;
begin
  insert into public.finance_accounts(project_id, name, kind, holder)
  values (p_project, p->>'account', case when p->>'account' = 'TRW MoMo' then 'mobile' else 'cash' end, case when p->>'account' in ('Andre','Fabio') then p->>'account' end)
  on conflict (project_id, name) do nothing;
  select id into v_acc from public.finance_accounts where project_id = p_project and name = p->>'account';
  for s in select * from jsonb_array_elements(coalesce(p->'sheets', '[]'::jsonb)) loop
    v_src := (p->>'file') || ' / ' || (s->>'name');
    delete from public.finance_tx where account_id = v_acc and source = v_src;
    insert into public.finance_tx(account_id, day, amount_out, amount_in, description, type, subtype, payee, invoice_ref, balance, source, file_id)
    select v_acc, (e->>'date')::date, coalesce(nullif(e->>'out','')::numeric, 0), coalesce(nullif(e->>'in','')::numeric, 0), nullif(e->>'description',''), nullif(e->>'type',''),
           nullif(e->>'subtype',''), nullif(e->>'payee',''), nullif(e->>'invoice',''), nullif(e->>'balance','')::numeric, v_src,
           (select f.id from public.talent_files f where f.project_id = p_project and f.path like 'Reports/Finance Momo/%' and not f.is_folder and nullif(e->>'invoice','') is not null
              and lower(f.name) like lower(left(e->>'invoice', 40)) || '%' limit 1)
      from jsonb_array_elements(coalesce(s->'rows', '[]'::jsonb)) e where nullif(e->>'date','') is not null;
    get diagnostics n = row_count;
  end loop;
  return n;
end $$;

-- weekly coordinator report: {file_id, rows:[{day:'2026-07-06', time, location, contact, activity, status, feedback, staff}]}
create or replace function public.talent_apply_weekreport(p_project uuid, p_file uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.staff_activities where file_id = p_file;
  insert into public.staff_activities(project_id, day, time_text, location, contact, activity, status, feedback, staff, file_id)
  select p_project, (e->>'day')::date, nullif(e->>'time',''), nullif(e->>'location',''), nullif(e->>'contact',''), coalesce(nullif(e->>'activity',''), '—'),
         nullif(e->>'status',''), nullif(e->>'feedback',''), nullif(e->>'staff',''), p_file
    from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) e where nullif(e->>'day','') is not null;
  get diagnostics n = row_count;
  return n;
end $$;

-- the dispatcher the sync function calls; records what happened on the file
create or replace function public.talent_apply(p_file uuid, p_kind text, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare f public.talent_files; v_team uuid; n int := 0;
begin
  select * into f from public.talent_files where id = p_file;
  if f.id is null then return 0; end if;
  v_team := public.talent_team_for(f.path);
  n := case p_kind
    when 'presence' then public.talent_apply_presence(f.project_id, v_team, p)
    when 'speed' then public.talent_apply_measurements(f.project_id, v_team, p || '{"metric_set":"speed"}'::jsonb)
    when 'weight' then public.talent_apply_measurements(f.project_id, v_team, p || '{"metric_set":"weight"}'::jsonb)
    when 'matchstats' then public.talent_apply_matchstats(f.project_id, v_team, p)
    when 'squad' then public.talent_apply_squad(f.project_id, v_team, p)
    when 'evaluations' then public.talent_apply_evaluations(f.project_id, p)
    when 'finance' then public.talent_apply_finance(f.project_id, p)
    when 'weekreport' then public.talent_apply_weekreport(f.project_id, p_file, p)
    else 0 end;
  insert into public.talent_content(file_id, kind, parsed_at, parsed_modified_at, rows, error, attempts)
  values (p_file, p_kind, now(), f.modified_at, n, null, 1)
  on conflict (file_id) do update set kind = excluded.kind, parsed_at = now(), parsed_modified_at = excluded.parsed_modified_at, rows = excluded.rows, error = null, attempts = talent_content.attempts + 1;
  return n;
end $$;

create or replace function public.talent_content_failed(p_file uuid, p_kind text, p_error text) returns void
language sql security definer set search_path = public as $$
  insert into public.talent_content(file_id, kind, error, attempts) values (p_file, p_kind, left(p_error, 500), 1)
  on conflict (file_id) do update set kind = excluded.kind, error = excluded.error, attempts = talent_content.attempts + 1
$$;

-- files the sync still has to read: recognised kinds whose file changed since it was last read
create or replace function public.talent_content_pending(p_project uuid, p_limit int default 12) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'item_id', f.item_id, 'path', f.path, 'kind', k.kind, 'modified_at', f.modified_at) order by f.modified_at desc), '[]'::jsonb)
    from (select f.*, public.talent_content_kind(f.path, f.ext) as kind from public.talent_files f where f.project_id = p_project and not f.is_folder and f.item_id is not null) f
    join lateral (select f.kind) k on k.kind is not null
    left join public.talent_content c on c.file_id = f.id
   where (c.file_id is null or c.parsed_modified_at is null or c.parsed_modified_at < f.modified_at) and coalesce(c.attempts, 0) < 5
   limit p_limit
$$;

-- ───────── Files that link to rows (no parsing): plans, match reports, individual reports, photos, documents ─────────
create or replace function public.link_talent_content(p_project uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_plans int := 0; n_reports int := 0; n_eval int := 0; n_photos int := 0; n_docs int := 0; r record; v_num int; v_opp text; v_date date; v_mid uuid; v_season_label text; v_y int; v_mon text; v_season uuid;
begin
  -- training plans: any "Training Session … T<n>" pdf/pptx under a team folder
  insert into public.training_sessions(team_id, number, month, microcycle, file_id)
  select t.id, nullif(substring(f.name from 'T\s*(\d+)'), '')::int,
         -- year from the path, month from "10 - October" / "9 - September - 1"
         (substring(f.path from '/(\d{4})/') || '-' || lpad(substring(f.path from '/\d{4}/(\d{1,2})\s*-'), 2, '0')),
         nullif(trim(substring(f.path from '/\d+\s*-\s*(Micro[a-z]*\s*\d+)')), ''), f.id
    from public.talent_files f join public.teams t on f.path like t.folder || '/%'
   where f.project_id = p_project and not f.is_folder and f.ext in ('pdf','pptx') and f.path ~* '/Training Se[as]+ons?/' and f.name ~* 'Training Session'
     and not exists (select 1 from public.training_sessions x where x.file_id = f.id);
  get diagnostics n_plans = row_count;
  -- the folders of 2026-27 spell it "Microcyle"
  update public.training_sessions s set microcycle = regexp_replace(s.microcycle, 'Microcyle', 'Microcycle') where s.microcycle like 'Microcyle%';
  -- the week of the plan is kept in the microcycle label, e.g. "Microcycle 6 (05.10 - 11.10)"; the exact day is not in the file name
  update public.training_sessions s set microcycle = s.microcycle || ' ' || substring(f.path from '(\(\d{1,2}\.\d{1,2}\s*-\s*\d{1,2}\.\d{1,2}\))')
    from public.talent_files f where f.id = s.file_id and s.microcycle is not null and s.microcycle not like '%(%' and f.path ~ '\(\d{1,2}\.\d{1,2}\s*-\s*\d{1,2}\.\d{1,2}\)';

  -- match reports: "<n>th U-13 - MATCH REPORT vs <opponent> <d> <Month> <yyyy>.pdf" and "<n>th - U-13 MATCH REPORT - <opponent> - dd.mm.yy.pdf"
  for r in select f.id, f.name, f.path, t.id as team_id, (select label from public.seasons where id = t.season_id) as season,
                  case when f.path ~* '/Matches/([^/]+)/' then initcap(substring(f.path from '/Matches/([^/]+)/')) else 'Friendly' end as comp
             from public.talent_files f join public.teams t on f.path like t.folder || '/%'
            where f.project_id = p_project and not f.is_folder and f.ext = 'pdf' and f.name ~* 'MATCH REPORT'
              and not exists (select 1 from public.matches m where m.report_file_id = f.id) loop
    v_num := nullif(substring(r.name from '^\s*(\d+)\s*(st|nd|rd|th)'), '')::int;
    v_opp := null; v_date := null;
    if r.name ~* '\svs\.?\s' then
      v_opp := trim(regexp_replace(substring(r.name from '(?i)\svs\.?\s+(.*?)(\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}|\s+\d{1,2}[./]\d{1,2}[./]\d{2,4}|\.pdf)'), '\s+', ' ', 'g'));
    elsif r.name ~ 'MATCH REPORT\s*-\s*' then
      v_opp := trim(substring(r.name from 'MATCH REPORT\s*-\s*([^-]+?)\s*-'));
    end if;
    if r.name ~ '\d{1,2}\s+[A-Za-z]+\s+\d{4}' then
      begin v_date := to_date(substring(r.name from '(\d{1,2}\s+[A-Za-z]+\s+\d{4})'), 'DD Month YYYY'); exception when others then v_date := null; end;
    elsif r.name ~ '\d{1,2}[./]\d{1,2}[./]\d{2,4}' then
      begin v_date := to_date(regexp_replace(substring(r.name from '(\d{1,2}[./]\d{1,2}[./]\d{2,4})'), '/', '.', 'g'), case when substring(r.name from '\d{1,2}[./]\d{1,2}[./](\d{2,4})') ~ '^\d{4}$' then 'DD.MM.YYYY' else 'DD.MM.YY' end); exception when others then v_date := null; end;
    end if;
    v_mid := null;
    if v_num is not null then select id into v_mid from public.matches where team_id = r.team_id and competition = r.comp and number = v_num and report_file_id is null limit 1; end if;
    if v_mid is null and v_date is not null then select id into v_mid from public.matches where team_id = r.team_id and played_on = v_date and report_file_id is null order by (opponent ilike '%' || coalesce(v_opp, opponent) || '%') desc limit 1; end if;
    if v_mid is null then
      insert into public.matches(team_id, number, played_on, competition, opponent, report_file_id) values (r.team_id, v_num, v_date, r.comp, coalesce(v_opp, 'Match ' || coalesce(v_num::text, '')), r.id) returning id into v_mid;
    else
      update public.matches set report_file_id = r.id, played_on = coalesce(played_on, v_date), number = coalesce(number, v_num),
             opponent = case when opponent like 'Match %' and v_opp is not null then v_opp else opponent end where id = v_mid;
    end if;
    n_reports := n_reports + 1;
  end loop;

  -- individual reports: "Individual Profile - <name>.pdf" in a season's Evaluations folder
  for r in select f.id, f.name, f.path, substring(f.path from '^Season (\d{4}-\d{4})/') as season
             from public.talent_files f where f.project_id = p_project and not f.is_folder and f.ext = 'pdf' and f.path ~* '^Season \d{4}-\d{4}/Evaluations' and f.name ~* 'Individual'
              and not exists (select 1 from public.evaluations e where e.report_file_id = f.id) loop
    select id into v_season from public.seasons where project_id = p_project and label = r.season;
    v_opp := trim(regexp_replace(regexp_replace(r.name, '\.pdf$', '', 'i'), '^.*?-\s*', ''));
    select p.id into v_mid from public.players p where p.project_id = p_project and p.merged_into is null and public.talent_norm(p.first_name || ' ' || p.last_name) = public.talent_norm(v_opp) order by (p.pool_status = 'tony_squad') desc limit 1;
    if v_mid is not null and v_season is not null then
      insert into public.evaluations(player_id, season_id, report_file_id) values (v_mid, v_season, r.id)
      on conflict (player_id, season_id) do update set report_file_id = coalesce(evaluations.report_file_id, excluded.report_file_id);
      n_eval := n_eval + 1;
    end if;
  end loop;

  -- player photos: a picture whose file name is the player's name (Players Pictures folders)
  update public.players p set photo_file_id = f.id
    from public.talent_files f
   where f.project_id = p_project and not f.is_folder and f.ext in ('jpg','jpeg','png') and f.path ~* 'Players? Pictures' and p.project_id = p_project and p.merged_into is null and p.photo_file_id is null
     and public.talent_norm(p.first_name || ' ' || p.last_name) = public.talent_norm(regexp_replace(f.name, '\.[a-z]+$', '', 'i'));
  get diagnostics n_photos = row_count;

  -- player documents: a file under Players Documents whose folder or name carries the player's name
  insert into public.player_documents(player_id, kind, notes, file_id)
  select p.id, case when f.path ~* 'contract' then 'contract' when f.path ~* 'health' then 'health' when f.path ~* 'birth' then 'birth_certificate' else 'other' end, f.name, f.id
    from public.talent_files f join public.players p on p.project_id = p_project and p.merged_into is null
     and (public.talent_norm(p.first_name || ' ' || p.last_name) = public.talent_norm(regexp_replace(f.name, '\.[a-z]+$', '', 'i'))
          or public.talent_norm(p.first_name || ' ' || p.last_name) = public.talent_norm(split_part(f.parent, '/', array_length(string_to_array(f.parent, '/'), 1))))
   where f.project_id = p_project and not f.is_folder and f.path like 'Players Documents/%'
     and not exists (select 1 from public.player_documents d where d.file_id = f.id);
  get diagnostics n_docs = row_count;

  return jsonb_build_object('plans', n_plans, 'reports', n_reports, 'evaluations', n_eval, 'photos', n_photos, 'documents', n_docs);
end $$;

-- what the Sync Center shows
create or replace function public.talent_content_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kinds', (select coalesce(jsonb_agg(jsonb_build_object('kind', k, 'files', files, 'read', read, 'stale', stale, 'errors', errors, 'last', last) order by k), '[]'::jsonb)
                from (select public.talent_content_kind(f.path, f.ext) k, count(*) files, count(c.parsed_at) read,
                             count(*) filter (where c.parsed_modified_at is null or c.parsed_modified_at < f.modified_at) stale,
                             count(c.error) errors, max(c.parsed_at) last
                        from public.talent_files f left join public.talent_content c on c.file_id = f.id
                       where not f.is_folder and public.talent_content_kind(f.path, f.ext) is not null group by 1) x),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('path', f.path, 'error', c.error, 'attempts', c.attempts) order by c.parsed_at desc nulls first), '[]'::jsonb)
                 from public.talent_content c join public.talent_files f on f.id = c.file_id where c.error is not null),
    'linked', jsonb_build_object(
      'plans', (select count(*) from public.training_sessions where file_id is not null),
      'reports', (select count(*) from public.matches where report_file_id is not null),
      'evaluations', (select count(*) from public.evaluations where report_file_id is not null),
      'photos', (select count(*) from public.players where photo_file_id is not null),
      'documents', (select count(*) from public.player_documents where file_id is not null)))
  where public.is_admin()
$$;

-- an admin may ask for every workbook to be read again
create or replace function public.talent_content_reset() returns void
language sql security definer set search_path = public as $$
  update public.talent_content set parsed_modified_at = null, attempts = 0, error = null where public.is_admin()
$$;

do $$ declare f text; begin
  foreach f in array array['talent_match_player(uuid,text,uuid)','talent_apply_presence(uuid,uuid,jsonb)','talent_apply_measurements(uuid,uuid,jsonb)','talent_apply_matchstats(uuid,uuid,jsonb)',
                           'talent_apply_squad(uuid,uuid,jsonb)','talent_apply_evaluations(uuid,jsonb)','talent_apply_finance(uuid,jsonb)','talent_apply_weekreport(uuid,uuid,jsonb)',
                           'talent_apply(uuid,text,jsonb)','talent_content_failed(uuid,text,text)','talent_content_pending(uuid,integer)','link_talent_content(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['talent_content_stats()','talent_content_reset()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
