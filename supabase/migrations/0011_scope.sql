-- Pluribus · 0011 scope per user: several provinces and several teams
-- Empty list = all. Scouts and staff can be limited to some provinces; football staff to some teams.
-- The limits apply to changes (writes); reading stays as the access areas allow.

alter table public.profiles add column if not exists region_ids uuid[] not null default '{}';
alter table public.profiles add column if not exists team_ids uuid[] not null default '{}';
update public.profiles set region_ids = array[region_id] where region_id is not null and region_ids = '{}';

create or replace function public.in_my_regions(p_region uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner','admin') or region_ids = '{}' or p_region = any(region_ids)
                     from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.in_my_teams(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner','admin') or team_ids = '{}' or p_team is null or p_team = any(team_ids)
                     from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.camp_region(p_camp uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(c.region_id, d.region_id) from public.camps c left join public.districts d on d.id = c.district_id where c.id = p_camp
$$;
grant execute on function public.in_my_regions(uuid), public.in_my_teams(uuid), public.camp_region(uuid) to authenticated;

create or replace function public.admin_set_scope(p_user uuid, p_region_ids uuid[], p_team_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only owners and admins can change a user''s scope'; end if;
  update public.profiles set region_ids = coalesce(p_region_ids, '{}'), team_ids = coalesce(p_team_ids, '{}'),
         region_id = case when coalesce(array_length(p_region_ids, 1), 0) = 1 then p_region_ids[1] else null end
   where id = p_user;
end $$;
revoke execute on function public.admin_set_scope(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_set_scope(uuid, uuid[], uuid[]) to authenticated;

-- ───────── Scouting writes follow the provinces ─────────
drop policy if exists camps_write on public.camps;
create policy camps_write on public.camps for all to authenticated
  using (public.can('camps', 2) and public.in_my_regions(coalesce(region_id, (select region_id from public.districts where id = district_id))))
  with check (public.can('camps', 2) and public.in_my_regions(coalesce(region_id, (select region_id from public.districts where id = district_id))));
drop policy if exists cp_staff_write on public.camp_participants;
create policy cp_staff_write on public.camp_participants for all to authenticated
  using (public.can('camps', 2) and public.in_my_regions(public.camp_region(camp_id)))
  with check (public.can('camps', 2) and public.in_my_regions(public.camp_region(camp_id)));
drop policy if exists academies_write on public.academies;
create policy academies_write on public.academies for all to authenticated
  using (public.can('academies', 2) and (district_id is null or public.in_my_regions((select region_id from public.districts where id = district_id))))
  with check (public.can('academies', 2) and (district_id is null or public.in_my_regions((select region_id from public.districts where id = district_id))));

-- ───────── Team writes follow the teams ─────────
drop policy if exists team_players_write on public.team_players;
create policy team_players_write on public.team_players for all to authenticated
  using (public.can('squads', 2) and public.in_my_teams(team_id)) with check (public.can('squads', 2) and public.in_my_teams(team_id));
drop policy if exists team_days_write on public.team_days;
create policy team_days_write on public.team_days for all to authenticated
  using (public.can('attendance', 2) and public.in_my_teams(team_id)) with check (public.can('attendance', 2) and public.in_my_teams(team_id));
drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance for all to authenticated
  using (public.can('attendance', 2) and public.in_my_teams((select team_id from public.team_days where id = day_id)))
  with check (public.can('attendance', 2) and public.in_my_teams((select team_id from public.team_days where id = day_id)));
drop policy if exists measurements_write on public.measurements;
create policy measurements_write on public.measurements for all to authenticated
  using (public.can('physical', 2) and public.in_my_teams(team_id)) with check (public.can('physical', 2) and public.in_my_teams(team_id));
drop policy if exists training_sessions_write on public.training_sessions;
create policy training_sessions_write on public.training_sessions for all to authenticated
  using (public.can('training', 2) and public.in_my_teams(team_id)) with check (public.can('training', 2) and public.in_my_teams(team_id));
drop policy if exists matches_write on public.matches;
create policy matches_write on public.matches for all to authenticated
  using (public.can('matches', 2) and public.in_my_teams(team_id)) with check (public.can('matches', 2) and public.in_my_teams(team_id));
drop policy if exists match_players_write on public.match_players;
create policy match_players_write on public.match_players for all to authenticated
  using (public.can('matches', 2) and public.in_my_teams((select team_id from public.matches where id = match_id)))
  with check (public.can('matches', 2) and public.in_my_teams((select team_id from public.matches where id = match_id)));
