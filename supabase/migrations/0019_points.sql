-- Tony Next · 0019 points, levels, badges, leaderboards, coach reviews and activity.
-- The reward engine: every action that creates information earns points. Rules live per project and are editable.

-- ───────── Access area for the Coaches screen ─────────
create or replace function public.access_areas() returns text[]
language sql immutable as $$
  select array['academies','camps','players','coaches','insights','squads','attendance','physical','training','matches','evaluations',
               'player_files','staff_reports','finance','partners','transfers','club_portal','assistant','files','files.private']
$$;

-- ───────── Rules, events, levels, badges ─────────
create table if not exists public.point_rules (
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  points int not null,
  label text not null,
  description text not null,
  cap int,                                   -- awards per cap_period (null = no cap)
  cap_period text check (cap_period in ('day','week','season','once')),
  active boolean not null default true,
  sort int not null default 0,
  primary key (project_id, code)
);
alter table public.point_rules enable row level security;
drop policy if exists point_rules_read on public.point_rules;
create policy point_rules_read on public.point_rules for select to authenticated using (public.is_active_user());
drop policy if exists point_rules_admin on public.point_rules;
create policy point_rules_admin on public.point_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  academy_id uuid references public.academies(id) on delete set null,
  rule text not null,
  points int not null,
  ref_table text,
  ref_id text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id)
);
create index if not exists point_events_user on public.point_events(user_id, created_at desc);
create index if not exists point_events_academy on public.point_events(academy_id, season_id);
create unique index if not exists point_events_once on public.point_events(user_id, rule, ref_table, ref_id) where ref_id is not null and voided_at is null;
alter table public.point_events enable row level security;
drop policy if exists point_events_staff on public.point_events;
create policy point_events_staff on public.point_events for select to authenticated using (public.is_staff() or user_id = auth.uid());

create table if not exists public.point_levels (
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  label text not null,
  min_points int not null,
  sort int not null default 0,
  primary key (project_id, code)
);
alter table public.point_levels enable row level security;
drop policy if exists point_levels_read on public.point_levels;
create policy point_levels_read on public.point_levels for select to authenticated using (public.is_active_user());
drop policy if exists point_levels_admin on public.point_levels;
create policy point_levels_admin on public.point_levels for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.badges (
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  label text not null,
  description text not null,
  icon text not null default 'award',
  sort int not null default 0,
  primary key (project_id, code)
);
create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge text not null,
  earned_at timestamptz not null default now(),
  ref text,
  primary key (user_id, badge)
);
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
drop policy if exists badges_read on public.badges;
create policy badges_read on public.badges for select to authenticated using (public.is_active_user());
drop policy if exists user_badges_read on public.user_badges;
create policy user_badges_read on public.user_badges for select to authenticated using (public.is_staff() or user_id = auth.uid());

