-- Tony Next · 0022 academy life: what the coach records about his academy beyond the squad.
-- Training sessions get a focus (several), matches, the staff around the coach and the equipment on the ground.
-- Every one of these earns points, and the badge set grows into tiered families with two more levels on top.

-- ───────── Training: focus and intensity ─────────
alter table public.academy_sessions add column if not exists focus text[] not null default '{}';
alter table public.academy_sessions add column if not exists intensity text check (intensity in ('light','normal','hard'));
update public.academy_sessions set focus = array[lower(topic)] where cardinality(focus) = 0 and topic is not null and lower(topic) in ('technique','tactics','fitness','match','other');
update public.academy_sessions set focus = array['technical'] where focus = array['technique'];
update public.academy_sessions set focus = array['tactical'] where focus = array['tactics'];
update public.academy_sessions set focus = array['physical'] where focus = array['fitness'];
update public.academy_sessions set focus = array['games'] where focus = array['match'];
update public.academy_sessions set focus = '{}' where focus = array['other'];

-- ───────── Matches ─────────
create table if not exists public.academy_matches (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  played_on date not null,
  kind text not null check (kind in ('internal','friendly','league','cup','tournament','tony')),
  opponent text,
  venue text check (venue in ('home','away','neutral')),
  age_group text,
  goals_for smallint,
  goals_against smallint,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists academy_matches_academy on public.academy_matches(academy_id, played_on desc);
create table if not exists public.academy_match_players (
  match_id uuid not null references public.academy_matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  goals smallint not null default 0,
  primary key (match_id, player_id)
);
alter table public.academy_matches enable row level security;
alter table public.academy_match_players enable row level security;
drop policy if exists academy_matches_read on public.academy_matches;
create policy academy_matches_read on public.academy_matches for select to authenticated using (public.is_staff() or academy_id = public.my_academy());
drop policy if exists academy_match_players_read on public.academy_match_players;
create policy academy_match_players_read on public.academy_match_players for select to authenticated using (public.is_staff() or exists (select 1 from public.academy_matches m where m.id = match_id and m.academy_id = public.my_academy()));
drop policy if exists academy_matches_project on public.academy_matches;
create policy academy_matches_project on public.academy_matches as restrictive for all to authenticated using (exists (select 1 from public.academies a where a.id = academy_id and a.project_id = public.my_project()));
drop policy if exists academy_match_players_project on public.academy_match_players;
create policy academy_match_players_project on public.academy_match_players as restrictive for all to authenticated using (exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project()));

