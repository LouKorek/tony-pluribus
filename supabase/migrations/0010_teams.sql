-- Pluribus · 0010 Tony teams: squads, attendance, physical tests, training, matches, evaluations

-- ───────── Access areas (one list for the whole system) ─────────
create or replace function public.access_areas() returns text[]
language sql immutable as $$
  select array['academies','camps','players','insights','squads','attendance','physical','training','matches','evaluations',
               'player_files','staff_reports','finance','partners','transfers','club_portal','assistant','files','files.private']
$$;

create or replace function public.role_access_default(p_role public.app_role, p_area text) returns smallint
language sql immutable as $$
  select (case
    when p_role in ('owner','admin') then 2
    when p_role = 'coach' then 0
    when p_area in ('files.private','player_files','finance','club_portal') then 0
    when p_area like 'files%' or p_area in ('insights','assistant') then 1
    when p_role = 'staff' then 2
    when p_role = 'scout' then case when p_area in ('camps','players') then 2 else 1 end
    when p_role = 'observer' then 1
    else 0 end)::smallint
$$;

create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(a, public.access_level_for(auth.uid(), a))
    from (select unnest(public.access_areas()) a
          union select 'files:' || name from public.talent_files where parent = '' and is_folder) t
$$;

create or replace function public.admin_get_access(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_role public.app_role;
begin
  if not public.is_admin() then raise exception 'Only owners and admins can manage access'; end if;
  select role into v_role from public.profiles where id = p_user;
  return (select jsonb_agg(jsonb_build_object(
            'area', a, 'default', case when a like 'files:%' then coalesce((select level from public.user_access where user_id = p_user and area = 'files'), public.role_access_default(v_role, 'files')) else public.role_access_default(v_role, a) end,
            'override', (select level from public.user_access where user_id = p_user and area = a),
            'level', public.access_level_for(p_user, a)) order by ord, a)
          from (select a, array_position(public.access_areas(), a) ord from unnest(public.access_areas()) a
                union select 'files:' || name, 100 from public.talent_files where parent = '' and is_folder) t);
end $$;

-- ───────── Teams ─────────
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,                    -- U13, U15, U17, U20 · 2nd Division
  age_group text,
  competitions text,
  folder text,                           -- Talent folder of the team
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (season_id, name)
);

create table if not exists public.team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  position text,                         -- GK, D, M, F
  slot int,                              -- number on the squad board (1-11)
  shirt int,
  status text not null default 'active' check (status in ('active','injured','loan','left')),
  joined_on date,
  left_on date,
  notes text,
  created_at timestamptz not null default now(),
  unique (team_id, player_id)
);
create index if not exists team_players_player on public.team_players(player_id);

-- ───────── Attendance: one row per team day, one mark per player ─────────
create table if not exists public.team_days (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  day date not null,
  seq int not null default 1,             -- second session on the same day
  kind text not null default 'training' check (kind in ('training','match','test','meeting','video','rest')),
  minutes int,
  label text,
  unique (team_id, day, seq)
);
create table if not exists public.attendance (
  day_id uuid not null references public.team_days(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  minutes int,
  code text,                              -- A absent · I injured · JA justified · M match · SM school match · S suspended · SI sick · PT tests · TM team meeting · * video · other team name
  primary key (day_id, player_id)
);
create index if not exists attendance_player on public.attendance(player_id);

-- ───────── Physical tests and body measurements ─────────
create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  taken_on date,
  metric text not null check (metric in ('sprint_10m','sprint_20m','weight_kg','height_cm','foot_cm','cj_cm','yoyo_m','other')),
  value numeric not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists measurements_player on public.measurements(player_id, metric, taken_on);

-- ───────── Training sessions (plans) ─────────
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  number int,                             -- T10
  day date,
  month text,                             -- 2025-10
  microcycle text,
  objective text,
  notes text,
  file_id uuid references public.talent_files(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────── Matches ─────────
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  number int,
  played_on date,
  competition text not null default 'Friendly',
  opponent text not null,
  venue text check (venue in ('home','away','neutral')),
  goals_for int,
  goals_against int,
  notes text,
  report_file_id uuid references public.talent_files(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  minutes int, goals int not null default 0, assists int not null default 0, yellow int not null default 0, red int not null default 0,
  started boolean,
  primary key (match_id, player_id)
);
create index if not exists match_players_player on public.match_players(player_id);

-- ───────── Evaluations ─────────
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  grade text check (grade in ('A','B','C','D')),   -- A potential+performance · B potential · C performance · D neither
  potential int check (potential between 1 and 5),
  performance int check (performance between 1 and 5),
  summary text,
  report_file_id uuid references public.talent_files(id) on delete set null,
  evaluated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (player_id, season_id)
);

alter table public.players add column if not exists photo_file_id uuid references public.talent_files(id) on delete set null;

-- ───────── Access rules ─────────
do $$
declare t text; a text;
begin
  for t, a in select * from (values ('teams','squads'),('team_players','squads'),('team_days','attendance'),('attendance','attendance'),
                                    ('measurements','physical'),('training_sessions','training'),('matches','matches'),('match_players','matches'),
                                    ('evaluations','evaluations')) v(t, a) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.can(%L, 2)) with check (public.can(%L, 2))', t || '_write', t, a, a);
  end loop;
