-- Pluribus · 0009 content access per user
-- Every staff user gets, per content area, a level: 0 none, 1 view, 2 edit.
-- The role gives the default; an owner or admin can override any area for a single user.
-- Areas: academies · camps (plan, camps, sheets, finals) · players (players, pool) · insights (dashboards, reports)
--        files (the Talent folder) · files:<top folder> (one Talent folder) · files.private (personal documents and finance)
-- Users and Settings stay with owners and admins.

create table if not exists public.user_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  area text not null,
  level smallint not null check (level between 0 and 2),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, area)
);
alter table public.user_access enable row level security;
drop policy if exists user_access_self on public.user_access;
create policy user_access_self on public.user_access for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.role_access_default(p_role public.app_role, p_area text) returns smallint
language sql immutable as $$
  select (case
    when p_role in ('owner','admin') then 2
    when p_role = 'coach' then 0
    when p_area = 'files.private' then 0
    when p_area like 'files%' or p_area = 'insights' then 1
    when p_role = 'staff' then 2
    when p_role = 'scout' then case when p_area in ('camps','players') then 2 else 1 end
    when p_role = 'observer' then 1
    else 0 end)::smallint
$$;

create or replace function public.access_level_for(p_user uuid, p_area text) returns smallint
language plpgsql stable security definer set search_path = public as $$
declare v_role public.app_role; v_status public.user_status; v smallint;
begin
  select role, status into v_role, v_status from public.profiles where id = p_user;
  if v_role is null or v_status <> 'active' then return 0; end if;
  if v_role = 'owner' then return 2; end if;
  select level into v from public.user_access where user_id = p_user and area = p_area;
  if v is not null then return v; end if;
  if p_area like 'files:%' then
    select level into v from public.user_access where user_id = p_user and area = 'files';
    if v is not null then return v; end if;
    return public.role_access_default(v_role, 'files');
  end if;
  return public.role_access_default(v_role, p_area);
end $$;

create or replace function public.can(p_area text, p_level int default 1) returns boolean
language sql stable security definer set search_path = public as $$
  select public.access_level_for(auth.uid(), p_area) >= p_level
$$;

create or replace function public.talent_area(p_path text, p_restricted boolean) returns text
language sql immutable as $$
  select case when p_restricted then 'files.private' else 'files:' || split_part(p_path, '/', 1) end
$$;

-- The caller's own levels for every area, including each top Talent folder
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(a, public.access_level_for(auth.uid(), a))
    from (select unnest(array['academies','camps','players','insights','files','files.private']) a
          union select 'files:' || name from public.talent_files where parent = '' and is_folder) t
$$;

-- Owners and admins: the full matrix for one user (default, override, effective)
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
          from (select a, 0 ord from unnest(array['academies','camps','players','insights','files','files.private']) a
                union select 'files:' || name, 1 from public.talent_files where parent = '' and is_folder) t);
end $$;

create or replace function public.admin_set_access(p_user uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; v_role public.app_role;
begin
  if not public.is_admin() then raise exception 'Only owners and admins can manage access'; end if;
  select role into v_role from public.profiles where id = p_user;
  if v_role = 'owner' then raise exception 'The owner always has full access'; end if;
  if v_role = 'admin' and public.current_role_name() <> 'owner' then raise exception 'Only the owner can change an admin''s access'; end if;
  for k, v in select * from jsonb_each(p) loop
    if jsonb_typeof(v) = 'null' then
      delete from public.user_access where user_id = p_user and area = k;
    else
      insert into public.user_access(user_id, area, level, updated_by) values (p_user, k, (v #>> '{}')::smallint, auth.uid())
      on conflict (user_id, area) do update set level = excluded.level, updated_by = excluded.updated_by, updated_at = now();
    end if;
  end loop;
end $$;

do $$ declare f text; begin
  foreach f in array array['can(text,integer)','my_access()','admin_get_access(uuid)','admin_set_access(uuid,jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke execute on function public.access_level_for(uuid,text) from public, anon, authenticated';
end $$;

-- ───────── Access rules on the data ─────────
-- Staff keep reading the shared scouting data (a camp sheet needs the academy and player names);
-- the right to change it follows the area. Talent files follow the folder.
drop policy if exists academies_write on public.academies;
create policy academies_write on public.academies for all to authenticated using (public.can('academies', 2)) with check (public.can('academies', 2));
drop policy if exists acs_write on public.academy_seasons;
create policy acs_write on public.academy_seasons for all to authenticated using (public.can('academies', 2)) with check (public.can('academies', 2));
drop policy if exists players_staff_write on public.players;
create policy players_staff_write on public.players for all to authenticated
  using (public.can('players', 2) or public.can('camps', 2)) with check (public.can('players', 2) or public.can('camps', 2));
drop policy if exists camps_write on public.camps;
create policy camps_write on public.camps for all to authenticated using (public.can('camps', 2)) with check (public.can('camps', 2));
drop policy if exists cp_staff_write on public.camp_participants;
create policy cp_staff_write on public.camp_participants for all to authenticated using (public.can('camps', 2)) with check (public.can('camps', 2));
drop policy if exists talent_files_read on public.talent_files;
create policy talent_files_read on public.talent_files for select
  using (public.is_staff() and public.can(public.talent_area(path, restricted), 1));

-- merge duplicates: same as 0003, now guarded by the players area
create or replace function public.merge_players(p_keep uuid, p_drop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k public.players; d public.players;
begin
  if not public.can('players', 2) then raise exception 'Not allowed'; end if;
  if p_keep = p_drop then raise exception 'Choose two different players'; end if;
  select * into k from public.players where id = p_keep;
  select * into d from public.players where id = p_drop;
  if k.id is null or d.id is null then raise exception 'Player not found'; end if;
  -- move camp rows that do not clash; drop the clashing duplicates of the same camp
  update public.camp_participants cp set player_id = p_keep
   where cp.player_id = p_drop and not exists (select 1 from public.camp_participants x where x.camp_id = cp.camp_id and x.player_id = p_keep);
  delete from public.camp_participants where player_id = p_drop;
  update public.players set
    birth_date = coalesce(k.birth_date, d.birth_date),
    birth_year = coalesce(k.birth_year, d.birth_year),
    academy_id = coalesce(k.academy_id, d.academy_id),
    district_id = coalesce(k.district_id, d.district_id),
    positions = coalesce(k.positions, d.positions),
    preferred_foot = coalesce(k.preferred_foot, d.preferred_foot),
    guardian_name = coalesce(k.guardian_name, d.guardian_name),
    guardian_phone = coalesce(k.guardian_phone, d.guardian_phone),
    guardian_consent = k.guardian_consent or d.guardian_consent,
    age_status = case when 'verified' in (k.age_status, d.age_status) then 'verified' when 'doubtful' in (k.age_status, d.age_status) then 'doubtful' else 'declared' end,
    coach_notes = nullif(concat_ws(E'\n', k.coach_notes, d.coach_notes), ''),
    staff_notes = nullif(concat_ws(E'\n', k.staff_notes, d.staff_notes), '')
   where id = p_keep;
  update public.players set merged_into = p_keep, archived_at = now() where id = p_drop;
  perform public.recompute_pool_status(p_keep);
end $$;
