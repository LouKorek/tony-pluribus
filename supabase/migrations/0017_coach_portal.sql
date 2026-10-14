-- Tony Next · 0017 coach portal 2.0: the coach manages his team (player profiles, training sessions, academy profile),
-- sees when his academy comes to a camp (camp days and bookings), and the academy has a status in the programme.

-- ───────── Player profile: the coach's fields ─────────
alter table public.players add column if not exists photo_path text;
alter table public.players add column if not exists shirt_no smallint;
alter table public.players add column if not exists height_cm numeric(5,1);
alter table public.players add column if not exists weight_kg numeric(5,1);
alter table public.players add column if not exists measured_on date;
alter table public.players add column if not exists school text;
alter table public.players add column if not exists sector text;
alter table public.players add column if not exists joined_year int;
alter table public.players add column if not exists squad_status text not null default 'active' check (squad_status in ('active','left','unavailable'));

create table if not exists public.player_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  by uuid references public.profiles(id),
  at timestamptz not null default now(),
  kind text not null default 'note' check (kind in ('note','match','absent','measure','status','injury')),
  text text,
  data jsonb not null default '{}'::jsonb
);
create index if not exists player_log_player on public.player_log(player_id, at desc);
alter table public.player_log enable row level security;
drop policy if exists player_log_staff_read on public.player_log;
create policy player_log_staff_read on public.player_log for select to authenticated using (public.is_staff());
drop policy if exists player_log_staff_write on public.player_log;
create policy player_log_staff_write on public.player_log for all to authenticated using (public.can('players', 2)) with check (public.can('players', 2));

-- ───────── Academy profile and status in the programme ─────────
alter table public.academies add column if not exists venue text;
alter table public.academies add column if not exists training_days text[] not null default '{}';
alter table public.academies add column if not exists training_time text;
alter table public.academies add column if not exists players_count int;
alter table public.academies add column if not exists age_groups text[] not null default '{}';
alter table public.academies add column if not exists photo_path text;
alter table public.academies add column if not exists programme_status text not null default 'registered' check (programme_status in ('registered','observed','partner','official'));
alter table public.academies add column if not exists profile_updated_at timestamptz;

-- ───────── Training sessions logged by the coach ─────────
create table if not exists public.academy_sessions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  held_on date not null,
  topic text,
  duration_min int,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (academy_id, held_on, topic)
);
create index if not exists academy_sessions_academy on public.academy_sessions(academy_id, held_on desc);
create table if not exists public.academy_session_players (
  session_id uuid not null references public.academy_sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  present boolean not null default true,
  primary key (session_id, player_id)
);
alter table public.academy_sessions enable row level security;
alter table public.academy_session_players enable row level security;
drop policy if exists academy_sessions_staff on public.academy_sessions;
create policy academy_sessions_staff on public.academy_sessions for select to authenticated using (public.is_staff());
drop policy if exists academy_session_players_staff on public.academy_session_players;
create policy academy_session_players_staff on public.academy_session_players for select to authenticated using (public.is_staff());

-- ───────── Camp days and academy bookings ─────────
create table if not exists public.camp_days (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  day_date date not null,
  start_time time,
  end_time time,
  capacity_players int,
  notes text,
  sort int not null default 0,
  unique (camp_id, day_date, start_time)
);
create table if not exists public.camp_bookings (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  academy_id uuid not null references public.academies(id) on delete cascade,
  day_id uuid references public.camp_days(id) on delete set null,
  report_time time,
  players_expected int,
  status text not null default 'proposed' check (status in ('proposed','confirmed','change_requested','declined','arrived')),
  coach_note text,
  staff_note text,
  set_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  arrived_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (camp_id, academy_id)
);
create index if not exists camp_bookings_academy on public.camp_bookings(academy_id);
alter table public.camp_days enable row level security;
alter table public.camp_bookings enable row level security;
drop policy if exists camp_days_read on public.camp_days;
create policy camp_days_read on public.camp_days for select to authenticated using (public.is_staff());
drop policy if exists camp_days_write on public.camp_days;
create policy camp_days_write on public.camp_days for all to authenticated
  using (public.can('camps', 2) and public.in_my_regions(public.camp_region(camp_id))) with check (public.can('camps', 2) and public.in_my_regions(public.camp_region(camp_id)));