end $$;

-- teams are needed by every football screen
drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams for all to authenticated using (public.can('squads', 2)) with check (public.can('squads', 2));

-- audit trail
do $$ declare t text; begin
  foreach t in array array['teams','team_players','team_days','measurements','training_sessions','matches','evaluations'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ───────── Season summaries ─────────
create or replace function public.team_summary(p_team uuid)
returns table (player_id uuid, sessions int, attended int, minutes int, matches int, goals int, assists int, yellow int, red int,
               sprint_10m numeric, sprint_20m numeric, weight_kg numeric, height_cm numeric, grade text)
language sql stable security invoker set search_path = public as $$
  select tp.player_id,
    (select count(*) from public.team_days d where d.team_id = p_team and d.kind = 'training')::int,
    (select count(*) from public.attendance a join public.team_days d on d.id = a.day_id where d.team_id = p_team and d.kind = 'training' and a.player_id = tp.player_id and coalesce(a.minutes, 0) > 0)::int,
    (select coalesce(sum(a.minutes), 0) from public.attendance a join public.team_days d on d.id = a.day_id where d.team_id = p_team and a.player_id = tp.player_id)::int,
    (select count(*) from public.match_players mp join public.matches m on m.id = mp.match_id where m.team_id = p_team and mp.player_id = tp.player_id)::int,
    (select coalesce(sum(mp.goals), 0) from public.match_players mp join public.matches m on m.id = mp.match_id where m.team_id = p_team and mp.player_id = tp.player_id)::int,
    (select coalesce(sum(mp.assists), 0) from public.match_players mp join public.matches m on m.id = mp.match_id where m.team_id = p_team and mp.player_id = tp.player_id)::int,
    (select coalesce(sum(mp.yellow), 0) from public.match_players mp join public.matches m on m.id = mp.match_id where m.team_id = p_team and mp.player_id = tp.player_id)::int,
    (select coalesce(sum(mp.red), 0) from public.match_players mp join public.matches m on m.id = mp.match_id where m.team_id = p_team and mp.player_id = tp.player_id)::int,
    (select value from public.measurements x where x.player_id = tp.player_id and x.metric = 'sprint_10m' order by taken_on desc nulls last limit 1),
    (select value from public.measurements x where x.player_id = tp.player_id and x.metric = 'sprint_20m' order by taken_on desc nulls last limit 1),
    (select value from public.measurements x where x.player_id = tp.player_id and x.metric = 'weight_kg' order by taken_on desc nulls last limit 1),
    (select value from public.measurements x where x.player_id = tp.player_id and x.metric = 'height_cm' order by taken_on desc nulls last limit 1),
    (select e.grade from public.evaluations e join public.teams t on t.id = p_team where e.player_id = tp.player_id and e.season_id = t.season_id)
  from public.team_players tp where tp.team_id = p_team
$$;
grant execute on function public.team_summary(uuid) to authenticated;
