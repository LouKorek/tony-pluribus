-- Tony Next · 0027 content sync: one name per competition, morning/afternoon labels on double days.

-- the competition of a file comes from its Matches folder: "Friendly", "TDS U14" -> "TDS", "2nd Division", "U20 League"
create or replace function public.talent_competition(p_path text) returns text
language sql immutable as $$
  select case
    when p_path !~* '/Matches/[^/]+/' then 'Friendly'
    when substring(p_path from '/Matches/([^/]+)/') ~* '^tds' then 'TDS'
    else trim(substring(p_path from '/Matches/([^/]+)/')) end
$$;

-- presence days may carry a label (Morning / Afternoon) when the file has two sessions on one day
create or replace function public.talent_apply_presence(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare m jsonb; d jsonb; r jsonb; c jsonb; v_month text; v_from date; v_to date; day_ids uuid[]; pid uuid; roster uuid[] := '{}'; n int := 0; nm record; v_day uuid; v_code text; v_min int;
begin
  if p_team is null then return 0; end if;
  perform set_config('pluribus.system', 'on', true);
  for m in select * from jsonb_array_elements(coalesce(p->'months', '[]'::jsonb)) loop
    v_month := m->>'month';
    v_from := (v_month || '-01')::date; v_to := (v_from + interval '1 month')::date;
    -- the month is replaced as a whole
    delete from public.team_days where team_id = p_team and day >= v_from and day < v_to;
    day_ids := '{}';
    for d in select * from jsonb_array_elements(coalesce(m->'days', '[]'::jsonb)) loop
      insert into public.team_days(team_id, day, seq, kind, label) values (p_team, (d->>'day')::date, coalesce((d->>'seq')::int, 1), coalesce(nullif(d->>'kind',''), 'training'), nullif(d->>'label',''))
      on conflict (team_id, day, seq) do update set kind = excluded.kind, label = excluded.label returning id into v_day;
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

-- measurements: the weight workbook also carries a "Foot" sheet (preferred foot, foot size, hand size, district)
create or replace function public.talent_apply_measurements(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; v jsonb; pid uuid; n int := 0; metrics text[]; v_dist uuid;
begin
  if p_team is null then return 0; end if;
  metrics := case p->>'metric_set' when 'speed' then array['sprint_10m','sprint_20m','sprint_30m'] else array['weight_kg','height_cm','shoe_size','hand_size'] end;
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
  -- preferred foot and district from the profile sheet
  for r in select * from jsonb_array_elements(coalesce(p->'profile', '[]'::jsonb)) loop
    pid := public.talent_match_player(p_project, r->>'name', p_team);
    if pid is null then continue; end if;
    if (r->>'foot') in ('left','right','both') then update public.players set preferred_foot = r->>'foot' where id = pid and preferred_foot is distinct from (r->>'foot'); end if;
    if nullif(r->>'district','') is not null then
      select id into v_dist from public.districts where project_id = p_project and lower(name) = lower(trim(r->>'district')) limit 1;
      if v_dist is not null then update public.players set district_id = v_dist where id = pid and district_id is null; end if;
    end if;
  end loop;
  return n;
end $$;

-- squad boards only place players who are already in the team (names on a board are not reliable enough to create players)
create or replace function public.talent_apply_squad(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; pid uuid; n int := 0; nm record;
begin
  if p_team is null then return 0; end if;
  for r in select * from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) loop
    select * into nm from public.talent_parse_name(r->>'name');
    select pl.id into pid from public.team_players tp join public.players pl on pl.id = tp.player_id
     where tp.team_id = p_team and pl.merged_into is null and public.talent_norm(pl.first_name || ' ' || pl.last_name) = public.talent_norm(nm.o_name) limit 1;
    if pid is null then continue; end if;
    update public.team_players set slot = coalesce(nullif(r->>'slot','')::int, slot) where team_id = p_team and player_id = pid;
    n := n + 1;
  end loop;
  return n;
end $$;

-- two matches on the same day stay two matches
create or replace function public.talent_apply_matchstats(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare m jsonb; r jsonb; s jsonb; ids uuid[] := '{}'; mid uuid; pid uuid; n int := 0; v_comp text;
begin
  if p_team is null then return 0; end if;
  v_comp := coalesce(nullif(p->>'competition',''), 'Friendly');
  for m in select * from jsonb_array_elements(coalesce(p->'matches', '[]'::jsonb)) loop
    mid := null;
    if nullif(m->>'number','') is not null then
      select id into mid from public.matches where team_id = p_team and number = (m->>'number')::int and competition = v_comp and not (id = any(ids)) limit 1;
    end if;
    if mid is null and nullif(m->>'date','') is not null then
      select id into mid from public.matches where team_id = p_team and played_on = (m->>'date')::date and competition = v_comp and not (id = any(ids)) order by (opponent = coalesce(m->>'opponent', opponent)) desc limit 1;
    end if;
    if mid is null then
      insert into public.matches(team_id, number, played_on, competition, opponent) values (p_team, nullif(m->>'number','')::int, nullif(m->>'date','')::date, v_comp, coalesce(nullif(m->>'opponent',''), 'Match ' || coalesce(m->>'number', m->>'date', '')))
      returning id into mid;
    else
      update public.matches set number = coalesce(number, nullif(m->>'number','')::int), played_on = coalesce(played_on, nullif(m->>'date','')::date),
             opponent = case when opponent like 'Match %' and nullif(m->>'opponent','') is not null then m->>'opponent' else opponent end where id = mid;
    end if;
    if nullif(m->>'goals_for','') is not null then update public.matches set goals_for = (m->>'goals_for')::int, goals_against = nullif(m->>'goals_against','')::int where id = mid; end if;
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

-- the dispatcher gives the match stats their competition from the path, so stats and reports meet on the same match
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
    when 'matchstats' then public.talent_apply_matchstats(f.project_id, v_team, p || jsonb_build_object('competition', public.talent_competition(f.path)))
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

-- match reports use the same competition name
create or replace function public.link_talent_content(p_project uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_plans int := 0; n_reports int := 0; n_eval int := 0; n_photos int := 0; n_docs int := 0; r record; v_num int; v_opp text; v_date date; v_mid uuid; v_season uuid;
begin
  -- training plans: any "Training Session … T<n>" pdf/pptx under a team folder
  insert into public.training_sessions(team_id, number, month, microcycle, file_id)
  select t.id, nullif(substring(f.name from 'T\s*(\d+)'), '')::int,
         (substring(f.path from '/(\d{4})/') || '-' || lpad(substring(f.path from '/\d{4}/(\d{1,2})\s*-'), 2, '0')),
         nullif(trim(substring(f.path from '/\d+\s*-\s*(Micro[a-z]*\s*\d+)')), ''), f.id
    from public.talent_files f join public.teams t on f.path like t.folder || '/%'
   where f.project_id = p_project and not f.is_folder and f.ext in ('pdf','pptx') and f.path ~* '/Training Se[as]+ons?/' and f.name ~* 'Training Session'
     and not exists (select 1 from public.training_sessions x where x.file_id = f.id);
  get diagnostics n_plans = row_count;
  update public.training_sessions s set microcycle = regexp_replace(s.microcycle, 'Microcyle', 'Microcycle') where s.microcycle like 'Microcyle%';
  update public.training_sessions s set microcycle = s.microcycle || ' ' || substring(f.path from '(\(\d{1,2}\.\d{1,2}\s*-\s*\d{1,2}\.\d{1,2}\))')
    from public.talent_files f where f.id = s.file_id and s.microcycle is not null and s.microcycle not like '%(%' and f.path ~ '\(\d{1,2}\.\d{1,2}\s*-\s*\d{1,2}\.\d{1,2}\)';

  -- match reports
  for r in select f.id, f.name, f.path, t.id as team_id, public.talent_competition(f.path) as comp
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
    if v_mid is null and v_date is not null then select id into v_mid from public.matches where team_id = r.team_id and competition = r.comp and played_on = v_date and report_file_id is null order by (opponent ilike '%' || coalesce(v_opp, opponent) || '%') desc limit 1; end if;
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

  -- player photos
  update public.players p set photo_file_id = f.id
    from public.talent_files f
   where f.project_id = p_project and not f.is_folder and f.ext in ('jpg','jpeg','png') and f.path ~* 'Players? Pictures' and p.project_id = p_project and p.merged_into is null and p.photo_file_id is null
     and public.talent_norm(p.first_name || ' ' || p.last_name) = public.talent_norm(regexp_replace(f.name, '\.[a-z]+$', '', 'i'));
  get diagnostics n_photos = row_count;

  -- player documents
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

revoke execute on function public.talent_apply_presence(uuid,uuid,jsonb), public.talent_apply_measurements(uuid,uuid,jsonb), public.talent_apply_squad(uuid,uuid,jsonb), public.talent_apply_matchstats(uuid,uuid,jsonb), public.talent_apply(uuid,text,jsonb), public.link_talent_content(uuid) from public, anon, authenticated;
