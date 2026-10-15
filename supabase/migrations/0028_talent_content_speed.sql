-- Tony Next · 0028 content sync: fast name matching (a stored name key on players) and a time budget for the apply functions.

-- the normalised name of every player, kept by trigger, so that names from the files are an index lookup
alter table public.players add column if not exists name_key text;
create or replace function public.players_name_key() returns trigger
language plpgsql as $$
begin
  new.name_key := public.talent_norm(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  return new;
end $$;
drop trigger if exists players_name_key on public.players;
create trigger players_name_key before insert or update of first_name, last_name on public.players for each row execute function public.players_name_key();
update public.players set name_key = public.talent_norm(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) where name_key is null;
create index if not exists players_name_key_idx on public.players(project_id, name_key) where merged_into is null;

create or replace function public.talent_match_player(p_project uuid, p_raw text, p_team uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare n record; v_id uuid; v_first text; v_last text; parts text[]; k text;
begin
  select * into n from public.talent_parse_name(p_raw);
  if n.o_name is null or n.o_name = '' then return null; end if;
  k := public.talent_norm(n.o_name);
  if k is null or k = '' then return null; end if;
  -- 1. already in this team
  if p_team is not null then
    select p.id into v_id from public.team_players tp join public.players p on p.id = tp.player_id
     where tp.team_id = p_team and p.merged_into is null and p.name_key = k limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  -- 2. any Tony player of the project with the same name (squad players first, then by year if the name carries one)
  select p.id into v_id from public.players p
   where p.project_id = p_project and p.merged_into is null and p.name_key = k
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

create or replace function public.link_talent_content(p_project uuid) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
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
    v_opp := public.talent_norm(trim(regexp_replace(regexp_replace(r.name, '\.pdf$', '', 'i'), '^.*?-\s*', '')));
    select p.id into v_mid from public.players p where p.project_id = p_project and p.merged_into is null and p.name_key = v_opp order by (p.pool_status = 'tony_squad') desc limit 1;
    if v_mid is not null and v_season is not null then
      insert into public.evaluations(player_id, season_id, report_file_id) values (v_mid, v_season, r.id)
      on conflict (player_id, season_id) do update set report_file_id = coalesce(evaluations.report_file_id, excluded.report_file_id);
      n_eval := n_eval + 1;
    end if;
  end loop;

  -- player photos: a picture whose file name is the player's name
  with pics as (
    select f.id, public.talent_norm(regexp_replace(f.name, '\.[a-z]+$', '', 'i')) as k
      from public.talent_files f where f.project_id = p_project and not f.is_folder and f.ext in ('jpg','jpeg','png') and f.path ~* 'Players? Pictures')
  update public.players p set photo_file_id = pics.id from pics
   where p.project_id = p_project and p.merged_into is null and p.photo_file_id is null and p.name_key = pics.k and pics.k <> '';
  get diagnostics n_photos = row_count;

  -- player documents: a file under Players Documents whose folder or name carries the player's name
  with docs as (
    select f.id, f.name, f.path, public.talent_norm(regexp_replace(f.name, '\.[a-z]+$', '', 'i')) as k1,
           public.talent_norm(split_part(f.parent, '/', array_length(string_to_array(f.parent, '/'), 1))) as k2
      from public.talent_files f where f.project_id = p_project and not f.is_folder and f.path like 'Players Documents/%'
       and not exists (select 1 from public.player_documents d where d.file_id = f.id))
  insert into public.player_documents(player_id, kind, notes, file_id)
  select p.id, case when d.path ~* 'contract' then 'contract' when d.path ~* 'health' then 'health' when d.path ~* 'birth' then 'birth_certificate' else 'other' end, d.name, d.id
    from docs d join public.players p on p.project_id = p_project and p.merged_into is null and p.name_key <> '' and (p.name_key = d.k1 or p.name_key = d.k2);
  get diagnostics n_docs = row_count;

  return jsonb_build_object('plans', n_plans, 'reports', n_reports, 'evaluations', n_eval, 'photos', n_photos, 'documents', n_docs);
end $$;

create or replace function public.talent_apply(p_file uuid, p_kind text, p jsonb) returns int
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
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

-- the squad board and the apply functions look players up by the key as well
create or replace function public.talent_apply_squad(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; pid uuid; n int := 0; nm record;
begin
  if p_team is null then return 0; end if;
  for r in select * from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) loop
    select * into nm from public.talent_parse_name(r->>'name');
    select pl.id into pid from public.team_players tp join public.players pl on pl.id = tp.player_id
     where tp.team_id = p_team and pl.merged_into is null and pl.name_key = public.talent_norm(nm.o_name) limit 1;
    if pid is null then continue; end if;
    update public.team_players set slot = coalesce(nullif(r->>'slot','')::int, slot) where team_id = p_team and player_id = pid;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.talent_match_player(uuid,text,uuid), public.link_talent_content(uuid), public.talent_apply(uuid,text,jsonb), public.talent_apply_squad(uuid,uuid,jsonb) from public, anon, authenticated;