-- Rewards: the catalogue and redemptions exist now; the screens come later.
create table if not exists public.reward_catalog (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('equipment','commission','experience','other')),
  label text not null,
  description text,
  cost_points int not null,
  stock int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.reward_catalog(id) on delete cascade,
  points int not null,
  status text not null default 'requested' check (status in ('requested','approved','delivered','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  delivered_at timestamptz,
  note text
);
alter table public.reward_catalog enable row level security;
alter table public.redemptions enable row level security;
drop policy if exists reward_catalog_read on public.reward_catalog;
create policy reward_catalog_read on public.reward_catalog for select to authenticated using (public.is_active_user());
drop policy if exists reward_catalog_admin on public.reward_catalog;
create policy reward_catalog_admin on public.reward_catalog for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists redemptions_own on public.redemptions;
create policy redemptions_own on public.redemptions for select to authenticated using (public.is_staff() or user_id = auth.uid());

-- ───────── Coach reviews and activity ─────────
create table if not exists public.coach_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  academy_id uuid references public.academies(id) on delete set null,
  reviewer uuid references public.profiles(id),
  reliability smallint check (reliability between 1 and 5),
  player_quality smallint check (player_quality between 1 and 5),
  engagement smallint check (engagement between 1 and 5),
  cooperation smallint check (cooperation between 1 and 5),
  comment text,
  visible_to_coach boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists coach_reviews_coach on public.coach_reviews(coach_id, created_at desc);
alter table public.coach_reviews enable row level security;
drop policy if exists coach_reviews_read on public.coach_reviews;
create policy coach_reviews_read on public.coach_reviews for select to authenticated using (public.can('coaches', 1));
drop policy if exists coach_reviews_write on public.coach_reviews;
create policy coach_reviews_write on public.coach_reviews for all to authenticated using (public.can('coaches', 2)) with check (public.can('coaches', 2));

create table if not exists public.activity_events (
  id bigserial primary key,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index if not exists activity_events_user on public.activity_events(user_id, at desc);
alter table public.activity_events enable row level security;
drop policy if exists activity_events_staff on public.activity_events;
create policy activity_events_staff on public.activity_events for select to authenticated using (public.is_staff());

-- ───────── Seed rules, levels and badges for every project ─────────
create or replace function public.seed_points(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.point_rules(project_id, code, points, label, description, cap, cap_period, sort) values
    (p_project, 'account.approved',         50,   'Account approved',            'Your coach account was approved.', 1, 'once', 10),
    (p_project, 'academy.profile_complete', 30,   'Academy profile complete',    'Training ground, days, phone and age groups filled in.', 1, 'once', 11),
    (p_project, 'player.added',             10,   'Player added',                'A player added to your squad (up to 3 a day).', 3, 'day', 20),
    (p_project, 'player.profile_complete',  10,   'Player profile complete',     'Photo, height and weight added to a player.', null, null, 21),
    (p_project, 'player.guardian_consent',   5,   'Guardian consent',            'The guardian agreed to Tony camps.', null, null, 22),
    (p_project, 'session.logged',           15,   'Training session logged',     'A training session with attendance (up to 4 a week).', 4, 'week', 30),
    (p_project, 'camp.submitted',           15,   'Player submitted',            'A player submitted to a district camp.', null, null, 40),
    (p_project, 'camp.booking_confirmed',   25,   'Camp day confirmed',          'You confirmed your day at a camp in time.', null, null, 41),
    (p_project, 'camp.arrived',             50,   'Came to the camp',            'Your academy arrived at the camp with its players.', null, null, 42),
    (p_project, 'player.attended',          10,   'Player attended',             'A player of yours was at a camp.', null, null, 43),
    (p_project, 'rsvp.on_time',             10,   'Replied in time',             'You answered an invitation before the deadline.', null, null, 44),
    (p_project, 'player.selected.district', 50,   'Selected at district camp',   'One of your players was selected at a district camp.', null, null, 50),
    (p_project, 'player.selected.province', 150,  'Selected at province final',  'One of your players was selected at a province final.', null, null, 51),
    (p_project, 'player.selected.national', 400,  'Selected at national final',  'One of your players was selected at the national final.', null, null, 52),
    (p_project, 'player.tony_squad',        1000, 'Player joined a Tony squad',  'One of your players became a Tony squad player.', null, null, 53),
    (p_project, 'weekly.active',            10,   'Active this week',            'You used the portal this week.', 1, 'week', 60),
    (p_project, 'staff.bonus',              0,    'Bonus from Tony staff',       'Extra points given by the staff.', null, null, 90),
    (p_project, 'staff.penalty',            0,    'Deduction by Tony staff',     'Points removed by the staff.', null, null, 91)
  on conflict (project_id, code) do nothing;
  insert into public.point_levels(project_id, code, label, min_points, sort) values
    (p_project, 'rookie', 'Rookie', 0, 1), (p_project, 'bronze', 'Bronze', 250, 2), (p_project, 'silver', 'Silver', 750, 3), (p_project, 'gold', 'Gold', 2000, 4), (p_project, 'platinum', 'Platinum', 5000, 5)
  on conflict (project_id, code) do nothing;
  insert into public.badges(project_id, code, label, description, icon, sort) values
    (p_project, 'first_player',    'First player',     'Added the first player to the squad.', 'user-plus', 1),
    (p_project, 'full_squad',      'Full squad',       '15 or more active players.', 'users', 2),
    (p_project, 'team_photo',      'Team photo',       'A team photo on the academy profile.', 'camera', 3),
    (p_project, 'session_streak',  'Four-week streak', 'A training session logged every week for four weeks.', 'flame', 4),
    (p_project, 'first_selection', 'First selection',  'A player selected for the first time.', 'star', 5),
    (p_project, 'province_final',  'Province final',   'A player at a province final.', 'trophy', 6),
    (p_project, 'national_final',  'National final',   'A player at the national final.', 'medal', 7),
    (p_project, 'tony_squad',      'Tony squad',       'A player of yours joined a Tony squad.', 'crown', 8),
    (p_project, 'always_on_time',  'Always on time',   'Three invitations answered before the deadline.', 'clock', 9)
  on conflict (project_id, code) do nothing;
end $$;
revoke execute on function public.seed_points(uuid) from public, anon, authenticated;
select public.seed_points(id) from public.projects;
create or replace function public.projects_seed_points() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.seed_points(new.id); return null; end $$;
drop trigger if exists projects_seed_points on public.projects;
create trigger projects_seed_points after insert on public.projects for each row execute function public.projects_seed_points();

-- ───────── The engine ─────────
create or replace function public.user_points(p_user uuid, p_season uuid default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int from public.point_events where user_id = p_user and voided_at is null and (p_season is null or season_id = p_season)
$$;

create or replace function public.level_of(p_project uuid, p_points int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', l.code, 'label', l.label, 'min_points', l.min_points,
           'next', (select jsonb_build_object('code', n.code, 'label', n.label, 'min_points', n.min_points) from public.point_levels n where n.project_id = p_project and n.min_points > p_points order by n.min_points limit 1))
    from public.point_levels l where l.project_id = p_project and l.min_points <= p_points order by l.min_points desc limit 1
$$;

create or replace function public.give_badge(p_user uuid, p_proj uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.badges;
begin
  insert into public.user_badges(user_id, badge) values (p_user, p_code) on conflict do nothing;
  if not found then return; end if;
  select * into b from public.badges where project_id = p_proj and code = p_code;
  perform public.notify('level.up', p_user, 'New badge: ' || coalesce(b.label, p_code), b.description, '/progress', jsonb_build_object('badge', p_code));
end $$;

create or replace function public.check_badges(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_proj uuid; v_academy uuid; v_weeks int;
begin
  select project_id, academy_id into v_proj, v_academy from public.profiles where id = p_user;
  if v_academy is null then return; end if;
  if exists (select 1 from public.players where academy_id = v_academy and merged_into is null and archived_at is null) then perform public.give_badge(p_user, v_proj, 'first_player'); end if;
  if (select count(*) from public.players where academy_id = v_academy and merged_into is null and archived_at is null and squad_status = 'active') >= 15 then perform public.give_badge(p_user, v_proj, 'full_squad'); end if;
  if exists (select 1 from public.academies where id = v_academy and photo_path is not null) then perform public.give_badge(p_user, v_proj, 'team_photo'); end if;
  select count(distinct date_trunc('week', held_on)) into v_weeks from public.academy_sessions where academy_id = v_academy and held_on > current_date - 28;
  if v_weeks >= 4 then perform public.give_badge(p_user, v_proj, 'session_streak'); end if;
  if exists (select 1 from public.camp_participants cp join public.players p on p.id = cp.player_id where p.academy_id = v_academy and cp.decision = 'selected' and cp.decision_published) then perform public.give_badge(p_user, v_proj, 'first_selection'); end if;
  if exists (select 1 from public.camp_participants cp join public.players p on p.id = cp.player_id join public.camps c on c.id = cp.camp_id where p.academy_id = v_academy and c.stage = 'province_final' and cp.status in ('confirmed','attended')) then perform public.give_badge(p_user, v_proj, 'province_final'); end if;
  if exists (select 1 from public.camp_participants cp join public.players p on p.id = cp.player_id join public.camps c on c.id = cp.camp_id where p.academy_id = v_academy and c.stage = 'national_final' and cp.status in ('confirmed','attended')) then perform public.give_badge(p_user, v_proj, 'national_final'); end if;
  if exists (select 1 from public.players where academy_id = v_academy and pool_status = 'tony_squad') then perform public.give_badge(p_user, v_proj, 'tony_squad'); end if;
  if (select count(*) from public.point_events where user_id = p_user and rule = 'rsvp.on_time' and voided_at is null) >= 3 then perform public.give_badge(p_user, v_proj, 'always_on_time'); end if;
end $$;

create or replace function public.award_points(p_rule text, p_user uuid, p_ref_table text default null, p_ref_id text default null, p_note text default null, p_points int default null, p_by uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare r public.point_rules; v_proj uuid; v_academy uuid; v_season uuid; v_status public.user_status; v_role public.app_role;
        v_before int; v_after int; lv_before jsonb; lv_after jsonb; v_pts int; n int;
begin
  select project_id, academy_id, status, role into v_proj, v_academy, v_status, v_role from public.profiles where id = p_user;
  if v_proj is null or v_status <> 'active' or v_role <> 'coach' then return 0; end if;
  select * into r from public.point_rules where project_id = v_proj and code = p_rule;
  if r.code is null or not r.active then return 0; end if;
  v_pts := coalesce(p_points, r.points);
  if v_pts = 0 then return 0; end if;
  if p_ref_id is not null and exists (select 1 from public.point_events where user_id = p_user and rule = p_rule and ref_table is not distinct from p_ref_table and ref_id = p_ref_id and voided_at is null) then return 0; end if;
  if r.cap is not null then
    select count(*) into n from public.point_events where user_id = p_user and rule = p_rule and voided_at is null
      and (r.cap_period = 'once' or (r.cap_period = 'day' and created_at > date_trunc('day', now())) or (r.cap_period = 'week' and created_at > date_trunc('week', now()))
           or (r.cap_period = 'season' and season_id = (select id from public.seasons where project_id = v_proj and is_current_scouting)));
    if n >= r.cap then return 0; end if;
  end if;
  select id into v_season from public.seasons where project_id = v_proj and is_current_scouting;
  v_before := public.user_points(p_user);
  insert into public.point_events(project_id, season_id, user_id, academy_id, rule, points, ref_table, ref_id, note, created_by)
  values (v_proj, v_season, p_user, v_academy, p_rule, v_pts, p_ref_table, p_ref_id, p_note, p_by);
  v_after := v_before + v_pts;
  perform public.notify('points.earned', p_user, '+' || v_pts || ' points · ' || r.label, 'You now have ' || v_after || ' points.', '/progress', jsonb_build_object('rule', p_rule, 'points', v_pts), 'points:' || to_char(now(), 'YYYY-MM-DD'));
  lv_before := public.level_of(v_proj, v_before); lv_after := public.level_of(v_proj, v_after);
  if lv_after->>'code' is distinct from lv_before->>'code' and v_pts > 0 then
    perform public.notify('level.up', p_user, 'You reached ' || (lv_after->>'label') || '!', 'Level ' || (lv_after->>'label') || ' with ' || v_after || ' points. Keep going.', '/progress', jsonb_build_object('level', lv_after->>'code'));
  end if;
  perform public.check_badges(p_user);
  return v_pts;
end $$;

-- every active coach of an academy
create or replace function public.award_academy(p_rule text, p_academy uuid, p_ref_table text, p_ref_id text, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare u record; total int := 0;
begin
  for u in select id from public.profiles where academy_id = p_academy and role = 'coach' and status = 'active' loop
    total := total + public.award_points(p_rule, u.id, p_ref_table, p_ref_id, p_note);
  end loop;
  return total;
end $$;

do $$ declare f text; begin
  foreach f in array array['user_points(uuid,uuid)','level_of(uuid,integer)','check_badges(uuid)','give_badge(uuid,uuid,text)','award_points(text,uuid,text,text,text,integer,uuid)','award_academy(text,uuid,text,text,text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ───────── Triggers that award ─────────
create or replace function public.points_profiles() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.role = 'coach' and new.status = 'active' and old.status is distinct from 'active' then
    perform public.award_points('account.approved', new.id, 'profiles', new.id::text);
  end if;
  return null;
end $$;
drop trigger if exists points_profiles on public.profiles;
create trigger points_profiles after update on public.profiles for each row execute function public.points_profiles();

create or replace function public.points_players() returns trigger language plpgsql security definer set search_path = public as $$
declare v_role public.app_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' and new.source = 'portal' and v_role = 'coach' then
    perform public.award_points('player.added', auth.uid(), 'players', new.id::text);
  end if;
  if new.photo_path is not null and new.height_cm is not null and new.weight_kg is not null and (tg_op = 'INSERT' or old.photo_path is null or old.height_cm is null or old.weight_kg is null) and new.academy_id is not null then
    perform public.award_academy('player.profile_complete', new.academy_id, 'players', new.id::text);
  end if;
  if new.guardian_consent and (tg_op = 'INSERT' or not old.guardian_consent) and new.academy_id is not null then
    perform public.award_academy('player.guardian_consent', new.academy_id, 'players', new.id::text);
  end if;
  if tg_op = 'UPDATE' and new.pool_status = 'tony_squad' and old.pool_status is distinct from 'tony_squad' and new.academy_id is not null then
    perform public.award_academy('player.tony_squad', new.academy_id, 'players', new.id::text);
  end if;
  return null;
end $$;
drop trigger if exists points_players on public.players;
create trigger points_players after insert or update on public.players for each row execute function public.points_players();

create or replace function public.points_academies() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.venue is not null and cardinality(new.training_days) > 0 and new.contact_phone is not null and cardinality(new.age_groups) > 0 then
    perform public.award_academy('academy.profile_complete', new.id, 'academies', new.id::text);
  end if;
  if new.photo_path is not null and (old.photo_path is null) then perform public.check_badges(u.id) from (select id from public.profiles where academy_id = new.id and role = 'coach' and status = 'active') u; end if;
  return null;
end $$;
drop trigger if exists points_academies on public.academies;
create trigger points_academies after update on public.academies for each row execute function public.points_academies();

create or replace function public.points_sessions() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then perform public.award_points('session.logged', new.created_by, 'academy_sessions', new.id::text); end if;
  return null;
end $$;
drop trigger if exists points_sessions on public.academy_sessions;
create trigger points_sessions after insert on public.academy_sessions for each row execute function public.points_sessions();

create or replace function public.points_participants() returns trigger language plpgsql security definer set search_path = public as $$
declare c public.camps; v_academy uuid; v_rule text;
begin
  select academy_id into v_academy from public.players where id = new.player_id;
  if v_academy is null then return null; end if;
  select * into c from public.camps where id = new.camp_id;
  if tg_op = 'INSERT' and new.status = 'submitted' and new.submitted_by is not null then
    perform public.award_points('camp.submitted', new.submitted_by, 'camp_participants', new.id::text);
  end if;
  if tg_op = 'UPDATE' then
    if new.status = 'attended' and old.status is distinct from 'attended' then perform public.award_academy('player.attended', v_academy, 'camp_participants', new.id::text); end if;
    if new.status in ('confirmed','declined') and old.status = 'invited' and (c.rsvp_deadline is null or current_date <= c.rsvp_deadline) then
      perform public.award_academy('rsvp.on_time', v_academy, 'camp_participants', new.id::text);
    end if;
    if new.decision_published and new.decision = 'selected' and (not old.decision_published or old.decision is distinct from 'selected') then
      v_rule := case c.stage when 'district' then 'player.selected.district' when 'province_final' then 'player.selected.province' else 'player.selected.national' end;
      perform public.award_academy(v_rule, v_academy, 'camp_participants', new.id::text);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists points_participants on public.camp_participants;
create trigger points_participants after insert or update on public.camp_participants for each row execute function public.points_participants();

create or replace function public.points_bookings() returns trigger language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if tg_op = 'UPDATE' then
    select cd.day_date into d from public.camp_days cd where cd.id = new.day_id;
    if new.status = 'confirmed' and old.status is distinct from 'confirmed' and (d is null or current_date <= d) then perform public.award_academy('camp.booking_confirmed', new.academy_id, 'camp_bookings', new.id::text); end if;
    if new.status = 'arrived' and old.status is distinct from 'arrived' then perform public.award_academy('camp.arrived', new.academy_id, 'camp_bookings', new.id::text); end if;
  end if;
  return null;
end $$;
drop trigger if exists points_bookings on public.camp_bookings;
create trigger points_bookings after update on public.camp_bookings for each row execute function public.points_bookings();

-- The portal pings once per visit: activity for the staff, and the weekly points
create or replace function public.track(p_kind text, p_meta jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_proj uuid; v_role public.app_role;
begin
  select project_id, role into v_proj, v_role from public.profiles where id = auth.uid() and status = 'active';
  if v_proj is null then return; end if;
  insert into public.activity_events(project_id, user_id, kind, meta) values (v_proj, auth.uid(), left(coalesce(p_kind, 'visit'), 40), coalesce(p_meta, '{}'::jsonb));
  if v_role = 'coach' and p_kind = 'visit' then perform public.award_points('weekly.active', auth.uid(), 'week', to_char(date_trunc('week', now()), 'YYYY-MM-DD')); end if;
end $$;
revoke execute on function public.track(text, jsonb) from public, anon;
grant execute on function public.track(text, jsonb) to authenticated;

-- ───────── What the coach sees ─────────
create or replace function public.leaderboard(p_scope text, p_season uuid default null, p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_academy uuid; v_proj uuid; v_dist uuid; v_region uuid; v_season uuid;
begin
  v_academy := coalesce(p_academy, (select academy_id from public.profiles where id = auth.uid()));
  select a.project_id, a.district_id, d.region_id into v_proj, v_dist, v_region from public.academies a left join public.districts d on d.id = a.district_id where a.id = v_academy;
  if v_proj is null then select project_id into v_proj from public.profiles where id = auth.uid(); end if;
  v_season := coalesce(p_season, (select id from public.seasons where project_id = v_proj and is_current_scouting));
  return coalesce((
    with pts as (
      select a.id, a.name, d.name as district, r.name as region, d.id as district_id, r.id as region_id,
             coalesce((select sum(e.points) from public.point_events e where e.academy_id = a.id and e.voided_at is null and e.season_id = v_season), 0)::int as points
        from public.academies a left join public.districts d on d.id = a.district_id left join public.regions r on r.id = d.region_id
       where a.project_id = v_proj and a.is_active
         and (p_scope = 'national' or (p_scope = 'province' and r.id = v_region) or (p_scope = 'district' and d.id = v_dist))),
    ranked as (select *, rank() over (order by points desc, name) rk from pts)
    select jsonb_agg(jsonb_build_object('academy_id', id, 'name', name, 'district', district, 'region', region, 'points', points, 'rank', rk, 'mine', id = v_academy) order by rk, name)
      from ranked where points > 0 or id = v_academy), '[]'::jsonb);
end $$;
grant execute on function public.leaderboard(text, uuid, uuid) to authenticated;

create or replace function public.coach_progress(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record; v_user uuid; v_season uuid; v_total int; v_season_pts int; lv jsonb;
begin
  select * into ctx from public.coach_ctx(p_academy);
  v_user := case when p_academy is null then auth.uid() else (select id from public.profiles where academy_id = ctx.v_academy and role = 'coach' and status = 'active' order by created_at limit 1) end;
  select id into v_season from public.seasons where project_id = ctx.v_project and is_current_scouting;
  v_total := coalesce(public.user_points(v_user), 0); v_season_pts := coalesce(public.user_points(v_user, v_season), 0);
  lv := public.level_of(ctx.v_project, v_total);
  return jsonb_build_object(
    'points', v_total, 'season_points', v_season_pts, 'level', lv,
    'levels', (select jsonb_agg(jsonb_build_object('code', code, 'label', label, 'min_points', min_points) order by min_points) from public.point_levels where project_id = ctx.v_project),
    'badges', (select jsonb_agg(jsonb_build_object('code', b.code, 'label', b.label, 'description', b.description, 'icon', b.icon, 'earned_at', ub.earned_at) order by b.sort)
                 from public.badges b left join public.user_badges ub on ub.badge = b.code and ub.user_id = v_user where b.project_id = ctx.v_project),
    'rules', (select jsonb_agg(jsonb_build_object('code', code, 'points', points, 'label', label, 'description', description, 'cap', cap, 'cap_period', cap_period) order by sort)
                from public.point_rules where project_id = ctx.v_project and active and code not like 'staff.%'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.created_at, 'rule', e.rule, 'points', e.points, 'label', coalesce(r.label, e.rule), 'note', e.note) order by e.created_at desc)
                 from (select * from public.point_events where user_id = v_user and voided_at is null order by created_at desc limit 30) e
                 left join public.point_rules r on r.project_id = ctx.v_project and r.code = e.rule), '[]'::jsonb),
    'rank', jsonb_build_object(
      'district', (select x->>'rank' from jsonb_array_elements(public.leaderboard('district', v_season, ctx.v_academy)) x where (x->>'mine')::boolean limit 1),
      'province', (select x->>'rank' from jsonb_array_elements(public.leaderboard('province', v_season, ctx.v_academy)) x where (x->>'mine')::boolean limit 1),
      'national', (select x->>'rank' from jsonb_array_elements(public.leaderboard('national', v_season, ctx.v_academy)) x where (x->>'mine')::boolean limit 1)),
    'province_board', public.leaderboard('province', v_season, ctx.v_academy),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', created_at, 'reliability', reliability, 'player_quality', player_quality, 'engagement', engagement, 'cooperation', cooperation, 'comment', comment) order by created_at desc)
                 from public.coach_reviews where coach_id = v_user and visible_to_coach), '[]'::jsonb));
end $$;
revoke execute on function public.coach_progress(uuid) from public, anon;
grant execute on function public.coach_progress(uuid) to authenticated;

-- ───────── What the staff sees ─────────
create or replace function public.coaches_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', coalesce(p.full_name, p.username), 'username', p.username, 'phone', p.phone, 'status', p.status, 'last_seen_at', p.last_seen_at, 'created_at', p.created_at,
    'academy_id', a.id, 'academy', a.name, 'district', d.name, 'region', r.name, 'region_id', r.id, 'programme_status', a.programme_status,
    'players', (select count(*) from public.players x where x.academy_id = a.id and x.merged_into is null and x.archived_at is null and x.squad_status = 'active'),
    'sessions_30d', (select count(*) from public.academy_sessions s where s.academy_id = a.id and s.held_on > current_date - 30),
    'submitted', (select count(distinct cp.player_id) from public.camp_participants cp join public.players x on x.id = cp.player_id join public.camps c on c.id = cp.camp_id join public.seasons se on se.id = c.season_id and se.is_current_scouting where x.academy_id = a.id and cp.status <> 'removed'),
    'selected', (select count(distinct cp.player_id) from public.camp_participants cp join public.players x on x.id = cp.player_id join public.camps c on c.id = cp.camp_id join public.seasons se on se.id = c.season_id and se.is_current_scouting where x.academy_id = a.id and cp.decision = 'selected' and cp.decision_published),
    'points', public.user_points(p.id), 'season_points', public.user_points(p.id, (select id from public.seasons where project_id = p.project_id and is_current_scouting)),
    'level', public.level_of(p.project_id, public.user_points(p.id))->>'label',
    'review', (select round(avg((coalesce(reliability,0) + coalesce(player_quality,0) + coalesce(engagement,0) + coalesce(cooperation,0))::numeric / nullif((reliability is not null)::int + (player_quality is not null)::int + (engagement is not null)::int + (cooperation is not null)::int, 0)), 1) from public.coach_reviews cr where cr.coach_id = p.id),
    'reviews', (select count(*) from public.coach_reviews cr where cr.coach_id = p.id)
  ) order by coalesce(p.full_name, p.username)), '[]'::jsonb)
    from public.profiles p left join public.academies a on a.id = p.academy_id left join public.districts d on d.id = a.district_id left join public.regions r on r.id = d.region_id
   where p.role = 'coach' and p.project_id = (select project_id from public.profiles where id = auth.uid()) and public.can('coaches', 1)
$$;

create or replace function public.coach_detail(p_coach uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; v_season uuid;
begin
  if not public.can('coaches', 1) then raise exception 'Not allowed'; end if;
  select * into p from public.profiles where id = p_coach;
  select id into v_season from public.seasons where project_id = p.project_id and is_current_scouting;
  return jsonb_build_object(
    'points', public.user_points(p.id), 'season_points', public.user_points(p.id, v_season), 'level', public.level_of(p.project_id, public.user_points(p.id)),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('code', b.code, 'label', b.label, 'earned_at', ub.earned_at) order by ub.earned_at) from public.user_badges ub join public.badges b on b.code = ub.badge and b.project_id = p.project_id where ub.user_id = p.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.created_at, 'rule', e.rule, 'points', e.points, 'label', coalesce(r.label, e.rule), 'note', e.note, 'voided', e.voided_at is not null) order by e.created_at desc)
                 from (select * from public.point_events where user_id = p.id order by created_at desc limit 60) e left join public.point_rules r on r.project_id = p.project_id and r.code = e.rule), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'kind', kind) order by at desc) from (select * from public.activity_events where user_id = p.id order by at desc limit 30) x), '[]'::jsonb),
    'visits_30d', (select count(*) from public.activity_events where user_id = p.id and kind = 'visit' and at > now() - interval '30 days'),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('held_on', held_on, 'topic', topic, 'present', (select count(*) from public.academy_session_players sp where sp.session_id = s.id and sp.present)) order by held_on desc) from (select * from public.academy_sessions where academy_id = p.academy_id order by held_on desc limit 12) s), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', cr.id, 'at', cr.created_at, 'reviewer', coalesce(rv.full_name, rv.username), 'reliability', cr.reliability, 'player_quality', cr.player_quality, 'engagement', cr.engagement, 'cooperation', cr.cooperation, 'comment', cr.comment, 'visible_to_coach', cr.visible_to_coach) order by cr.created_at desc)
                 from public.coach_reviews cr left join public.profiles rv on rv.id = cr.reviewer where cr.coach_id = p.id), '[]'::jsonb));