-- ───────── Staff of the academy ─────────
create table if not exists public.academy_staff (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  name text not null,
  role text not null check (role in ('head_coach','assistant','gk_coach','fitness','physio','manager','volunteer','other')),
  phone text,
  since_year int,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists academy_staff_academy on public.academy_staff(academy_id);
alter table public.academy_staff enable row level security;
drop policy if exists academy_staff_read on public.academy_staff;
create policy academy_staff_read on public.academy_staff for select to authenticated using (public.is_staff() or academy_id = public.my_academy());
drop policy if exists academy_staff_project on public.academy_staff;
create policy academy_staff_project on public.academy_staff as restrictive for all to authenticated using (exists (select 1 from public.academies a where a.id = academy_id and a.project_id = public.my_project()));

-- ───────── Equipment on the ground ─────────
create table if not exists public.academy_equipment (
  academy_id uuid not null references public.academies(id) on delete cascade,
  item text not null check (item in ('balls','bibs','cones','goals','nets','first_aid','water','kits','gk_gloves','pump','whistle','other')),
  quantity int not null default 0,
  condition text not null default 'good' check (condition in ('good','worn','missing')),
  notes text,
  updated_at timestamptz not null default now(),
  primary key (academy_id, item)
);
alter table public.academy_equipment enable row level security;
drop policy if exists academy_equipment_read on public.academy_equipment;
create policy academy_equipment_read on public.academy_equipment for select to authenticated using (public.is_staff() or academy_id = public.my_academy());
drop policy if exists academy_equipment_project on public.academy_equipment;
create policy academy_equipment_project on public.academy_equipment as restrictive for all to authenticated using (exists (select 1 from public.academies a where a.id = academy_id and a.project_id = public.my_project()));
alter table public.academies add column if not exists equipment_updated_at timestamptz;

-- ───────── Badges grow into families with tiers; two more levels ─────────
alter table public.badges add column if not exists family text;
alter table public.badges add column if not exists tier smallint not null default 1;

create or replace function public.seed_points(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.point_rules(project_id, code, points, label, description, cap, cap_period, sort) values
    (p_project, 'account.approved',         50,   'Account approved',            'Your coach account was approved.', 1, 'once', 10),
    (p_project, 'academy.profile_complete', 30,   'Academy profile complete',    'Training ground, days, phone and age groups filled in.', 1, 'once', 11),
    (p_project, 'academy.photo',            15,   'Team photo',                  'A photo of the academy or the team on the profile.', 1, 'once', 12),
    (p_project, 'staff.member_added',       10,   'Staff member added',          'A coach, assistant or helper of the academy added (up to 5).', 5, 'once', 13),
    (p_project, 'equipment.updated',        20,   'Equipment list updated',      'The equipment on the ground counted and updated (once a season).', 1, 'season', 14),
    (p_project, 'player.added',             10,   'Player added',                'A player added to your squad.', 3, 'day', 20),
    (p_project, 'player.profile_complete',  10,   'Player profile complete',     'Photo, height and weight added to a player.', null, null, 21),
    (p_project, 'player.guardian_consent',   5,   'Guardian consent',            'The guardian agreed to Tony camps.', null, null, 22),
    (p_project, 'player.remeasured',         5,   'Player measured again',       'Height and weight updated after two months or more.', null, null, 23),
    (p_project, 'session.logged',           15,   'Training session logged',     'A training session with attendance.', 4, 'week', 30),
    (p_project, 'session.full_attendance',   5,   'Strong attendance',           'A session where at least 80% of the squad was present.', 4, 'week', 31),
    (p_project, 'match.logged',             20,   'Match logged',                'A match of the academy with its players.', 2, 'week', 32),
    (p_project, 'match.official',           10,   'Official match',              'Extra for a league, cup or tournament match.', null, null, 33),
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
    (p_project, 'rookie', 'Rookie', 0, 1), (p_project, 'bronze', 'Bronze', 250, 2), (p_project, 'silver', 'Silver', 750, 3), (p_project, 'gold', 'Gold', 2000, 4),
    (p_project, 'platinum', 'Platinum', 5000, 5), (p_project, 'diamond', 'Diamond', 10000, 6), (p_project, 'legend', 'Legend', 20000, 7)
  on conflict (project_id, code) do nothing;
  insert into public.badges(project_id, code, label, description, icon, sort, family, tier) values
    -- squad
    (p_project, 'first_player',    'First player',       'Added the first player to the squad.', 'user-plus', 10, 'squad', 1),
    (p_project, 'full_squad',      'Full squad',         '15 or more active players.', 'users', 11, 'squad', 2),
    (p_project, 'big_squad',       'Big squad',          '25 or more active players.', 'users', 12, 'squad', 3),
    (p_project, 'profiles_done',   'Every face known',   'Every active player has a photo, height and weight.', 'id-card', 13, 'profiles', 1),
    (p_project, 'guardians_in',    'Guardians on board', 'Every active player has guardian consent.', 'shield-check', 14, 'profiles', 2),
    (p_project, 'numbers_on',      'Numbers on the back','Shirt numbers for at least 11 players.', 'shirt', 15, 'profiles', 3),
    (p_project, 'team_photo',      'Team photo',         'A team photo on the academy profile.', 'camera', 16, 'academy', 1),
    (p_project, 'team_behind',     'Team behind the team','Three or more staff members of the academy listed.', 'users-round', 17, 'academy', 2),
    (p_project, 'well_equipped',   'Well equipped',      'Balls, bibs, cones and a first-aid kit in good condition.', 'package', 18, 'academy', 3),
    -- training
    (p_project, 'session_streak',  'Four-week streak',   'A training session logged every week for four weeks.', 'flame', 20, 'streak', 1),
    (p_project, 'session_streak_12','Twelve-week streak','A training session logged every week for twelve weeks.', 'flame', 21, 'streak', 2),
    (p_project, 'session_streak_26','Half-year streak',  'A training session logged every week for 26 weeks.', 'flame', 22, 'streak', 3),
    (p_project, 'sessions_25',     '25 sessions',        '25 training sessions logged.', 'clipboard-list', 23, 'sessions', 1),
    (p_project, 'sessions_100',    '100 sessions',       '100 training sessions logged.', 'clipboard-list', 24, 'sessions', 2),
    (p_project, 'sessions_250',    '250 sessions',       '250 training sessions logged.', 'clipboard-list', 25, 'sessions', 3),
    (p_project, 'all_rounder',     'All-rounder',        'Sessions with five different focuses in one season.', 'sparkles', 26, 'method', 1),
    (p_project, 'gk_coach',        'Goalkeeper coach',   'Three goalkeeping sessions logged.', 'hand', 27, 'method', 2),
    (p_project, 'perfect_attendance','Everyone came',    'A session with 10 or more players and nobody missing.', 'check-check', 28, 'method', 3),
    -- matches
    (p_project, 'first_match',     'First match',        'The first match logged.', 'swords', 30, 'matches', 1),
    (p_project, 'matches_10',      '10 matches',         '10 matches logged.', 'swords', 31, 'matches', 2),
    (p_project, 'matches_50',      '50 matches',         '50 matches logged.', 'swords', 32, 'matches', 3),
    (p_project, 'first_official',  'Official football',  'A league, cup or tournament match logged.', 'trophy', 33, 'competition', 1),
    (p_project, 'tournament',      'Tournament team',    'Three tournament matches logged.', 'trophy', 34, 'competition', 2),
    (p_project, 'goals_50',        '50 goals',           '50 goals by your players logged in matches.', 'goal', 35, 'competition', 3),
    -- pathway
    (p_project, 'first_selection', 'First selection',    'A player selected for the first time.', 'star', 40, 'pathway', 1),
    (p_project, 'province_final',  'Province final',     'A player at a province final.', 'medal', 41, 'pathway', 2),
    (p_project, 'national_final',  'National final',     'A player at the national final.', 'medal', 42, 'pathway', 3),
    (p_project, 'tony_squad',      'Tony squad',         'A player of yours joined a Tony squad.', 'crown', 43, 'pathway', 4),
    (p_project, 'camp_regular',    'Camp regular',       'Arrived at three camps with your players.', 'tent', 44, 'camps', 1),
    (p_project, 'always_on_time',  'Always on time',     'Three invitations answered before the deadline.', 'clock', 45, 'camps', 2),
    (p_project, 'ten_submitted',   'Talent spotter',     'Ten different players submitted to camps.', 'eye', 46, 'camps', 3),
    -- engagement
    (p_project, 'active_10',       'Ten active weeks',   'Used the portal ten weeks in a row.', 'calendar-check', 50, 'habit', 1),
    (p_project, 'active_26',       'Half a year active', 'Used the portal 26 weeks in a row.', 'calendar-check', 51, 'habit', 2),
    (p_project, 'active_52',       'A whole year',       'Used the portal 52 weeks in a row.', 'calendar-check', 52, 'habit', 3)
  on conflict (project_id, code) do update set family = excluded.family, tier = excluded.tier, sort = excluded.sort, icon = excluded.icon, description = excluded.description;
end $$;
select public.seed_points(id) from public.projects;

-- ───────── Badge checks ─────────
create or replace function public.check_badges(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_proj uuid; v_academy uuid; v_season uuid; n int; v_active int; wk date; streak int;
begin
  select project_id, academy_id into v_proj, v_academy from public.profiles where id = p_user;
  if v_academy is null then return; end if;
  select id into v_season from public.seasons where project_id = v_proj and is_current_scouting;

  -- squad and profiles
  select count(*) into v_active from public.players where academy_id = v_academy and merged_into is null and archived_at is null and squad_status = 'active';
  if exists (select 1 from public.players where academy_id = v_academy and merged_into is null and archived_at is null) then perform public.give_badge(p_user, v_proj, 'first_player'); end if;
  if v_active >= 15 then perform public.give_badge(p_user, v_proj, 'full_squad'); end if;
  if v_active >= 25 then perform public.give_badge(p_user, v_proj, 'big_squad'); end if;
  if v_active >= 8 and not exists (select 1 from public.players where academy_id = v_academy and merged_into is null and archived_at is null and squad_status = 'active' and (photo_path is null or height_cm is null or weight_kg is null)) then perform public.give_badge(p_user, v_proj, 'profiles_done'); end if;
  if v_active >= 8 and not exists (select 1 from public.players where academy_id = v_academy and merged_into is null and archived_at is null and squad_status = 'active' and not guardian_consent) then perform public.give_badge(p_user, v_proj, 'guardians_in'); end if;
  if (select count(*) from public.players where academy_id = v_academy and merged_into is null and archived_at is null and squad_status = 'active' and shirt_no is not null) >= 11 then perform public.give_badge(p_user, v_proj, 'numbers_on'); end if;

  -- academy
  if exists (select 1 from public.academies where id = v_academy and photo_path is not null) then perform public.give_badge(p_user, v_proj, 'team_photo'); end if;
  if (select count(*) from public.academy_staff where academy_id = v_academy and active) >= 3 then perform public.give_badge(p_user, v_proj, 'team_behind'); end if;
  if (select count(*) from public.academy_equipment where academy_id = v_academy and item in ('balls','bibs','cones','first_aid') and condition = 'good' and quantity > 0) = 4 then perform public.give_badge(p_user, v_proj, 'well_equipped'); end if;

  -- training streaks: consecutive weeks with a session, counted back from this week or last week
  streak := 0; wk := date_trunc('week', current_date)::date;
  if not exists (select 1 from public.academy_sessions where academy_id = v_academy and held_on >= wk) then wk := wk - 7; end if;
  loop
    exit when not exists (select 1 from public.academy_sessions where academy_id = v_academy and held_on >= wk and held_on < wk + 7);
    streak := streak + 1; wk := wk - 7;
    exit when streak >= 60;
  end loop;
  if streak >= 4 then perform public.give_badge(p_user, v_proj, 'session_streak'); end if;
  if streak >= 12 then perform public.give_badge(p_user, v_proj, 'session_streak_12'); end if;
  if streak >= 26 then perform public.give_badge(p_user, v_proj, 'session_streak_26'); end if;
  select count(*) into n from public.academy_sessions where academy_id = v_academy;
  if n >= 25 then perform public.give_badge(p_user, v_proj, 'sessions_25'); end if;
  if n >= 100 then perform public.give_badge(p_user, v_proj, 'sessions_100'); end if;
  if n >= 250 then perform public.give_badge(p_user, v_proj, 'sessions_250'); end if;
  if (select count(distinct f) from public.academy_sessions s, unnest(s.focus) f where s.academy_id = v_academy and s.held_on > current_date - 365) >= 5 then perform public.give_badge(p_user, v_proj, 'all_rounder'); end if;
  if (select count(*) from public.academy_sessions where academy_id = v_academy and 'goalkeeping' = any(focus)) >= 3 then perform public.give_badge(p_user, v_proj, 'gk_coach'); end if;
  if exists (select 1 from public.academy_sessions s where s.academy_id = v_academy
              and (select count(*) from public.academy_session_players sp where sp.session_id = s.id and sp.present) >= greatest(10, v_active)) then perform public.give_badge(p_user, v_proj, 'perfect_attendance'); end if;

  -- matches
  select count(*) into n from public.academy_matches where academy_id = v_academy;
  if n >= 1 then perform public.give_badge(p_user, v_proj, 'first_match'); end if;
  if n >= 10 then perform public.give_badge(p_user, v_proj, 'matches_10'); end if;
  if n >= 50 then perform public.give_badge(p_user, v_proj, 'matches_50'); end if;
  if exists (select 1 from public.academy_matches where academy_id = v_academy and kind in ('league','cup','tournament')) then perform public.give_badge(p_user, v_proj, 'first_official'); end if;
  if (select count(*) from public.academy_matches where academy_id = v_academy and kind = 'tournament') >= 3 then perform public.give_badge(p_user, v_proj, 'tournament'); end if;
  if (select coalesce(sum(mp.goals), 0) from public.academy_match_players mp join public.academy_matches m on m.id = mp.match_id where m.academy_id = v_academy) >= 50 then perform public.give_badge(p_user, v_proj, 'goals_50'); end if;

  -- pathway and camps
  if exists (select 1 from public.camp_participants cp join public.players p on p.id = cp.player_id where p.academy_id = v_academy and cp.decision = 'selected' and cp.decision_published) then perform public.give_badge(p_user, v_proj, 'first_selection'); end if;
  if exists (select 1 from public.camp_participants cp join public.players p on p.id = cp.player_id join public.camps c on c.id = cp.camp_id where p.academy_id = v_academy and c.stage = 'province_final' and cp.status in ('confirmed','attended')) then perform public.give_badge(p_user, v_proj, 'province_final'); end if;
  if exists (select 1 from public.camp_participants cp join public.players p on p.id = cp.player_id join public.camps c on c.id = cp.camp_id where p.academy_id = v_academy and c.stage = 'national_final' and cp.status in ('confirmed','attended')) then perform public.give_badge(p_user, v_proj, 'national_final'); end if;
  if exists (select 1 from public.players where academy_id = v_academy and pool_status = 'tony_squad') then perform public.give_badge(p_user, v_proj, 'tony_squad'); end if;
  if (select count(*) from public.camp_bookings where academy_id = v_academy and status = 'arrived') >= 3 then perform public.give_badge(p_user, v_proj, 'camp_regular'); end if;
  if (select count(*) from public.point_events where user_id = p_user and rule = 'rsvp.on_time' and voided_at is null) >= 3 then perform public.give_badge(p_user, v_proj, 'always_on_time'); end if;
  if (select count(distinct cp.player_id) from public.camp_participants cp join public.players p on p.id = cp.player_id where p.academy_id = v_academy and cp.status <> 'removed') >= 10 then perform public.give_badge(p_user, v_proj, 'ten_submitted'); end if;

  -- habit: consecutive active weeks (weekly.active events)
  streak := 0; wk := date_trunc('week', current_date)::date;
  if not exists (select 1 from public.point_events where user_id = p_user and rule = 'weekly.active' and voided_at is null and created_at >= wk) then wk := wk - 7; end if;
  loop
    exit when not exists (select 1 from public.point_events where user_id = p_user and rule = 'weekly.active' and voided_at is null and created_at >= wk and created_at < wk + 7);
    streak := streak + 1; wk := wk - 7;
    exit when streak >= 60;
  end loop;
  if streak >= 10 then perform public.give_badge(p_user, v_proj, 'active_10'); end if;
  if streak >= 26 then perform public.give_badge(p_user, v_proj, 'active_26'); end if;
  if streak >= 52 then perform public.give_badge(p_user, v_proj, 'active_52'); end if;
end $$;

-- ───────── Coach functions ─────────
create or replace function public.coach_sessions(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx(p_academy);
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'held_on', s.held_on, 'topic', s.topic, 'focus', to_jsonb(s.focus), 'intensity', s.intensity, 'duration_min', s.duration_min, 'notes', s.notes,
            'present', (select count(*) from public.academy_session_players sp where sp.session_id = s.id and sp.present),
            'players', coalesce((select jsonb_agg(sp.player_id) from public.academy_session_players sp where sp.session_id = s.id and sp.present), '[]'::jsonb)) order by s.held_on desc, s.created_at desc)
          from (select * from public.academy_sessions where academy_id = ctx.v_academy order by held_on desc limit 60) s), '[]'::jsonb);
