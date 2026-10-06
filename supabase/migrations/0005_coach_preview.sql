-- Pluribus · 0005 coach portal preview for staff
-- Staff can open any academy's coach portal read-only ("see what the coach sees").
-- Only the read functions take an academy; every write function still accepts approved coaches only.

drop function if exists public.coach_squad();
drop function if exists public.coach_camps();
drop function if exists public.coach_standing();
drop function if exists public.coach_ctx();

create or replace function public.coach_ctx(p_academy uuid default null, out v_academy uuid, out v_project uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_academy is not null then
    if not public.is_staff() then raise exception 'Only TFEP staff can preview an academy'; end if;
    select a.id, a.project_id into v_academy, v_project from public.academies a where a.id = p_academy;
    if v_academy is null then raise exception 'Academy not found'; end if;
    return;
  end if;
  select p.academy_id, p.project_id into v_academy, v_project
    from public.profiles p where p.id = auth.uid() and p.role = 'coach' and p.status = 'active';
  if v_academy is null then raise exception 'Only an approved academy coach can do this'; end if;
end $$;

create or replace function public.coach_squad(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx(p_academy);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'birth_year', p.birth_year, 'birth_date', p.birth_date,
      'positions', p.positions, 'preferred_foot', p.preferred_foot, 'guardian_name', p.guardian_name, 'guardian_phone', p.guardian_phone,
      'guardian_consent', p.guardian_consent, 'coach_notes', p.coach_notes, 'created_at', p.created_at,
      'journey', coalesce((select jsonb_agg(public.coach_view_participation(cp, c) order by c.starts_on nulls last)
                             from public.camp_participants cp join public.camps c on c.id = cp.camp_id
                            where cp.player_id = p.id and cp.status <> 'removed'), '[]'::jsonb)
    ) order by p.last_name, p.first_name)
      from public.players p
     where p.academy_id = ctx.v_academy and p.merged_into is null and p.archived_at is null), '[]'::jsonb);
end $$;

create or replace function public.coach_camps(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record; v_dist uuid; v_region uuid;
begin
  select * into ctx from public.coach_ctx(p_academy);
  select a.district_id, d.region_id into v_dist, v_region from public.academies a left join public.districts d on d.id = a.district_id where a.id = ctx.v_academy;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'venue', c.venue, 'age_groups', c.age_groups,
      'district', d.name, 'own_district', c.district_id = v_dist,
      'submitted', (select count(*) from public.camp_participants cp join public.players p on p.id = cp.player_id
                     where cp.camp_id = c.id and p.academy_id = ctx.v_academy and cp.status <> 'removed'))
      order by (c.district_id = v_dist) desc, c.starts_on nulls last)
      from public.camps c left join public.districts d on d.id = c.district_id
      join public.seasons s on s.id = c.season_id and s.is_current_scouting
     where c.stage = 'district' and c.submissions_open and c.status in ('planned','open')
       and (c.starts_on is null or c.starts_on >= current_date)
       and d.region_id = v_region), '[]'::jsonb);
end $$;

create or replace function public.coach_standing(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record; v_region uuid; v_season uuid; r jsonb;
begin
  select * into ctx from public.coach_ctx(p_academy);
  select d.region_id into v_region from public.academies a join public.districts d on d.id = a.district_id where a.id = ctx.v_academy;
  select id into v_season from public.seasons where project_id = ctx.v_project and is_current_scouting;
  with per as (
    select p.academy_id,
           count(distinct cp.player_id) as submitted,
           count(distinct cp.player_id) filter (where cp.decision = 'selected' and cp.decision_published) as selected
      from public.camp_participants cp join public.camps c on c.id = cp.camp_id and c.season_id = v_season
      join public.players p on p.id = cp.player_id
      join public.academies a on a.id = p.academy_id join public.districts d on d.id = a.district_id and d.region_id = v_region
     where cp.status <> 'removed'
     group by p.academy_id),
  ranked as (select *, rank() over (order by selected desc) rk from per)
  select jsonb_build_object('submitted', coalesce(r2.submitted,0), 'selected', coalesce(r2.selected,0),
           'rank', case when coalesce(r2.selected,0) > 0 then r2.rk end, 'academies', (select count(*) from per),
           'region', (select name from public.regions where id = v_region))
    into r from (select 1) one left join ranked r2 on r2.academy_id = ctx.v_academy;
  return r;
end $$;

do $$ declare f text; begin
  foreach f in array array['coach_squad(uuid)','coach_camps(uuid)','coach_standing(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke execute on function public.coach_ctx(uuid) from public, anon, authenticated';
end $$;