drop policy if exists camp_bookings_read on public.camp_bookings;
create policy camp_bookings_read on public.camp_bookings for select to authenticated using (public.is_staff());
drop policy if exists camp_bookings_write on public.camp_bookings;
create policy camp_bookings_write on public.camp_bookings for all to authenticated
  using (public.can('camps', 2) and public.in_my_regions(public.camp_region(camp_id))) with check (public.can('camps', 2) and public.in_my_regions(public.camp_region(camp_id)));
drop trigger if exists camp_bookings_touch on public.camp_bookings;
create trigger camp_bookings_touch before update on public.camp_bookings for each row execute function public.touch_updated_at();
do $$ declare t text; begin
  foreach t in array array['camp_bookings','academy_sessions','player_log'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- Staff set or change a day → the academy's coaches hear it.
create or replace function public.notify_coaches_of_academy(p_type text, p_academy uuid, p_title text, p_body text, p_link text, p_data jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0;
begin
  for u in select id from public.profiles where academy_id = p_academy and role = 'coach' and status = 'active' loop
    if public.notify(p_type, u.id, p_title, p_body, p_link, p_data) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.notify_coaches_of_academy(text,uuid,text,text,text,jsonb) from public, anon, authenticated;
create or replace function public.camp_bookings_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.camps; d public.camp_days; v_role public.app_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'coach' or new.day_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.day_id is not distinct from old.day_id and new.report_time is not distinct from old.report_time then return null; end if;
  select * into c from public.camps where id = new.camp_id;
  select * into d from public.camp_days where id = new.day_id;
  perform public.notify_coaches_of_academy('camp.day_assigned', new.academy_id,
    'Your day at ' || c.name || ': ' || to_char(d.day_date, 'Dy DD Mon'),
    'Report at ' || coalesce(to_char(coalesce(new.report_time, d.start_time), 'HH24:MI'), 'the start') || coalesce(' · ' || c.venue, '') || '. Please confirm in the Schedule.',
    '/schedule', jsonb_build_object('camp_id', c.id, 'booking_id', new.id));
  return null;
end $$;

drop trigger if exists camp_bookings_notify on public.camp_bookings;
create trigger camp_bookings_notify after insert or update on public.camp_bookings for each row
  when (new.academy_id is not null) execute function public.camp_bookings_notify();

-- ───────── Photos: a private bucket, signed links ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('squad-photos', 'squad-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists squad_photos_coach_write on storage.objects;
create policy squad_photos_coach_write on storage.objects for insert to authenticated
  with check (bucket_id = 'squad-photos' and split_part(name, '/', 1) = public.my_academy()::text);
drop policy if exists squad_photos_coach_update on storage.objects;
create policy squad_photos_coach_update on storage.objects for update to authenticated
  using (bucket_id = 'squad-photos' and split_part(name, '/', 1) = public.my_academy()::text);
drop policy if exists squad_photos_coach_delete on storage.objects;
create policy squad_photos_coach_delete on storage.objects for delete to authenticated
  using (bucket_id = 'squad-photos' and split_part(name, '/', 1) = public.my_academy()::text);
drop policy if exists squad_photos_read on storage.objects;
create policy squad_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'squad-photos' and (public.is_staff() or split_part(name, '/', 1) = public.my_academy()::text));

-- ───────── Coach functions ─────────
-- coach_save_player: the full profile
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
  if p_id is null then
    if exists (select 1 from public.players where academy_id = ctx.v_academy and merged_into is null
                and lower(first_name) = lower(v_first) and lower(last_name) = lower(v_last) and birth_year = v_year) then
      raise exception 'This player is already in your squad';
    end if;
    insert into public.players(project_id, first_name, last_name, birth_year, birth_date, positions, preferred_foot,
                               guardian_name, guardian_phone, guardian_consent, coach_notes, academy_id, district_id, source, created_by,
                               photo_path, shirt_no, height_cm, weight_kg, measured_on, school, sector, joined_year, squad_status)
    values (ctx.v_project, v_first, v_last, v_year, nullif(p->>'birth_date','')::date, nullif(p->>'positions',''), nullif(p->>'preferred_foot',''),
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

-- coach_squad: the profile plus the last log lines
create or replace function public.coach_squad() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'birth_year', p.birth_year, 'birth_date', p.birth_date,
      'positions', p.positions, 'preferred_foot', p.preferred_foot, 'guardian_name', p.guardian_name, 'guardian_phone', p.guardian_phone,
      'guardian_consent', p.guardian_consent, 'coach_notes', p.coach_notes, 'created_at', p.created_at,
      'photo_path', p.photo_path, 'shirt_no', p.shirt_no, 'height_cm', p.height_cm, 'weight_kg', p.weight_kg, 'measured_on', p.measured_on,
      'school', p.school, 'sector', p.sector, 'joined_year', p.joined_year, 'squad_status', p.squad_status, 'pool_status', p.pool_status,
      'sessions', (select count(*) from public.academy_session_players sp join public.academy_sessions s on s.id = sp.session_id where sp.player_id = p.id and sp.present and s.held_on > current_date - 90),
      'log', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'kind', l.kind, 'text', l.text) order by l.at desc)
                         from (select * from public.player_log where player_id = p.id order by at desc limit 12) l), '[]'::jsonb),
      'journey', coalesce((select jsonb_agg(public.coach_view_participation(cp, c) order by c.starts_on nulls last)
                             from public.camp_participants cp join public.camps c on c.id = cp.camp_id
                            where cp.player_id = p.id and cp.status <> 'removed'), '[]'::jsonb)
    ) order by p.squad_status = 'active' desc, p.last_name, p.first_name)
      from public.players p
     where p.academy_id = ctx.v_academy and p.merged_into is null and p.archived_at is null), '[]'::jsonb);
