-- Pluribus · one-off import of the Tony teams from the Talent folder (seasons 2024-25, 2025-26, 2026-27)
-- Sources per team: "<team> squad", "Presence Control", "Speed Tests", "Weight and Height", "Match Control - Stats",
-- and "Evaluations - Tony EFP" per season. Read in the browser, cleaned there, sent to these temporary token-guarded
-- functions with the publishable key, then the functions are dropped. __TOKEN__ is replaced at run time.

create or replace function public.tmp_t_guard(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if p_token is distinct from '__TOKEN__' then raise exception 'not allowed'; end if;
  return (select id from public.projects order by created_at limit 1);
end $$;

create or replace function public.tmp_norm(p text) returns text
language sql immutable as $$
  select string_agg(t, ' ' order by t) from regexp_split_to_table(lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z ]', ' ', 'g')), '\s+') t where length(t) > 1
$$;

create or replace function public.tmp_t_players(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_proj uuid := public.tmp_t_guard(p_token); x jsonb; v_id uuid; v_out jsonb := '{}'; v_year int;
begin
  perform set_config('pluribus.system', 'on', true);
  for x in select * from jsonb_array_elements(p) loop
    v_year := nullif(x->>'year', '')::int;
    select id into v_id from public.players
     where merged_into is null and public.tmp_norm(first_name || ' ' || last_name) = public.tmp_norm(x->>'first' || ' ' || (x->>'last'))
       and (birth_year is null or v_year is null or birth_year = v_year)
     order by (pool_status = 'tony_squad') desc, created_at desc limit 1;
    if v_id is null then
      insert into public.players(project_id, first_name, last_name, birth_year, birth_date, positions, source, pool_status, staff_notes)
      values (v_proj, x->>'first', x->>'last', v_year, nullif(x->>'dob', '')::date, nullif(x->>'pos', ''), 'import',
              case when (x->>'tony')::boolean then 'tony_squad' else 'released' end, 'Added from the Tony team files in the Talent folder')
      returning id into v_id;
    else
      update public.players set
        birth_year = coalesce(birth_year, v_year), birth_date = coalesce(birth_date, nullif(x->>'dob', '')::date),
        positions = coalesce(positions, nullif(x->>'pos', '')),
        pool_status = case when (x->>'tony')::boolean then 'tony_squad' when pool_status = 'tony_squad' then pool_status else pool_status end
       where id = v_id;
    end if;
    v_out := v_out || jsonb_build_object(x->>'key', v_id);
  end loop;
  return v_out;
end $$;

create or replace function public.tmp_t_teams(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_proj uuid := public.tmp_t_guard(p_token); x jsonb; v_id uuid; v_out jsonb := '{}';
begin
  for x in select * from jsonb_array_elements(p) loop
    insert into public.teams(project_id, season_id, name, age_group, folder, sort)
    values (v_proj, (select id from public.seasons where label = x->>'season'), x->>'name', x->>'age', x->>'folder', (x->>'sort')::int)
    on conflict (season_id, name) do update set folder = excluded.folder
    returning id into v_id;
    v_out := v_out || jsonb_build_object(x->>'key', v_id);
  end loop;
  return v_out;
end $$;

create or replace function public.tmp_t_rows(p_token text, p_kind text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_proj uuid := public.tmp_t_guard(p_token); n int := 0; x jsonb; v_id uuid; v_out jsonb := '{}';
begin
  perform set_config('pluribus.system', 'on', true);
  if p_kind = 'team_players' then
    insert into public.team_players(team_id, player_id, position, slot)
    select (e->>'team')::uuid, (e->>'player')::uuid, nullif(e->>'pos',''), nullif(e->>'slot','')::int from jsonb_array_elements(p) e
    on conflict (team_id, player_id) do nothing;
  elsif p_kind = 'days' then
    for x in select * from jsonb_array_elements(p) loop
      insert into public.team_days(team_id, day, seq, kind, minutes) values ((x->>'team')::uuid, (x->>'day')::date, (x->>'seq')::int, x->>'kind', nullif(x->>'minutes','')::int)
      on conflict (team_id, day, seq) do update set kind = excluded.kind returning id into v_id;
      v_out := v_out || jsonb_build_object(x->>'key', v_id);
    end loop;
    return v_out;
  elsif p_kind = 'attendance' then
    insert into public.attendance(day_id, player_id, minutes, code)
    select (e->>'day')::uuid, (e->>'player')::uuid, nullif(e->>'minutes','')::int, nullif(e->>'code','') from jsonb_array_elements(p) e
    on conflict (day_id, player_id) do nothing;
  elsif p_kind = 'measurements' then
    insert into public.measurements(player_id, team_id, taken_on, metric, value)
    select (e->>'player')::uuid, (e->>'team')::uuid, nullif(e->>'date','')::date, e->>'metric', (e->>'value')::numeric from jsonb_array_elements(p) e;
  elsif p_kind = 'matches' then
    for x in select * from jsonb_array_elements(p) loop
      insert into public.matches(team_id, number, competition, opponent, venue, goals_for, goals_against)
      values ((x->>'team')::uuid, nullif(x->>'number','')::int, x->>'competition', x->>'opponent', nullif(x->>'venue',''), nullif(x->>'gf','')::int, nullif(x->>'ga','')::int)
      returning id into v_id;
      v_out := v_out || jsonb_build_object(x->>'key', v_id);
    end loop;
    return v_out;
  elsif p_kind = 'match_players' then
    insert into public.match_players(match_id, player_id, goals, assists, yellow, red)
    select (e->>'match')::uuid, (e->>'player')::uuid, (e->>'goals')::int, (e->>'assists')::int, (e->>'yellow')::int, (e->>'red')::int from jsonb_array_elements(p) e
    on conflict (match_id, player_id) do nothing;
  elsif p_kind = 'evaluations' then
    insert into public.evaluations(player_id, season_id, grade)
    select (e->>'player')::uuid, (select id from public.seasons where label = e->>'season'), e->>'grade' from jsonb_array_elements(p) e
    on conflict (player_id, season_id) do update set grade = excluded.grade;
  end if;
  get diagnostics n = row_count;
  return to_jsonb(n);
end $$;

grant execute on function public.tmp_t_players(text, jsonb), public.tmp_t_teams(text, jsonb), public.tmp_t_rows(text, text, jsonb) to anon;

-- After the import:
-- drop function public.tmp_t_players(text, jsonb), public.tmp_t_teams(text, jsonb), public.tmp_t_rows(text, text, jsonb), public.tmp_t_guard(text), public.tmp_norm(text);
