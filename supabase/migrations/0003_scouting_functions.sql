-- Pluribus · 0003 scouting functions: merge duplicates, season pool, season funnel

create or replace function public.merge_players(p_keep uuid, p_drop uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k public.players; d public.players;
begin
  if not public.can_edit() then raise exception 'Not allowed'; end if;
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
revoke execute on function public.merge_players(uuid, uuid) from public, anon;
grant execute on function public.merge_players(uuid, uuid) to authenticated;

-- Players who took part in a scouting season (runs with the caller's access rules)
create or replace function public.season_players(p_season uuid)
returns setof public.players language sql stable security invoker set search_path = public as $$
  select distinct p.* from public.players p
    join public.camp_participants cp on cp.player_id = p.id and cp.status <> 'removed'
    join public.camps c on c.id = cp.camp_id
   where c.season_id = p_season and p.merged_into is null
$$;
grant execute on function public.season_players(uuid) to authenticated;

create or replace function public.season_funnel(p_season uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  with x as (
    select cp.player_id, c.stage, cp.status, cp.decision, cp.obs, cp.age_group
      from public.camp_participants cp join public.camps c on c.id = cp.camp_id
     where c.season_id = p_season and cp.status <> 'removed'
  )
  select jsonb_build_object(
    'submitted', (select count(distinct player_id) from x where stage = 'district'),
    'seen', (select count(distinct player_id) from x where stage = 'district' and (status in ('attended') or obs is not null or decision is not null)),
    'district_selected', (select count(distinct player_id) from x where stage = 'district' and decision = 'selected'),
    'province', (select count(distinct player_id) from x where stage = 'province_final'),
    'province_selected', (select count(distinct player_id) from x where stage = 'province_final' and decision = 'selected'),
    'national', (select count(distinct player_id) from x where stage = 'national_final'),
    'national_selected', (select count(distinct player_id) from x where stage = 'national_final' and decision = 'selected'),
    'see_again', (select count(distinct player_id) from x where stage = 'national_final' and decision = 'see_again'),
    'by_group', (select coalesce(jsonb_object_agg(g, n), '{}') from (select coalesce(age_group,'Other') g, count(distinct player_id) n from x group by 1) t)
  )
$$;
grant execute on function public.season_funnel(uuid) to authenticated;