end $$;

create or replace function public.coach_log_player(p_player uuid, p_kind text, p_text text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid;
begin
  select * into ctx from public.coach_ctx();
  if not exists (select 1 from public.players where id = p_player and academy_id = ctx.v_academy) then raise exception 'Player not found in your squad'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'Write something first'; end if;
  insert into public.player_log(player_id, by, kind, text) values (p_player, auth.uid(), coalesce(nullif(p_kind, ''), 'note'), trim(p_text)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.coach_delete_log(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  delete from public.player_log l using public.players p where l.id = p_id and p.id = l.player_id and p.academy_id = ctx.v_academy and l.by = auth.uid();
end $$;

-- The academy as the coach sees and edits it
create or replace function public.coach_academy() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  return (select jsonb_build_object('id', a.id, 'name', a.name, 'district', d.name, 'region', r.name, 'contact_name', a.contact_name, 'contact_phone', a.contact_phone,
            'venue', a.venue, 'training_days', a.training_days, 'training_time', a.training_time, 'players_count', a.players_count, 'age_groups', a.age_groups,
            'photo_path', a.photo_path, 'programme_status', a.programme_status, 'profile_updated_at', a.profile_updated_at,
            'complete', a.venue is not null and cardinality(a.training_days) > 0 and a.contact_phone is not null and cardinality(a.age_groups) > 0)
            from public.academies a left join public.districts d on d.id = a.district_id left join public.regions r on r.id = d.region_id where a.id = ctx.v_academy);
end $$;

create or replace function public.coach_save_academy(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  update public.academies set
    contact_name = coalesce(nullif(p->>'contact_name',''), contact_name), contact_phone = nullif(p->>'contact_phone',''),
    venue = nullif(p->>'venue',''), training_days = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'training_days', '[]'::jsonb)) x), '{}'),
    training_time = nullif(p->>'training_time',''), players_count = nullif(p->>'players_count','')::int,
    age_groups = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'age_groups', '[]'::jsonb)) x), '{}'),
    photo_path = case when p ? 'photo_path' then nullif(p->>'photo_path','') else photo_path end,
    profile_updated_at = now()
  where id = ctx.v_academy;
end $$;

-- Training sessions
create or replace function public.coach_sessions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'held_on', s.held_on, 'topic', s.topic, 'duration_min', s.duration_min, 'notes', s.notes,
            'present', (select count(*) from public.academy_session_players sp where sp.session_id = s.id and sp.present),
            'players', coalesce((select jsonb_agg(sp.player_id) from public.academy_session_players sp where sp.session_id = s.id and sp.present), '[]'::jsonb)) order by s.held_on desc, s.created_at desc)
          from (select * from public.academy_sessions where academy_id = ctx.v_academy order by held_on desc limit 40) s), '[]'::jsonb);
