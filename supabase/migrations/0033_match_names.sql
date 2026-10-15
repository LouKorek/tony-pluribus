-- Tony Next · 0033 matches: report names in any case ("6TH - U20 MATCH REPORT - Young Boys FC.pdf"), venue from the stats header.
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
      insert into public.matches(team_id, number, played_on, competition, opponent, venue) values (p_team, nullif(m->>'number','')::int, nullif(m->>'date','')::date, v_comp, coalesce(nullif(m->>'opponent',''), 'Match ' || coalesce(m->>'number', m->>'date', '')), nullif(m->>'venue',''))
      returning id into mid;
    else
      update public.matches set number = coalesce(number, nullif(m->>'number','')::int), played_on = coalesce(played_on, nullif(m->>'date','')::date), venue = coalesce(nullif(m->>'venue',''), venue),
             opponent = case when (opponent like 'Match %' or opponent is null) and nullif(m->>'opponent','') is not null then m->>'opponent' else opponent end where id = mid;
    end if;
    if nullif(m->>'goals_for','') is not null then update public.matches set goals_for = (m->>'goals_for')::int, goals_against = nullif(m->>'goals_against','')::int where id = mid; end if;
    ids := array_append(ids, mid);
  end loop;
  if jsonb_array_length(coalesce(p->'matches', '[]'::jsonb)) > 0 then
    delete from public.matches where team_id = p_team and competition = v_comp and report_file_id is null and not (id = any(ids));
  end if;
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

create or replace function public.link_talent_content(p_project uuid) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare n_plans int := 0; n_reports int := 0; n_eval int := 0; n_photos int := 0; n_docs int := 0; r record; v_num int; v_opp text; v_date date; v_mid uuid; v_season uuid; v_base text;
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

  -- match reports: "<n>th U-13 - MATCH REPORT vs <opponent> <d Month yyyy>.pdf", "<n>th - U20 MATCH REPORT - <opponent> - dd.mm.yy.pdf", "6TH - U20 MATCH REPORT - Young Boys FC.pdf"
  for r in select f.id, f.name, f.path, t.id as team_id, public.talent_competition(f.path) as comp
             from public.talent_files f join public.teams t on f.path like t.folder || '/%'
            where f.project_id = p_project and not f.is_folder and f.ext = 'pdf' and f.name ~* 'MATCH REPORT'
              and not exists (select 1 from public.matches m where m.report_file_id = f.id) loop
    v_base := regexp_replace(r.name, '\.pdf$', '', 'i');
    v_num := nullif(substring(v_base from '(?i)^\s*(\d+)\s*(?:st|nd|rd|th)'), '')::int;
    v_opp := null; v_date := null;
    if v_base ~ '\d{1,2}\s+[A-Za-z]+\s+\d{4}' then
      begin v_date := to_date(substring(v_base from '(\d{1,2}\s+[A-Za-z]+\s+\d{4})'), 'DD Month YYYY'); exception when others then v_date := null; end;
      v_base := regexp_replace(v_base, '\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*$', '');
    elsif v_base ~ '\d{1,2}[./]\d{1,2}[./]\d{2,4}' then
      begin v_date := to_date(regexp_replace(substring(v_base from '(\d{1,2}[./]\d{1,2}[./]\d{2,4})'), '/', '.', 'g'), case when substring(v_base from '\d{1,2}[./]\d{1,2}[./](\d{2,4})') ~ '^\d{4}$' then 'DD.MM.YYYY' else 'DD.MM.YY' end); exception when others then v_date := null; end;
      v_base := regexp_replace(v_base, '\s*-?\s*\d{1,2}[./]\d{1,2}[./]\d{2,4}\s*$', '');
    end if;
    if v_base ~* '\svs\.?\s' then
      v_opp := substring(v_base from '(?i)\svs\.?\s+(.*)$');
    elsif v_base ~* 'MATCH REPORT\s*-?\s*' then
      v_opp := substring(v_base from '(?i)MATCH REPORT\s*-?\s*(.*)$');
    end if;
    v_opp := nullif(trim(regexp_replace(coalesce(v_opp, ''), '\s+', ' ', 'g')), '');
    v_mid := null;
    if v_num is not null then select id into v_mid from public.matches where team_id = r.team_id and competition = r.comp and number = v_num and report_file_id is null limit 1; end if;
    if v_mid is null and v_date is not null then select id into v_mid from public.matches where team_id = r.team_id and competition = r.comp and played_on = v_date and report_file_id is null order by (opponent ilike '%' || coalesce(v_opp, opponent) || '%') desc limit 1; end if;
    if v_mid is null then
      insert into public.matches(team_id, number, played_on, competition, opponent, report_file_id) values (r.team_id, v_num, v_date, r.comp, coalesce(v_opp, 'Match ' || coalesce(v_num::text, '')), r.id) returning id into v_mid;
    else
      update public.matches set report_file_id = r.id, played_on = coalesce(played_on, v_date), number = coalesce(number, v_num),
             opponent = case when (opponent like 'Match %' or opponent is null) and v_opp is not null then v_opp else opponent end where id = v_mid;
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
revoke execute on function public.talent_apply_matchstats(uuid,uuid,jsonb), public.link_talent_content(uuid) from public, anon, authenticated;

-- reports that were linked without a number or an opponent are linked again; the stats files are read again
delete from public.matches where report_file_id is not null and (number is null and played_on is null or opponent like 'Match%');
update public.talent_content set parsed_modified_at = null, attempts = 0, error = null where kind = 'matchstats';