end $$;

create or replace function public.coach_save_session(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid; v_day date; pid uuid; v_focus text[]; v_present int; v_active int; v_new boolean;
begin
  select * into ctx from public.coach_ctx();
  v_day := nullif(p->>'held_on','')::date;
  if v_day is null or v_day > current_date then raise exception 'Enter the day of the session (today or earlier)'; end if;
  if v_day < current_date - 60 then raise exception 'Sessions can be logged up to 60 days back'; end if;
  v_focus := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'focus', '[]'::jsonb)) x where x in ('technical','tactical','physical','goalkeeping','games','set_pieces','mental','recovery')), '{}');
  v_new := p_id is null or not exists (select 1 from public.academy_sessions where id = p_id);
  if v_new then
    insert into public.academy_sessions(id, academy_id, held_on, topic, focus, intensity, duration_min, notes, created_by)
    values (coalesce(p_id, gen_random_uuid()), ctx.v_academy, v_day, nullif(p->>'topic',''), v_focus, nullif(p->>'intensity',''), nullif(p->>'duration_min','')::int, nullif(p->>'notes',''), auth.uid())
    returning id into v_id;
  else
    update public.academy_sessions set held_on = v_day, topic = nullif(p->>'topic',''), focus = v_focus, intensity = nullif(p->>'intensity',''), duration_min = nullif(p->>'duration_min','')::int, notes = nullif(p->>'notes','')
     where id = p_id and academy_id = ctx.v_academy returning id into v_id;
    if v_id is null then raise exception 'Session not found'; end if;
    delete from public.academy_session_players where session_id = v_id;
  end if;
  for pid in select (x)::uuid from jsonb_array_elements_text(coalesce(p->'players', '[]'::jsonb)) x loop
    if exists (select 1 from public.players where id = pid and academy_id = ctx.v_academy) then
      insert into public.academy_session_players(session_id, player_id, present) values (v_id, pid, true) on conflict do nothing;
    end if;
  end loop;
  select count(*) into v_present from public.academy_session_players where session_id = v_id and present;
  select count(*) into v_active from public.players where academy_id = ctx.v_academy and merged_into is null and archived_at is null and squad_status = 'active';
  if v_active >= 8 and v_present >= ceil(v_active * 0.8) then perform public.award_academy('session.full_attendance', ctx.v_academy, 'academy_sessions', v_id::text); end if;
  perform public.check_badges(u.id) from (select id from public.profiles where academy_id = ctx.v_academy and role = 'coach' and status = 'active') u;
  return v_id;