end $$;

create or replace function public.admin_award_points(p_user uuid, p_points int, p_note text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.can('coaches', 2) then raise exception 'Not allowed'; end if;
  if p_points = 0 or coalesce(trim(p_note), '') = '' then raise exception 'Give the points and a reason'; end if;
  return public.award_points(case when p_points > 0 then 'staff.bonus' else 'staff.penalty' end, p_user, 'manual', gen_random_uuid()::text, trim(p_note), p_points, auth.uid());
end $$;

create or replace function public.admin_void_points(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can('coaches', 2) then raise exception 'Not allowed'; end if;
  update public.point_events set voided_at = now(), voided_by = auth.uid() where id = p_event and voided_at is null;
end $$;

create or replace function public.staff_message_coach(p_user uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can('coaches', 2) then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Write a title'; end if;
  perform public.notify('message.staff', p_user, trim(p_title), nullif(trim(coalesce(p_body, '')), ''), '/updates', jsonb_build_object('from', auth.uid()));
end $$;

do $$ declare f text; begin
  foreach f in array array['coaches_overview()','coach_detail(uuid)','admin_award_points(uuid,integer,text)','admin_void_points(uuid)','staff_message_coach(uuid,text,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Rule and level editing stays with admins through RLS; reseeding a project keeps edited values.
