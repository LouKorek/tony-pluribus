-- Pluribus · 0002 scouting logic
-- Academy names repeat across districts; age group is derived per camp season; each player's pool status follows their furthest stage.

alter table public.academies drop constraint if exists academies_project_id_name_key;
create unique index if not exists academies_unique_name
  on public.academies (project_id, coalesce(district_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(name));

alter table public.academy_seasons add column if not exists source text not null default 'staff';
alter table public.camps add column if not exists sort_key int;

-- Coaches may not change staff fields — except when the system itself recomputes them
create or replace function public.guard_coach_player_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('pluribus.system', true), '') = 'on' then return new; end if;
  if public.current_role_name() = 'coach' then
    if new.staff_notes is distinct from old.staff_notes or new.pool_status is distinct from old.pool_status
       or new.age_status is distinct from old.age_status or new.academy_id is distinct from old.academy_id
       or new.merged_into is distinct from old.merged_into or new.source is distinct from old.source then
      raise exception 'Coaches cannot change staff-managed fields';
    end if;
  end if;
  return new;
end $$;

-- Age group from birth year and the camp's season
create or replace function public.participant_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_year int; v_season uuid;
begin
  if new.age_group is null then
    select birth_year into v_year from public.players where id = new.player_id;
    select season_id into v_season from public.camps where id = new.camp_id;
    select code into new.age_group from public.age_groups
     where season_id = v_season and v_year between birth_year_from and birth_year_to;
  end if;
  return new;
end $$;
drop trigger if exists cp_defaults on public.camp_participants;
create trigger cp_defaults before insert on public.camp_participants for each row execute function public.participant_defaults();

-- Pool status = furthest point reached in the player's latest scouting season
create or replace function public.recompute_pool_status(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_season uuid; v_status text; v_cur text;
begin
  select pool_status into v_cur from public.players where id = p_player;
  if v_cur is null or v_cur in ('tony_squad','released') then return; end if;
  select c.season_id into v_season
    from public.camp_participants cp join public.camps c on c.id = cp.camp_id join public.seasons s on s.id = c.season_id
   where cp.player_id = p_player and cp.status <> 'removed'
   order by s.label desc limit 1;
  if v_season is null then
    v_status := 'academy_squad';
  else
    select case
      when bool_or(c.stage = 'national_final' and cp.decision = 'selected') then 'selected'
      when bool_or(c.stage = 'national_final' and cp.decision = 'see_again') then 'see_again'
      when bool_or(c.stage = 'national_final' and cp.decision = 'not_selected') then 'not_selected'
      when bool_or(c.stage = 'national_final') then 'national_final'
      when bool_or(c.stage = 'province_final') then 'province_final'
      when bool_or(cp.status in ('attended','absent') or cp.decision is not null or cp.obs is not null) then 'observed'
      else 'submitted' end
      into v_status
      from public.camp_participants cp join public.camps c on c.id = cp.camp_id
     where cp.player_id = p_player and c.season_id = v_season and cp.status <> 'removed';
  end if;
  perform set_config('pluribus.system', 'on', true);
  update public.players set pool_status = v_status where id = p_player and pool_status is distinct from v_status;
  perform set_config('pluribus.system', 'off', true);
end $$;
revoke execute on function public.recompute_pool_status(uuid) from public, anon;

create or replace function public.cp_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.player_id <> old.player_id) then perform public.recompute_pool_status(old.player_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.recompute_pool_status(new.player_id); end if;
  return null;
end $$;
drop trigger if exists cp_pool on public.camp_participants;
create trigger cp_pool after insert or update or delete on public.camp_participants for each row execute function public.cp_after_change();

-- Stats (security_invoker: callers see only what their own access rules allow)
create or replace view public.v_camp_stats with (security_invoker = on) as
select c.id as camp_id,
       count(cp.id) filter (where cp.status <> 'removed') as total,
       count(cp.id) filter (where cp.status = 'submitted') as submitted,
       count(cp.id) filter (where cp.status in ('invited','confirmed')) as invited,
       count(cp.id) filter (where cp.status = 'attended' or (cp.status not in ('absent','removed','declined') and (cp.obs is not null or cp.decision is not null))) as attended,
       count(cp.id) filter (where cp.status in ('absent','declined')) as absent,
       count(cp.id) filter (where cp.decision = 'selected') as selected,
       count(cp.id) filter (where cp.decision = 'see_again') as see_again
  from public.camps c left join public.camp_participants cp on cp.camp_id = c.id
 group by c.id;

create or replace view public.v_academy_stats with (security_invoker = on) as
select a.id as academy_id, c.season_id,
       count(distinct cp.player_id) as players_seen,
       count(distinct cp.player_id) filter (where cp.decision = 'selected' and c.stage = 'district') as district_selected,
       count(distinct cp.player_id) filter (where c.stage in ('province_final','national_final')) as in_finals,
       count(distinct cp.player_id) filter (where cp.decision = 'selected' and c.stage = 'national_final') as national_selected
  from public.academies a
  join public.players p on p.academy_id = a.id
  join public.camp_participants cp on cp.player_id = p.id and cp.status <> 'removed'
  join public.camps c on c.id = cp.camp_id
 group by a.id, c.season_id;

grant select on public.v_camp_stats, public.v_academy_stats to authenticated;
