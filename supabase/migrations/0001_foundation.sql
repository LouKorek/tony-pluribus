-- Pluribus · 0001 foundation
-- Tenancy, geography, users, scouting core, audit. Every row is scoped to organization -> project -> season.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── Tenancy ─────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null unique,
  country text,
  timezone text not null default 'UTC',
  partner text,
  sharepoint_root text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,               -- e.g. 2027-2028
  starts_on date,
  ends_on date,
  is_current_scouting boolean not null default false,
  is_current_operational boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, label)
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  unique (project_id, name)
);

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  name text not null,
  unique (project_id, name)
);

create table public.age_groups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  code text not null,                -- U11, U13, U15
  birth_year_from int not null,
  birth_year_to int not null,
  sort int not null default 0,
  unique (season_id, code)
);

-- ───────────────────────── Users ─────────────────────────
create type public.app_role as enum ('owner','admin','staff','scout','observer','coach');
create type public.user_status as enum ('pending','active','locked');

create table public.academies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  district_id uuid references public.districts(id),
  name text not null,
  aliases text[] not null default '{}',
  contact_name text,
  contact_phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (project_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text,
  phone text,
  role public.app_role not null default 'coach',
  status public.user_status not null default 'pending',
  org_id uuid references public.organizations(id),
  project_id uuid references public.projects(id),
  academy_id uuid references public.academies(id),
  requested_academy text,            -- free text when the academy is not in the list
  region_id uuid references public.regions(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Scouting ─────────────────────────
create table public.academy_seasons (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  visit_date date,
  scouted int,
  selected int,
  rating text,
  status text,
  obs text,
  unique (academy_id, season_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_year int,
  birth_date date,
  age_status text not null default 'declared' check (age_status in ('declared','doubtful','verified')),
  preferred_foot text check (preferred_foot in ('left','right','both')),
  positions text,
  academy_id uuid references public.academies(id),
  district_id uuid references public.districts(id),
  guardian_name text,
  guardian_phone text,
  guardian_consent boolean not null default false,
  coach_notes text,
  staff_notes text,
  pool_status text not null default 'academy_squad'
    check (pool_status in ('academy_squad','submitted','observed','province_final','national_final','selected','see_again','not_selected','tony_squad','released')),
  source text not null default 'staff' check (source in ('portal','staff','import')),
  merged_into uuid references public.players(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index players_academy_idx on public.players(academy_id);
create index players_name_idx on public.players(lower(last_name), lower(first_name), birth_year);

create type public.camp_stage as enum ('district','province_final','national_final');

create table public.camps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  stage public.camp_stage not null,
  name text not null,
  region_id uuid references public.regions(id),
  district_id uuid references public.districts(id),
  age_groups text[] not null default '{U11,U13,U15}',
  starts_on date,
  ends_on date,
  venue text,
  duration text,
  staff text,
  notes text,
  status text not null default 'planned' check (status in ('planned','open','completed','published','cancelled')),
  submissions_open boolean not null default false,
  rsvp_deadline date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index camps_season_idx on public.camps(season_id, starts_on);

create table public.camp_participants (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  age_group text,
  status text not null default 'submitted'
    check (status in ('submitted','invited','confirmed','declined','attended','absent','removed')),
  sprint_10m numeric(5,3),
  sprint_20m numeric(5,3),
  cj_cm numeric(6,1),
  obs text check (obs in ('A','B+','B','C')),
  decision text check (decision in ('selected','see_again','not_selected')),
  is_goalkeeper boolean not null default false,
  grade_a boolean not null default false,
  position text,
  team text,
  comment text,
  absence_reason text,
  submitted_by uuid references public.profiles(id),
  submission_note text,
  coach_message text,
  decision_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (camp_id, player_id)
);
create index cp_player_idx on public.camp_participants(player_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb
);

-- ───────────────────────── Helpers ─────────────────────────
create or replace function public.current_role_name() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('owner','admin'), false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('owner','admin','staff','scout','observer'), false)
$$;

create or replace function public.can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('owner','admin','staff','scout'), false)
$$;

create or replace function public.my_academy() returns uuid
language sql stable security definer set search_path = public as $$
  select academy_id from public.profiles where id = auth.uid() and status = 'active' and role = 'coach'
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger players_touch before update on public.players for each row execute function public.touch_updated_at();
create trigger cp_touch before update on public.camp_participants for each row execute function public.touch_updated_at();

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(user_id, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name,
          case when tg_op = 'DELETE' then old.id else new.id end,
          lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['academies','academy_seasons','players','camps','camp_participants','profiles','seasons','age_groups'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t||'_audit', t);
  end loop;
end $$;

-- New auth user -> profile. The first "loukorek" sign-up becomes the owner; everyone else is a pending coach.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_username text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)));
  v_org uuid; v_proj uuid;
  v_is_owner boolean;
begin
  select id into v_org from public.organizations order by created_at limit 1;
  select id into v_proj from public.projects order by created_at limit 1;
  v_is_owner := v_username = 'loukorek' and not exists (select 1 from public.profiles where role = 'owner');
  insert into public.profiles(id, username, full_name, phone, role, status, org_id, project_id, academy_id, requested_academy)
  values (new.id, v_username,
          nullif(new.raw_user_meta_data->>'full_name',''),
          nullif(new.raw_user_meta_data->>'phone',''),
          case when v_is_owner then 'owner'::public.app_role else 'coach'::public.app_role end,
          case when v_is_owner then 'active'::public.user_status else 'pending'::public.user_status end,
          v_org, v_proj,
          nullif(new.raw_user_meta_data->>'academy_id','')::uuid,
          nullif(new.raw_user_meta_data->>'requested_academy',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────────────────── Admin RPCs ─────────────────────────
create or replace function public.admin_create_user(
  p_username text, p_password text, p_full_name text, p_role public.app_role,
  p_phone text default null, p_academy_id uuid default null, p_region_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_id uuid := gen_random_uuid(); v_email text;
begin
  if not public.is_admin() then raise exception 'Only owners and admins can create users'; end if;
  if p_role = 'owner' and public.current_role_name() <> 'owner' then raise exception 'Only the owner can create another owner'; end if;
  p_username := lower(trim(p_username));
  if p_username !~ '^[a-z0-9._-]{3,32}$' then raise exception 'Username must be 3-32 letters, digits, dots, dashes or underscores'; end if;
  if length(p_password) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if exists (select 1 from public.profiles where username = p_username) then raise exception 'Username already taken'; end if;
  if p_role = 'coach' and p_academy_id is null then raise exception 'A coach must be linked to an academy'; end if;
  v_email := p_username || '@users.pluribus.app';
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('username', p_username, 'full_name', p_full_name, 'phone', p_phone),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());
  update public.profiles
     set role = p_role, status = 'active', academy_id = p_academy_id, region_id = p_region_id,
         approved_by = auth.uid(), approved_at = now()
   where id = v_id;
  return v_id;
end $$;

create or replace function public.admin_update_user(
  p_user_id uuid, p_role public.app_role, p_status public.user_status,
  p_full_name text, p_phone text, p_academy_id uuid, p_region_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_target public.profiles;
begin
  if not public.is_admin() then raise exception 'Only owners and admins can edit users'; end if;
  select * into v_target from public.profiles where id = p_user_id;
  if v_target.id is null then raise exception 'User not found'; end if;
  if v_target.role = 'owner' and public.current_role_name() <> 'owner' then raise exception 'Only the owner can edit an owner'; end if;
  if p_role = 'owner' and public.current_role_name() <> 'owner' then raise exception 'Only the owner can grant owner'; end if;
  if p_user_id = auth.uid() and (p_status <> 'active' or p_role <> v_target.role) then raise exception 'You cannot change your own role or lock yourself'; end if;
  if p_role = 'coach' and p_status = 'active' and p_academy_id is null then raise exception 'An active coach must be linked to an academy'; end if;
  update public.profiles
     set role = p_role, status = p_status, full_name = p_full_name, phone = p_phone,
         academy_id = p_academy_id, region_id = p_region_id,
         approved_by = case when v_target.status = 'pending' and p_status = 'active' then auth.uid() else approved_by end,
         approved_at = case when v_target.status = 'pending' and p_status = 'active' then now() else approved_at end
   where id = p_user_id;
  if p_status = 'locked' then delete from auth.refresh_tokens where user_id = p_user_id::text; end if;
end $$;

create or replace function public.admin_set_password(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.is_admin() then raise exception 'Only owners and admins can reset passwords'; end if;
  if (select role from public.profiles where id = p_user_id) = 'owner' and public.current_role_name() <> 'owner' then
    raise exception 'Only the owner can reset an owner password'; end if;
  if length(p_password) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user_id;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
end $$;

create or replace function public.touch_last_seen() returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid()
$$;

-- Public data the sign-up screen needs before login
create or replace function public.signup_options()
returns table (academy_id uuid, academy text, district text, region text)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, d.name, r.name
    from public.academies a
    left join public.districts d on d.id = a.district_id
    left join public.regions r on r.id = d.region_id
   where a.is_active
   order by r.sort, d.name, a.name
$$;

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(trim(p_username)))
$$;

create or replace function public.owner_exists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where role = 'owner')
$$;

revoke execute on function public.admin_create_user(text,text,text,public.app_role,text,uuid,uuid) from public, anon;
revoke execute on function public.admin_update_user(uuid,public.app_role,public.user_status,text,text,uuid,uuid) from public, anon;
revoke execute on function public.admin_set_password(uuid,text) from public, anon;
revoke execute on function public.touch_last_seen() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
grant execute on function public.admin_create_user(text,text,text,public.app_role,text,uuid,uuid) to authenticated;
grant execute on function public.admin_update_user(uuid,public.app_role,public.user_status,text,text,uuid,uuid) to authenticated;
grant execute on function public.admin_set_password(uuid,text) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.signup_options() to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.owner_exists() to anon, authenticated;

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.seasons enable row level security;
alter table public.regions enable row level security;
alter table public.districts enable row level security;
alter table public.age_groups enable row level security;
alter table public.academies enable row level security;
alter table public.profiles enable row level security;
alter table public.academy_seasons enable row level security;
alter table public.players enable row level security;
alter table public.camps enable row level security;
alter table public.camp_participants enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- reference data: readable by any active user, written by admins
do $$ declare t text; begin
  foreach t in array array['organizations','projects','seasons','regions','districts','age_groups'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active_user())', t||'_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_admin', t);
  end loop;
end $$;

create policy academies_read on public.academies for select to authenticated
  using (public.is_staff() or id = public.my_academy());
create policy academies_write on public.academies for all to authenticated
  using (public.can_edit()) with check (public.can_edit());

create policy acs_read on public.academy_seasons for select to authenticated using (public.is_staff());
create policy acs_write on public.academy_seasons for all to authenticated using (public.can_edit()) with check (public.can_edit());

create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_admin on public.profiles for select to authenticated using (public.is_admin());

create policy players_staff_read on public.players for select to authenticated using (public.is_staff());
create policy players_staff_write on public.players for all to authenticated using (public.can_edit()) with check (public.can_edit());
create policy players_coach_read on public.players for select to authenticated using (academy_id = public.my_academy());
create policy players_coach_insert on public.players for insert to authenticated
  with check (academy_id = public.my_academy() and source = 'portal' and pool_status = 'academy_squad');
create policy players_coach_update on public.players for update to authenticated
  using (academy_id = public.my_academy()) with check (academy_id = public.my_academy());

create policy camps_read on public.camps for select to authenticated using (public.is_active_user());
create policy camps_write on public.camps for all to authenticated using (public.can_edit()) with check (public.can_edit());

-- coaches never read camp_participants directly (scout grades stay internal); they use coach_* functions in stage 3
create policy cp_staff_read on public.camp_participants for select to authenticated using (public.is_staff());
create policy cp_staff_write on public.camp_participants for all to authenticated using (public.can_edit()) with check (public.can_edit());

create policy notif_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_admin on public.audit_log for select to authenticated using (public.is_admin());

-- Coaches may only touch their own fields on players
create or replace function public.guard_coach_player_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.current_role_name() = 'coach' then
    if new.staff_notes is distinct from old.staff_notes or new.pool_status is distinct from old.pool_status
       or new.age_status is distinct from old.age_status or new.academy_id is distinct from old.academy_id
       or new.merged_into is distinct from old.merged_into or new.source is distinct from old.source then
      raise exception 'Coaches cannot change staff-managed fields';
    end if;
  end if;
  return new;
end $$;
create trigger players_coach_guard before update on public.players for each row execute function public.guard_coach_player_update();
revoke execute on function public.guard_coach_player_update() from public, anon, authenticated;

-- ───────────────────────── Seed ─────────────────────────
with o as (insert into public.organizations(name, slug) values ('Tony Football', 'tony') returning id),
     p as (insert into public.projects(org_id, name, slug, country, timezone, partner, sharepoint_root)
           select id, 'Tony Rwanda', 'tony-rwanda', 'Rwanda', 'Africa/Kigali', 'SL Benfica',
                  'https://tonyrw212.sharepoint.com/sites/TonyRW/Shared Documents/Talent' from o returning id)
insert into public.seasons(project_id, label, starts_on, ends_on, is_current_scouting, is_current_operational)
select p.id, s.label, s.st::date, s.en::date, s.label = '2027-2028', s.label = '2026-2027'
from p, (values ('2024-2025','2024-07-01','2025-06-30'),('2025-2026','2025-07-01','2026-06-30'),
                ('2026-2027','2026-07-01','2027-06-30'),('2027-2028','2027-07-01','2028-06-30')) s(label, st, en);

insert into public.regions(project_id, name, sort)
select p.id, r.name, r.sort from public.projects p,
  (values ('Kigali City',1),('Northern Province',2),('Southern Province',3),('Eastern Province',4),('Western Province',5)) r(name, sort)
where p.slug = 'tony-rwanda';

insert into public.districts(project_id, region_id, name)
select p.id, r.id, d.name
from public.projects p
join public.regions r on r.project_id = p.id
join (values
  ('Kigali City','Gasabo'),('Kigali City','Kicukiro'),('Kigali City','Nyarugenge'),
  ('Northern Province','Burera'),('Northern Province','Gakenke'),('Northern Province','Gicumbi'),('Northern Province','Musanze'),('Northern Province','Rulindo'),
  ('Southern Province','Gisagara'),('Southern Province','Huye'),('Southern Province','Kamonyi'),('Southern Province','Muhanga'),
  ('Southern Province','Nyamagabe'),('Southern Province','Nyanza'),('Southern Province','Nyaruguru'),('Southern Province','Ruhango'),
  ('Eastern Province','Bugesera'),('Eastern Province','Gatsibo'),('Eastern Province','Kayonza'),('Eastern Province','Kirehe'),
  ('Eastern Province','Ngoma'),('Eastern Province','Nyagatare'),('Eastern Province','Rwamagana'),
  ('Western Province','Karongi'),('Western Province','Ngororero'),('Western Province','Nyabihu'),('Western Province','Nyamasheke'),
  ('Western Province','Rubavu'),('Western Province','Rusizi'),('Western Province','Rutsiro')
) d(region, name) on d.region = r.name
where p.slug = 'tony-rwanda';

insert into public.age_groups(season_id, code, birth_year_from, birth_year_to, sort)
select s.id, a.code, a.f, a.t, a.sort
from public.seasons s join public.projects p on p.id = s.project_id,
  (values ('U11',2016,2017,1),('U13',2014,2015,2),('U15',2012,2013,3)) a(code, f, t, sort)
where p.slug = 'tony-rwanda' and s.label = '2027-2028';
