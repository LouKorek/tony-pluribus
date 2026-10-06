-- Pluribus · 0006 dashboards and in-app guided tours

-- ───────── Guided tours: which screen tours each user has finished or skipped ─────────
alter table public.profiles add column if not exists tours_seen text[] not null default '{}';

create or replace function public.tour_seen(p_key text) returns void
language sql security definer set search_path = public as $$
  update public.profiles
     set tours_seen = case when p_key is null then '{}'::text[]
                           when p_key = any(tours_seen) then tours_seen
                           else array_append(tours_seen, p_key) end
   where id = auth.uid()
$$;
revoke execute on function public.tour_seen(text) from public, anon;
grant execute on function public.tour_seen(text) to authenticated;

-- ───────── Scouting dashboard ─────────
-- Runs with the caller's rights: staff read everything, nobody else gets rows.
create or replace function public.dashboard_scouting(p_season uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  with
  season as (select * from public.seasons where id = p_season),
  cp as (
    select cp.player_id, cp.status, cp.obs, cp.decision, cp.age_group, c.stage, c.id camp_id,
           coalesce(c.region_id, d.region_id) region_id, p.academy_id
      from public.camp_participants cp
      join public.camps c on c.id = cp.camp_id
      left join public.districts d on d.id = c.district_id
      join public.players p on p.id = cp.player_id
     where c.season_id = p_season and cp.status <> 'removed'),
  dist as (select * from cp where stage = 'district'),
  cam as (
    select c.*, coalesce(c.region_id, d.region_id) reg from public.camps c left join public.districts d on d.id = c.district_id
     where c.season_id = p_season and c.status <> 'cancelled'),
  acs as (select x.*, d.region_id from public.academy_seasons x join public.academies a on a.id = x.academy_id
            left join public.districts d on d.id = a.district_id where x.season_id = p_season)
  select jsonb_build_object(
    'season', (select label from season),
    'kpi', jsonb_build_object(
      'academies', (select count(*) from public.academies a where a.is_active and a.project_id = (select project_id from season)),
      'academies_visited', (select count(*) from acs where visit_date is not null),
      'academies_submitting', (select count(distinct academy_id) from dist),
      'camps', (select count(*) from cam where stage = 'district'),
      'camps_done', (select count(*) from cam where stage = 'district' and status in ('completed','published')),
      'districts_covered', (select count(distinct district_id) from cam where stage = 'district'),
      'districts', (select count(*) from public.districts),
      'submitted', (select count(distinct player_id) from dist),
      'seen', (select count(distinct player_id) from dist where status = 'attended' or obs is not null),
      'district_selected', (select count(distinct player_id) from dist where decision = 'selected'),
      'province', (select count(distinct player_id) from cp where stage = 'province_final'),
      'province_selected', (select count(distinct player_id) from cp where stage = 'province_final' and decision = 'selected'),
      'national', (select count(distinct player_id) from cp where stage = 'national_final'),
      'national_selected', (select count(distinct player_id) from cp where stage = 'national_final' and decision = 'selected'),
      'see_again', (select count(distinct player_id) from cp where stage = 'national_final' and decision = 'see_again'),
      'absent', (select count(*) from cp where status in ('absent','declined'))),
    'regions', (select coalesce(jsonb_agg(r order by r->>'sort'), '[]') from (
      select jsonb_build_object('name', g.name, 'sort', lpad(g.sort::text, 3, '0'),
        'academies', (select count(*) from public.academies a join public.districts d on d.id = a.district_id where d.region_id = g.id and a.is_active),
        'visited', (select count(*) from acs where acs.region_id = g.id and visit_date is not null),
        'camps', (select count(*) from cam where reg = g.id and stage = 'district'),
        'camps_done', (select count(*) from cam where reg = g.id and stage = 'district' and status in ('completed','published')),
        'submitted', (select count(distinct player_id) from dist where region_id = g.id),
        'seen', (select count(distinct player_id) from dist where region_id = g.id and (status = 'attended' or obs is not null)),
        'selected', (select count(distinct player_id) from dist where region_id = g.id and decision = 'selected'),
        'province', (select count(distinct player_id) from cp where region_id = g.id and stage = 'province_final'),
        'province_selected', (select count(distinct player_id) from cp where region_id = g.id and stage = 'province_final' and decision = 'selected')) r
      from public.regions g) t),
    'obs', (select coalesce(jsonb_object_agg(obs, n), '{}') from (select obs, count(*) n from dist where obs is not null group by obs) t),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'from', g.birth_year_from, 'to', g.birth_year_to,
                 'submitted', (select count(distinct player_id) from dist where age_group = g.code),
                 'selected', (select count(distinct player_id) from dist where age_group = g.code and decision = 'selected'),
                 'national_selected', (select count(distinct player_id) from cp where age_group = g.code and stage = 'national_final' and decision = 'selected'))
               order by g.sort), '[]') from public.age_groups g where g.season_id = p_season),
    'top_academies', (select coalesce(jsonb_agg(t order by (t->>'selected')::int desc, (t->>'submitted')::int desc), '[]') from (
      select jsonb_build_object('name', a.name, 'district', d.name,
               'submitted', count(distinct x.player_id), 'selected', count(distinct x.player_id) filter (where x.decision = 'selected')) t
        from dist x join public.academies a on a.id = x.academy_id left join public.districts d on d.id = a.district_id
       group by a.id, a.name, d.name
       order by count(distinct x.player_id) filter (where x.decision = 'selected') desc, count(distinct x.player_id) desc
       limit 10) q),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'planned', planned, 'done', done) order by m), '[]') from (
      select to_char(starts_on, 'YYYY-MM') m, count(*) planned, count(*) filter (where status in ('completed','published')) done
        from cam where starts_on is not null group by 1) t),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('season', s.label, 'current', s.id = p_season,
                 'visited', (select count(*) from public.academy_seasons x where x.season_id = s.id and x.visit_date is not null),
                 'scouted', (select coalesce(sum(scouted),0) from public.academy_seasons x where x.season_id = s.id),
                 'selected', (select coalesce(sum(x.selected),0) from public.academy_seasons x where x.season_id = s.id),
                 'camp_submitted', (select count(distinct cp2.player_id) from public.camp_participants cp2 join public.camps c2 on c2.id = cp2.camp_id
                                     where c2.season_id = s.id and c2.stage = 'district' and cp2.status <> 'removed'),
                 'camp_selected', (select count(distinct cp2.player_id) from public.camp_participants cp2 join public.camps c2 on c2.id = cp2.camp_id
                                     where c2.season_id = s.id and c2.stage = 'district' and cp2.decision = 'selected'))
               order by s.label), '[]')
                from public.seasons s where s.project_id = (select project_id from season))
  )
$$;
revoke execute on function public.dashboard_scouting(uuid) from public, anon;
grant execute on function public.dashboard_scouting(uuid) to authenticated;