end $$;

create or replace function public.coach_save_session(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid; v_day date; pid uuid;
begin
  select * into ctx from public.coach_ctx();
  v_day := nullif(p->>'held_on','')::date;
  if v_day is null or v_day > current_date then raise exception 'Enter the day of the session (today or earlier)'; end if;
  if v_day < current_date - 60 then raise exception 'Sessions can be logged up to 60 days back'; end if;
  if p_id is null then
    insert into public.academy_sessions(academy_id, held_on, topic, duration_min, notes, created_by)
    values (ctx.v_academy, v_day, nullif(p->>'topic',''), nullif(p->>'duration_min','')::int, nullif(p->>'notes',''), auth.uid())
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

create or replace function public.coach_delete_session(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  delete from public.academy_sessions where id = p_id and academy_id = ctx.v_academy;
end $$;

-- The schedule: every relevant camp with its days and my academy's booking
create or replace function public.coach_schedule() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record; v_dist uuid; v_region uuid;
begin
  select * into ctx from public.coach_ctx();
  select a.district_id, d.region_id into v_dist, v_region from public.academies a left join public.districts d on d.id = a.district_id where a.id = ctx.v_academy;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'stage', c.stage, 'status', c.status, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'venue', c.venue, 'age_groups', c.age_groups,
      'district', d.name, 'own_district', c.district_id = v_dist, 'submissions_open', c.submissions_open and c.status in ('planned','open'),
      'days', coalesce((select jsonb_agg(jsonb_build_object('id', cd.id, 'day_date', cd.day_date, 'start_time', cd.start_time, 'end_time', cd.end_time, 'notes', cd.notes) order by cd.day_date, cd.start_time) from public.camp_days cd where cd.camp_id = c.id), '[]'::jsonb),
      'booking', (select jsonb_build_object('id', b.id, 'day_id', b.day_id, 'day_date', cd.day_date, 'start_time', cd.start_time, 'end_time', cd.end_time, 'report_time', b.report_time,
                                            'players_expected', b.players_expected, 'status', b.status, 'coach_note', b.coach_note, 'staff_note', b.staff_note, 'confirmed_at', b.confirmed_at, 'arrived_at', b.arrived_at)
                    from public.camp_bookings b left join public.camp_days cd on cd.id = b.day_id where b.camp_id = c.id and b.academy_id = ctx.v_academy),
      'my_players', (select count(*) from public.camp_participants cp join public.players p on p.id = cp.player_id where cp.camp_id = c.id and p.academy_id = ctx.v_academy and cp.status <> 'removed'),
      'my_invited', (select count(*) from public.camp_participants cp join public.players p on p.id = cp.player_id where cp.camp_id = c.id and p.academy_id = ctx.v_academy and cp.status in ('invited','confirmed'))
    ) order by c.starts_on nulls last, c.name)
      from public.camps c left join public.districts d on d.id = c.district_id
      join public.seasons s on s.id = c.season_id and s.is_current_scouting
     where c.status <> 'cancelled'
       and (coalesce(c.ends_on, c.starts_on) is null or coalesce(c.ends_on, c.starts_on) >= current_date - 45)
       and ((c.stage = 'district' and (coalesce(c.region_id, d.region_id) = v_region))
            or (c.stage <> 'district' and exists (select 1 from public.camp_participants cp join public.players p on p.id = cp.player_id where cp.camp_id = c.id and p.academy_id = ctx.v_academy and cp.status <> 'removed')))
  ), '[]'::jsonb);
end $$;

create or replace function public.coach_answer_booking(p_booking uuid, p_action text, p_note text, p_players_expected int) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record; b public.camp_bookings;
begin
  select * into ctx from public.coach_ctx();
  select * into b from public.camp_bookings where id = p_booking and academy_id = ctx.v_academy;
  if b.id is null then raise exception 'Booking not found'; end if;
  if p_action = 'confirm' then
    update public.camp_bookings set status = 'confirmed', confirmed_at = now(), coach_note = nullif(trim(coalesce(p_note, '')), ''), players_expected = coalesce(p_players_expected, players_expected) where id = b.id;
  elsif p_action = 'change' then
    if coalesce(trim(p_note), '') = '' then raise exception 'Tell the staff what should change'; end if;
    update public.camp_bookings set status = 'change_requested', coach_note = trim(p_note), players_expected = coalesce(p_players_expected, players_expected) where id = b.id;
  elsif p_action = 'decline' then
    if coalesce(trim(p_note), '') = '' then raise exception 'Please give the reason'; end if;
    update public.camp_bookings set status = 'declined', coach_note = trim(p_note) where id = b.id;
  else
    raise exception 'Unknown action';
  end if;
