-- Tony Next · 0020 offline: idempotent requests and client-generated ids.
-- The app queues writes while the phone has no network and replays them later. A replay may repeat a request
-- that already arrived (the answer was lost on the way), so every write carries an x-mutation-id header and the
-- database applies each id once. PostgREST runs pre_request() at the start of every request.

create table if not exists public.client_mutations (
  id uuid primary key,
  user_id uuid,
  at timestamptz not null default now()
);
alter table public.client_mutations enable row level security;
create index if not exists client_mutations_at on public.client_mutations(at);

create or replace function public.pre_request() returns void
language plpgsql security definer set search_path = public as $$
declare mid text; v uuid;
begin
  mid := nullif(current_setting('request.headers', true)::json->>'x-mutation-id', '');
  if mid is null then return; end if;
  begin v := mid::uuid; exception when others then return; end;
  if exists (select 1 from public.client_mutations where id = v) then
    raise sqlstate 'PT409' using message = 'already applied', detail = 'mutation ' || mid;
  end if;
  insert into public.client_mutations(id, user_id) values (v, auth.uid());
exception when sqlstate 'PT409' then raise;
  when others then return; -- never block a request because of the bookkeeping
end $$;
revoke execute on function public.pre_request() from public;
grant execute on function public.pre_request() to authenticator, anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.pre_request';
notify pgrst, 'reload config';

-- old ids are not needed after a month
select cron.unschedule(jobid) from cron.job where jobname = 'tonynext-mutations-cleanup';
select cron.schedule('tonynext-mutations-cleanup', '30 4 * * *', $$delete from public.client_mutations where at < now() - interval '30 days'$$);

-- A new player or session may arrive with an id the phone chose, so a photo named after the player can be queued with it.
create or replace function public.coach_save_player(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid; v_first text; v_last text; v_year int; v_dist uuid;
begin
  select * into ctx from public.coach_ctx();
  v_first := nullif(trim(p->>'first_name'), ''); v_last := nullif(trim(p->>'last_name'), '');
  v_year := nullif(p->>'birth_year','')::int;
  if v_first is null or v_last is null then raise exception 'First and last name are required'; end if;
  if v_year is null or v_year < 1995 or v_year > extract(year from now())::int then raise exception 'Enter a valid birth year'; end if;
  select district_id into v_dist from public.academies where id = ctx.v_academy;
  perform set_config('pluribus.system', 'on', true);
  if p_id is null or not exists (select 1 from public.players where id = p_id) then
    if exists (select 1 from public.players where academy_id = ctx.v_academy and merged_into is null
                and lower(first_name) = lower(v_first) and lower(last_name) = lower(v_last) and birth_year = v_year) then
      raise exception 'This player is already in your squad';
    end if;
    insert into public.players(id, project_id, first_name, last_name, birth_year, birth_date, positions, preferred_foot,
                               guardian_name, guardian_phone, guardian_consent, coach_notes, academy_id, district_id, source, created_by,
                               photo_path, shirt_no, height_cm, weight_kg, measured_on, school, sector, joined_year, squad_status)
    values (coalesce(p_id, gen_random_uuid()), ctx.v_project, v_first, v_last, v_year, nullif(p->>'birth_date','')::date, nullif(p->>'positions',''), nullif(p->>'preferred_foot',''),
            nullif(p->>'guardian_name',''), nullif(p->>'guardian_phone',''), coalesce((p->>'guardian_consent')::boolean, false),
            nullif(p->>'coach_notes',''), ctx.v_academy, v_dist, 'portal', auth.uid(),
            nullif(p->>'photo_path',''), nullif(p->>'shirt_no','')::smallint, nullif(p->>'height_cm','')::numeric, nullif(p->>'weight_kg','')::numeric,
            case when nullif(p->>'height_cm','') is not null or nullif(p->>'weight_kg','') is not null then current_date end,
            nullif(p->>'school',''), nullif(p->>'sector',''), nullif(p->>'joined_year','')::int, coalesce(nullif(p->>'squad_status',''), 'active'))
    returning id into v_id;
  else
    update public.players set first_name = v_first, last_name = v_last, birth_year = v_year,
           birth_date = nullif(p->>'birth_date','')::date, positions = nullif(p->>'positions',''), preferred_foot = nullif(p->>'preferred_foot',''),
           guardian_name = nullif(p->>'guardian_name',''), guardian_phone = nullif(p->>'guardian_phone',''),
           guardian_consent = coalesce((p->>'guardian_consent')::boolean, false), coach_notes = nullif(p->>'coach_notes',''),
           photo_path = case when p ? 'photo_path' then nullif(p->>'photo_path','') else photo_path end,
           shirt_no = nullif(p->>'shirt_no','')::smallint,
           measured_on = case when nullif(p->>'height_cm','')::numeric is distinct from height_cm or nullif(p->>'weight_kg','')::numeric is distinct from weight_kg then current_date else measured_on end,
           height_cm = nullif(p->>'height_cm','')::numeric, weight_kg = nullif(p->>'weight_kg','')::numeric,
           school = nullif(p->>'school',''), sector = nullif(p->>'sector',''), joined_year = nullif(p->>'joined_year','')::int,
           squad_status = coalesce(nullif(p->>'squad_status',''), squad_status)
     where id = p_id and academy_id = ctx.v_academy
     returning id into v_id;
    if v_id is null then raise exception 'Player not found in your squad'; end if;
  end if;
  perform set_config('pluribus.system', 'off', true);
  return v_id;
end $$;


create or replace function public.coach_save_session(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid; v_day date; pid uuid;
begin
  select * into ctx from public.coach_ctx();
  v_day := nullif(p->>'held_on','')::date;
  if v_day is null or v_day > current_date then raise exception 'Enter the day of the session (today or earlier)'; end if;
  if v_day < current_date - 60 then raise exception 'Sessions can be logged up to 60 days back'; end if;
  if p_id is null or not exists (select 1 from public.academy_sessions where id = p_id) then
    insert into public.academy_sessions(id, academy_id, held_on, topic, duration_min, notes, created_by)
    values (coalesce(p_id, gen_random_uuid()), ctx.v_academy, v_day, nullif(p->>'topic',''), nullif(p->>'duration_min','')::int, nullif(p->>'notes',''), auth.uid())
    returning id into v_id;
  else
    update public.academy_sessions set held_on = v_day, topic = nullif(p->>'topic',''), duration_min = nullif(p->>'duration_min','')::int, notes = nullif(p->>'notes','')
     where id = p_id and academy_id = ctx.v_academy returning id into v_id;
    if v_id is null then raise exception 'Session not found'; end if;
    delete from public.academy_session_players where session_id = v_id;
  end if;
  for pid in select (x)::uuid from jsonb_array_elements_text(coalesce(p->'players', '[]'::jsonb)) x loop
    if exists (select 1 from public.players where id = pid and academy_id = ctx.v_academy) then
      insert into public.academy_session_players(session_id, player_id, present) values (v_id, pid, true) on conflict do nothing;
    end if;
  end loop;
  return v_id;
end $$;
