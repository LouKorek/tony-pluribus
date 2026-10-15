-- Tony Next · 0035 one reading of a match-report file name, used when linking and to repair what older readings wrote.
-- "11st - 3rd DIV MATCH REPORT - 1st Knockout Stage vs INYANGE FC (H) (6-1) (H) (W) - 15.03.26.pdf"
-- -> number 11, opponent "INYANGE FC", venue home, 6-1, 15.03.2026
create or replace function public.talent_report_info(p_name text, out o_number int, out o_date date, out o_opponent text, out o_venue text, out o_gf int, out o_ga int)
language plpgsql immutable as $$
declare s text; m text[];
begin
  s := regexp_replace(coalesce(p_name, ''), '\.pdf$', '', 'i');
  o_number := nullif(substring(s from '(?i)^\s*(\d+)\s*(?:st|nd|rd|th)'), '')::int;
  if s ~ '\d{1,2}\s+[A-Za-z]+\s+\d{4}' then
    begin o_date := to_date(substring(s from '(\d{1,2}\s+[A-Za-z]+\s+\d{4})'), 'DD Month YYYY'); exception when others then o_date := null; end;
    s := regexp_replace(s, '\s*-?\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*$', '');
  elsif s ~ '\d{1,2}[./]\d{1,2}[./]\d{2,4}' then
    m := regexp_match(s, '(\d{1,2})[./](\d{1,2})[./](\d{2,4})');
    begin o_date := make_date(case when length(m[3]) = 2 then 2000 + m[3]::int else m[3]::int end, m[2]::int, m[1]::int); exception when others then o_date := null; end;
    s := regexp_replace(s, '\s*-?\s*\d{1,2}[./]\d{1,2}[./]\d{2,4}\s*$', '');
  end if;
  m := regexp_match(s, '\(\s*(\d+)\s*-\s*(\d+)\s*\)');
  if m is not null then o_gf := m[1]::int; o_ga := m[2]::int; end if;
  o_venue := case when s ~* '\(H\)' then 'home' when s ~* '\(A\)' then 'away' end;
  if s ~* '\svs\.?\s' then o_opponent := substring(s from '(?i)\svs\.?\s+(.*)$');
  elsif s ~* 'MATCH REPORT\s*-?\s*' then o_opponent := substring(s from '(?i)MATCH REPORT\s*-?\s*(.*)$');
  end if;
  if o_opponent is not null then
    o_opponent := regexp_replace(o_opponent, '\(\s*\d+\s*-\s*\d+\s*\)', ' ', 'g');
    o_opponent := regexp_replace(o_opponent, '\((H|A|W|L|D)\)', ' ', 'gi');
    o_opponent := regexp_replace(o_opponent, '(?i)\d+(st|nd|rd|th)\s+[A-Za-z ]*stage\s*(vs)?', ' ', 'g');
    o_opponent := trim(both ' -/' from regexp_replace(o_opponent, '\s+', ' ', 'g'));
    o_opponent := nullif(o_opponent, '');
  end if;
end $$;

create or replace function public.link_talent_content(p_project uuid) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare n_plans int := 0; n_reports int := 0; n_eval int := 0; n_photos int := 0; n_docs int := 0; r record; i record; v_mid uuid; v_season uuid; v_opp text;
begin
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

  for r in select f.id, f.name, f.path, t.id as team_id, public.talent_competition(f.path) as comp
             from public.talent_files f join public.teams t on f.path like t.folder || '/%'
            where f.project_id = p_project and not f.is_folder and f.ext = 'pdf' and f.name ~* 'MATCH REPORT'
              and not exists (select 1 from public.matches m where m.report_file_id = f.id) loop
    select * into i from public.talent_report_info(r.name);
    v_mid := null;
    if i.o_number is not null then select id into v_mid from public.matches where team_id = r.team_id and competition = r.comp and number = i.o_number and report_file_id is null limit 1; end if;
    if v_mid is null and i.o_date is not null then select id into v_mid from public.matches where team_id = r.team_id and competition = r.comp and played_on = i.o_date and report_file_id is null order by (opponent ilike '%' || coalesce(i.o_opponent, opponent) || '%') desc limit 1; end if;
    if v_mid is null then
      insert into public.matches(team_id, number, played_on, competition, opponent, venue, goals_for, goals_against, report_file_id)
      values (r.team_id, i.o_number, i.o_date, r.comp, coalesce(i.o_opponent, 'Match ' || coalesce(i.o_number::text, '')), i.o_venue, i.o_gf, i.o_ga, r.id) returning id into v_mid;
    else
      update public.matches set report_file_id = r.id, played_on = coalesce(played_on, i.o_date), number = coalesce(number, i.o_number), venue = coalesce(venue, i.o_venue),
             goals_for = coalesce(goals_for, i.o_gf), goals_against = coalesce(goals_against, i.o_ga),
             opponent = case when (opponent like 'Match %' or opponent is null) and i.o_opponent is not null then i.o_opponent else opponent end where id = v_mid;
    end if;
    n_reports := n_reports + 1;
  end loop;

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

  with pics as (
    select f.id, public.talent_norm(regexp_replace(f.name, '\.[a-z]+$', '', 'i')) as k
      from public.talent_files f where f.project_id = p_project and not f.is_folder and f.ext in ('jpg','jpeg','png') and f.path ~* 'Players? Pictures')
  update public.players p set photo_file_id = pics.id from pics
   where p.project_id = p_project and p.merged_into is null and p.photo_file_id is null and p.name_key = pics.k and pics.k <> '';
  get diagnostics n_photos = row_count;

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
revoke execute on function public.link_talent_content(uuid) from public, anon, authenticated;

-- repair every match that carries a report: number, date, opponent, venue and score as the file name says
update public.matches m set number = coalesce(m.number, i.o_number), played_on = coalesce(m.played_on, i.o_date), opponent = coalesce(i.o_opponent, m.opponent),
       venue = coalesce(m.venue, i.o_venue), goals_for = coalesce(m.goals_for, i.o_gf), goals_against = coalesce(m.goals_against, i.o_ga)
  from public.talent_files f, lateral public.talent_report_info(f.name) i where f.id = m.report_file_id;
-- stats files are read again (their matches rebuilt)
delete from public.matches where report_file_id is null and exists (select 1 from public.talent_content c join public.talent_files f on f.id = c.file_id where c.kind = 'matchstats' and public.talent_team_for(f.path) = matches.team_id and public.talent_competition(f.path) = matches.competition);
update public.talent_content set parsed_modified_at = null, attempts = 0, error = null where kind = 'matchstats';