end $$;

-- A coach's answer reaches the staff of the province
create or replace function public.camp_bookings_answer_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.camps; a text; v_role public.app_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role <> 'coach' or new.status = old.status then return null; end if;
  select * into c from public.camps where id = new.camp_id;
  select name into a from public.academies where id = new.academy_id;
  perform public.notify_staff('rsvp.answered', c.project_id, public.camp_region(c.id),
    a || case new.status when 'confirmed' then ' confirmed their day at ' when 'change_requested' then ' asks to change their day at ' when 'declined' then ' cannot come to ' else ' answered for ' end || c.name,
    coalesce(new.coach_note, '') || case when new.players_expected is not null then ' · ' || new.players_expected || ' players expected' else '' end,
    '/scouting/camps/' || c.id, jsonb_build_object('camp_id', c.id, 'booking_id', new.id), 'booking:' || c.id);
  return null;
end $$;
drop trigger if exists camp_bookings_answer_notify on public.camp_bookings;
create trigger camp_bookings_answer_notify after update on public.camp_bookings for each row execute function public.camp_bookings_answer_notify();

do $$ declare f text; begin
  foreach f in array array['coach_log_player(uuid,text,text)','coach_delete_log(uuid)','coach_academy()','coach_save_academy(jsonb)','coach_sessions()',
                           'coach_save_session(uuid,jsonb)','coach_delete_session(uuid)','coach_schedule()','coach_answer_booking(uuid,text,text,integer)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Staff: the academy's recent training activity, for the Academies and Coaches screens
create or replace function public.academy_activity(p_academy uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sessions_30d', (select count(*) from public.academy_sessions where academy_id = p_academy and held_on > current_date - 30),
    'sessions_90d', (select count(*) from public.academy_sessions where academy_id = p_academy and held_on > current_date - 90),
    'last_session', (select max(held_on) from public.academy_sessions where academy_id = p_academy),
    'players', (select count(*) from public.players where academy_id = p_academy and merged_into is null and archived_at is null and squad_status = 'active'),
    'with_photo', (select count(*) from public.players where academy_id = p_academy and merged_into is null and archived_at is null and photo_path is not null),
    'coaches', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(full_name, username), 'last_seen_at', last_seen_at)) from public.profiles where academy_id = p_academy and role = 'coach' and status = 'active'), '[]'::jsonb))
  where public.is_staff()
$$;
grant execute on function public.academy_activity(uuid) to authenticated;

-- Daily reminder also covers booked days
create or replace function public.notifications_daily_bookings() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select b.id, b.academy_id, c.name, cd.day_date, coalesce(b.report_time, cd.start_time) t, c.venue, c.id camp_id
             from public.camp_bookings b join public.camp_days cd on cd.id = b.day_id join public.camps c on c.id = b.camp_id
            where b.status in ('proposed','confirmed') and cd.day_date in (current_date + 3, current_date + 1) loop
    perform public.notify_coaches_of_academy('camp.reminder', r.academy_id,
      r.name || case when r.day_date = current_date + 1 then ': your day is tomorrow' else ': your day is in 3 days' end,
      to_char(r.day_date, 'Dy DD Mon') || coalesce(' · report at ' || to_char(r.t, 'HH24:MI'), '') || coalesce(' · ' || r.venue, '') || case when exists (select 1 from public.camp_bookings x where x.id = r.id and x.status = 'proposed') then '. Please confirm your day.' else '.' end,
      '/schedule', jsonb_build_object('camp_id', r.camp_id, 'booking_id', r.id));
  end loop;
end $$;
revoke execute on function public.notifications_daily_bookings() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'tonynext-notifications-daily';
    perform cron.schedule('tonynext-notifications-daily', '0 4 * * *', 'select public.notifications_daily(); select public.notifications_daily_bookings()');
  end if;
end $$;
