-- Pluribus · one-off import of scouting history from the Talent folder
-- Source: Talent/Season 2024-2025/Scouting/Data Base and Talent/Season 2025-2026/Scouting/Data Base
--   (5 province workbooks + the national finals workbook per season).
-- A "Season X/Scouting" folder scouts FOR the next season: 2024-25 files -> season 2025-2026, 2025-26 files -> 2026-2027.
-- The workbooks are read in the browser (signed in to SharePoint), cleaned there, and sent to these temporary
-- token-guarded functions with the publishable key. The functions are dropped right after the import.
-- __TOKEN__ is replaced by a one-time random value at run time and never stored in the repository.

insert into public.age_groups(season_id, code, birth_year_from, birth_year_to, sort)
select s.id, g.code, g.f + d.shift, g.t + d.shift, g.sort
  from public.seasons s
  join (values ('2026-2027', -1), ('2025-2026', -2)) d(label, shift) on d.label = s.label
  cross join (values ('U11', 2016, 2017, 1), ('U13', 2014, 2015, 2), ('U15', 2012, 2013, 3)) g(code, f, t, sort)
on conflict (season_id, code) do nothing;

create or replace function public.tmp_hist_guard(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if p_token is distinct from '__TOKEN__' then raise exception 'not allowed'; end if;
  return (select id from public.projects order by created_at limit 1);
end $$;

create or replace function public.tmp_hist_district(p text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.districts where regexp_replace(upper(name), '[^A-Z]', '', 'g') = regexp_replace(upper(coalesce(p, '')), '[^A-Z]', '', 'g') limit 1
$$;

create or replace function public.tmp_hist_academies(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_proj uuid := public.tmp_hist_guard(p_token); x jsonb; v_id uuid; v_out jsonb := '{}';
begin
  for x in select * from jsonb_array_elements(p) loop
    select id into v_id from public.academies
     where project_id = v_proj and upper(name) = upper(x->>'name') and district_id is not distinct from public.tmp_hist_district(x->>'district');
    if v_id is null then
      insert into public.academies(project_id, name, district_id, is_active, notes)
      values (v_proj, x->>'name', public.tmp_hist_district(x->>'district'), true, 'Added from the scouting history in the Talent folder (' || (x->>'seasons') || ')')
      returning id into v_id;
    end if;
    v_out := v_out || jsonb_build_object(x->>'key', v_id);
  end loop;
  return v_out;
end $$;

create or replace function public.tmp_hist_camps(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_proj uuid := public.tmp_hist_guard(p_token); x jsonb; v_id uuid; v_out jsonb := '{}'; v_dist uuid; v_reg uuid;
begin
  for x in select * from jsonb_array_elements(p) loop
    v_dist := public.tmp_hist_district(x->>'district');
    v_reg := coalesce((select id from public.regions where name = x->>'region'), (select region_id from public.districts where id = v_dist));
    insert into public.camps(project_id, season_id, stage, name, region_id, district_id, age_groups, starts_on, ends_on, venue, status, submissions_open, notes, sort_key)
    values (v_proj, (select id from public.seasons where label = x->>'season'), (x->>'stage')::public.camp_stage, x->>'name',
            v_reg, case when x->>'stage' = 'district' then v_dist end,
            coalesce((select array_agg(e) from jsonb_array_elements_text(x->'age_groups') e), '{U11,U13,U15}'),
            nullif(x->>'date','')::date, nullif(x->>'date','')::date, null, 'published', false,
            'Imported from the Talent folder: ' || (x->>'source'), nullif(x->>'sort','')::int)
    returning id into v_id;
    v_out := v_out || jsonb_build_object(x->>'key', v_id);
  end loop;
  return v_out;
end $$;

create or replace function public.tmp_hist_players(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_proj uuid := public.tmp_hist_guard(p_token); x jsonb; v_id uuid; v_out jsonb := '{}';
begin
  perform set_config('pluribus.system', 'on', true);
  for x in select * from jsonb_array_elements(p) loop
    insert into public.players(project_id, first_name, last_name, birth_year, age_status, positions, academy_id, district_id, source, staff_notes)
    values (v_proj, x->>'first', x->>'last', nullif(x->>'year','')::int, case when (x->>'doubtful')::boolean then 'doubtful' else 'declared' end,
            nullif(x->>'positions',''), nullif(x->>'academy','')::uuid, public.tmp_hist_district(x->>'district'), 'import', nullif(x->>'notes',''))
    returning id into v_id;
    v_out := v_out || jsonb_build_object(x->>'key', v_id);
  end loop;
  return v_out;
end $$;

create or replace function public.tmp_hist_parts(p_token text, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_proj uuid := public.tmp_hist_guard(p_token); n int;
begin
  insert into public.camp_participants(camp_id, player_id, age_group, status, sprint_10m, sprint_20m, cj_cm, obs, decision, is_goalkeeper, grade_a,
                                       position, team, comment, absence_reason, decision_published)
  select (x->>'camp')::uuid, (x->>'player')::uuid, nullif(x->>'group',''), x->>'status',
         nullif(x->>'s10','')::numeric, nullif(x->>'s20','')::numeric, nullif(x->>'cj','')::numeric, nullif(x->>'obs',''), nullif(x->>'decision',''),
         coalesce((x->>'gk')::boolean, false), coalesce((x->>'a')::boolean, false), nullif(x->>'position',''), nullif(x->>'team',''),
         nullif(x->>'comment',''), nullif(x->>'reason',''), true
    from jsonb_array_elements(p) x
  on conflict (camp_id, player_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.tmp_hist_academies(text, jsonb), public.tmp_hist_camps(text, jsonb), public.tmp_hist_players(text, jsonb), public.tmp_hist_parts(text, jsonb) to anon;

-- After the import:
-- drop function public.tmp_hist_academies(text, jsonb), public.tmp_hist_camps(text, jsonb), public.tmp_hist_players(text, jsonb),
--               public.tmp_hist_parts(text, jsonb), public.tmp_hist_guard(text), public.tmp_hist_district(text);