end $$;

create or replace function public.coach_matches(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx(p_academy);
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'played_on', m.played_on, 'kind', m.kind, 'opponent', m.opponent, 'venue', m.venue, 'age_group', m.age_group,
            'goals_for', m.goals_for, 'goals_against', m.goals_against, 'notes', m.notes,
            'players', coalesce((select jsonb_agg(jsonb_build_object('player_id', mp.player_id, 'goals', mp.goals)) from public.academy_match_players mp where mp.match_id = m.id), '[]'::jsonb)) order by m.played_on desc, m.created_at desc)
          from (select * from public.academy_matches where academy_id = ctx.v_academy order by played_on desc limit 60) m), '[]'::jsonb);
end $$;

create or replace function public.coach_save_match(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid; v_day date; v_kind text; r record; v_new boolean;
begin
  select * into ctx from public.coach_ctx();
  v_day := nullif(p->>'played_on','')::date;
  if v_day is null or v_day > current_date then raise exception 'Enter the day of the match (today or earlier)'; end if;
  if v_day < current_date - 90 then raise exception 'Matches can be logged up to 90 days back'; end if;
  v_kind := p->>'kind';
  if v_kind not in ('internal','friendly','league','cup','tournament','tony') then raise exception 'Choose the kind of match'; end if;
  v_new := p_id is null or not exists (select 1 from public.academy_matches where id = p_id);
  if v_new then
    insert into public.academy_matches(id, academy_id, played_on, kind, opponent, venue, age_group, goals_for, goals_against, notes, created_by)
    values (coalesce(p_id, gen_random_uuid()), ctx.v_academy, v_day, v_kind, nullif(trim(p->>'opponent'),''), nullif(p->>'venue',''), nullif(p->>'age_group',''),
            nullif(p->>'goals_for','')::smallint, nullif(p->>'goals_against','')::smallint, nullif(p->>'notes',''), auth.uid())
    returning id into v_id;
  else
    update public.academy_matches set played_on = v_day, kind = v_kind, opponent = nullif(trim(p->>'opponent'),''), venue = nullif(p->>'venue',''), age_group = nullif(p->>'age_group',''),
           goals_for = nullif(p->>'goals_for','')::smallint, goals_against = nullif(p->>'goals_against','')::smallint, notes = nullif(p->>'notes','')
     where id = p_id and academy_id = ctx.v_academy returning id into v_id;
    if v_id is null then raise exception 'Match not found'; end if;
    delete from public.academy_match_players where match_id = v_id;
  end if;
  for r in select (x->>'player_id')::uuid as pid, coalesce((x->>'goals')::smallint, 0) as goals from jsonb_array_elements(coalesce(p->'players', '[]'::jsonb)) x loop
    if exists (select 1 from public.players where id = r.pid and academy_id = ctx.v_academy) then
      insert into public.academy_match_players(match_id, player_id, goals) values (v_id, r.pid, greatest(0, r.goals)) on conflict (match_id, player_id) do update set goals = excluded.goals;
    end if;
  end loop;
  if v_new then
    perform public.award_academy('match.logged', ctx.v_academy, 'academy_matches', v_id::text);
    if v_kind in ('league','cup','tournament') then perform public.award_academy('match.official', ctx.v_academy, 'academy_matches', v_id::text); end if;
  end if;
  perform public.check_badges(u.id) from (select id from public.profiles where academy_id = ctx.v_academy and role = 'coach' and status = 'active') u;
  return v_id;
end $$;

create or replace function public.coach_delete_match(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  delete from public.academy_matches where id = p_id and academy_id = ctx.v_academy;
end $$;

create or replace function public.coach_save_staff(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid; v_new boolean;
begin
  select * into ctx from public.coach_ctx();
  if nullif(trim(p->>'name'), '') is null then raise exception 'Give the name'; end if;
  if p->>'role' not in ('head_coach','assistant','gk_coach','fitness','physio','manager','volunteer','other') then raise exception 'Choose the role'; end if;
  v_new := p_id is null or not exists (select 1 from public.academy_staff where id = p_id);
  if v_new then
    insert into public.academy_staff(id, academy_id, name, role, phone, since_year, active, notes)
    values (coalesce(p_id, gen_random_uuid()), ctx.v_academy, trim(p->>'name'), p->>'role', nullif(trim(p->>'phone'),''), nullif(p->>'since_year','')::int, coalesce((p->>'active')::boolean, true), nullif(p->>'notes',''))
    returning id into v_id;
    perform public.award_academy('staff.member_added', ctx.v_academy, 'academy_staff', v_id::text);
  else
    update public.academy_staff set name = trim(p->>'name'), role = p->>'role', phone = nullif(trim(p->>'phone'),''), since_year = nullif(p->>'since_year','')::int, active = coalesce((p->>'active')::boolean, active), notes = nullif(p->>'notes','')
     where id = p_id and academy_id = ctx.v_academy returning id into v_id;
    if v_id is null then raise exception 'Not found'; end if;
  end if;
  perform public.check_badges(u.id) from (select id from public.profiles where academy_id = ctx.v_academy and role = 'coach' and status = 'active') u;
  return v_id;
end $$;

create or replace function public.coach_delete_staff(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  delete from public.academy_staff where id = p_id and academy_id = ctx.v_academy;
end $$;

-- the whole equipment list in one go: [{item, quantity, condition, notes}]
create or replace function public.coach_save_equipment(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record; x jsonb;
begin
  select * into ctx from public.coach_ctx();
  for x in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    if x->>'item' not in ('balls','bibs','cones','goals','nets','first_aid','water','kits','gk_gloves','pump','whistle','other') then continue; end if;
    insert into public.academy_equipment(academy_id, item, quantity, condition, notes, updated_at)
    values (ctx.v_academy, x->>'item', greatest(0, coalesce((x->>'quantity')::int, 0)), coalesce(nullif(x->>'condition',''), 'good'), nullif(x->>'notes',''), now())
    on conflict (academy_id, item) do update set quantity = excluded.quantity, condition = excluded.condition, notes = excluded.notes, updated_at = now();
  end loop;
  update public.academies set equipment_updated_at = now() where id = ctx.v_academy;
  perform public.award_academy('equipment.updated', ctx.v_academy, 'academies', ctx.v_academy::text || ':' || to_char(now(), 'YYYY-MM'));
  perform public.check_badges(u.id) from (select id from public.profiles where academy_id = ctx.v_academy and role = 'coach' and status = 'active') u;
end $$;

-- academy profile now carries the staff and the equipment
create or replace function public.coach_academy(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx(p_academy);
  return (select jsonb_build_object('id', a.id, 'name', a.name, 'district', d.name, 'region', r.name, 'contact_name', a.contact_name, 'contact_phone', a.contact_phone,
            'venue', a.venue, 'training_days', a.training_days, 'training_time', a.training_time, 'players_count', a.players_count, 'age_groups', a.age_groups,
            'photo_path', a.photo_path, 'programme_status', a.programme_status, 'profile_updated_at', a.profile_updated_at, 'equipment_updated_at', a.equipment_updated_at,
            'complete', a.venue is not null and cardinality(a.training_days) > 0 and a.contact_phone is not null and cardinality(a.age_groups) > 0,
            'staff', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'phone', s.phone, 'since_year', s.since_year, 'active', s.active, 'notes', s.notes) order by s.active desc, s.created_at) from public.academy_staff s where s.academy_id = a.id), '[]'::jsonb),
            'equipment', coalesce((select jsonb_agg(jsonb_build_object('item', e.item, 'quantity', e.quantity, 'condition', e.condition, 'notes', e.notes, 'updated_at', e.updated_at) order by e.item) from public.academy_equipment e where e.academy_id = a.id), '[]'::jsonb))
            from public.academies a left join public.districts d on d.id = a.district_id left join public.regions r on r.id = d.region_id where a.id = ctx.v_academy);
end $$;

-- players measured again after two months earn a little
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
  if tg_op = 'UPDATE' and new.measured_on is not null and old.measured_on is not null and new.measured_on - old.measured_on >= 60 and new.academy_id is not null then
    perform public.award_academy('player.remeasured', new.academy_id, 'players', new.id::text || ':' || new.measured_on::text);
  end if;
  if new.guardian_consent and (tg_op = 'INSERT' or not old.guardian_consent) and new.academy_id is not null then
    perform public.award_academy('player.guardian_consent', new.academy_id, 'players', new.id::text);
  end if;
  if tg_op = 'UPDATE' and new.pool_status = 'tony_squad' and old.pool_status is distinct from 'tony_squad' and new.academy_id is not null then
    perform public.award_academy('player.tony_squad', new.academy_id, 'players', new.id::text);
  end if;
  return null;
end $$;

-- academy photo
create or replace function public.points_academies() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.venue is not null and cardinality(new.training_days) > 0 and new.contact_phone is not null and cardinality(new.age_groups) > 0 then
    perform public.award_academy('academy.profile_complete', new.id, 'academies', new.id::text);
  end if;
  if new.photo_path is not null and (old.photo_path is null) then
    perform public.award_academy('academy.photo', new.id, 'academies', new.id::text);
    perform public.check_badges(u.id) from (select id from public.profiles where academy_id = new.id and role = 'coach' and status = 'active') u;
  end if;
  return null;
end $$;

-- ───────── What the staff sees ─────────
create or replace function public.academy_activity(p_academy uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sessions_30d', (select count(*) from public.academy_sessions where academy_id = p_academy and held_on > current_date - 30),
    'sessions_90d', (select count(*) from public.academy_sessions where academy_id = p_academy and held_on > current_date - 90),
    'last_session', (select max(held_on) from public.academy_sessions where academy_id = p_academy),
    'matches_90d', (select count(*) from public.academy_matches where academy_id = p_academy and played_on > current_date - 90),
    'last_match', (select max(played_on) from public.academy_matches where academy_id = p_academy),
    'players', (select count(*) from public.players where academy_id = p_academy and merged_into is null and archived_at is null and squad_status = 'active'),
    'with_photo', (select count(*) from public.players where academy_id = p_academy and merged_into is null and archived_at is null and photo_path is not null),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'role', role, 'phone', phone) order by created_at) from public.academy_staff where academy_id = p_academy and active), '[]'::jsonb),
    'equipment', coalesce((select jsonb_agg(jsonb_build_object('item', item, 'quantity', quantity, 'condition', condition) order by item) from public.academy_equipment where academy_id = p_academy), '[]'::jsonb),
    'equipment_updated_at', (select equipment_updated_at from public.academies where id = p_academy),
    'coaches', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(full_name, username), 'last_seen_at', last_seen_at)) from public.profiles where academy_id = p_academy and role = 'coach' and status = 'active'), '[]'::jsonb))
  where public.is_staff()
$$;

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
    'badges', (select jsonb_agg(jsonb_build_object('code', b.code, 'label', b.label, 'description', b.description, 'icon', b.icon, 'family', b.family, 'tier', b.tier, 'earned_at', ub.earned_at) order by b.sort)
                 from public.badges b left join public.user_badges ub on ub.badge = b.code and ub.user_id = v_user where b.project_id = ctx.v_project),
    'rules', (select jsonb_agg(jsonb_build_object('code', code, 'points', points, 'label', label, 'description', description, 'cap', cap, 'cap_period', cap_period) order by sort)
                from public.point_rules where project_id = ctx.v_project and active and code not like 'staff.bonus' and code not like 'staff.penalty'),
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

do $$ declare f text; begin
  foreach f in array array['coach_sessions(uuid)','coach_save_session(uuid,jsonb)','coach_matches(uuid)','coach_save_match(uuid,jsonb)','coach_delete_match(uuid)',
                           'coach_save_staff(uuid,jsonb)','coach_delete_staff(uuid)','coach_save_equipment(jsonb)','coach_academy(uuid)','academy_activity(uuid)','coach_progress(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
