-- Tony Next · 0023 equipment: how many are good, how many are worn, how many more are needed.
-- One condition per item type was not enough: 12 balls of which 4 are worn is the real picture, and "needed" is what Tony can supply.

alter table public.academy_equipment add column if not exists good int not null default 0;
alter table public.academy_equipment add column if not exists worn int not null default 0;
alter table public.academy_equipment add column if not exists needed int not null default 0;
update public.academy_equipment set good = case when condition = 'worn' then 0 else quantity end, worn = case when condition = 'worn' then quantity else 0 end, needed = case when condition = 'missing' then greatest(1, quantity) else 0 end
 where good = 0 and worn = 0 and needed = 0 and quantity > 0;

-- quantity and condition stay as derived columns, for the staff views and the badge
create or replace function public.coach_save_equipment(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record; x jsonb; g int; w int; n int;
begin
  select * into ctx from public.coach_ctx();
  for x in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    if x->>'item' not in ('balls','bibs','cones','goals','nets','first_aid','water','kits','gk_gloves','pump','whistle','other') then continue; end if;
    g := greatest(0, coalesce((x->>'good')::int, 0)); w := greatest(0, coalesce((x->>'worn')::int, 0)); n := greatest(0, coalesce((x->>'needed')::int, 0));
    insert into public.academy_equipment(academy_id, item, good, worn, needed, quantity, condition, notes, updated_at)
    values (ctx.v_academy, x->>'item', g, w, n, g + w, case when g + w = 0 then 'missing' when w > 0 then 'worn' else 'good' end, nullif(x->>'notes',''), now())
    on conflict (academy_id, item) do update set good = excluded.good, worn = excluded.worn, needed = excluded.needed, quantity = excluded.quantity, condition = excluded.condition, notes = excluded.notes, updated_at = now();
  end loop;
  update public.academies set equipment_updated_at = now() where id = ctx.v_academy;
  perform public.award_academy('equipment.updated', ctx.v_academy, 'academies', ctx.v_academy::text || ':' || to_char(now(), 'YYYY-MM'));
  perform public.check_badges(u.id) from (select id from public.profiles where academy_id = ctx.v_academy and role = 'coach' and status = 'active') u;
end $$;

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
            'equipment', coalesce((select jsonb_agg(jsonb_build_object('item', e.item, 'good', e.good, 'worn', e.worn, 'needed', e.needed, 'quantity', e.quantity, 'condition', e.condition, 'notes', e.notes, 'updated_at', e.updated_at) order by e.item) from public.academy_equipment e where e.academy_id = a.id), '[]'::jsonb))
            from public.academies a left join public.districts d on d.id = a.district_id left join public.regions r on r.id = d.region_id where a.id = ctx.v_academy);
end $$;

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
    'equipment', coalesce((select jsonb_agg(jsonb_build_object('item', item, 'good', good, 'worn', worn, 'needed', needed, 'quantity', quantity, 'condition', condition) order by item) from public.academy_equipment where academy_id = p_academy), '[]'::jsonb),
    'equipment_updated_at', (select equipment_updated_at from public.academies where id = p_academy),
    'coaches', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(full_name, username), 'last_seen_at', last_seen_at)) from public.profiles where academy_id = p_academy and role = 'coach' and status = 'active'), '[]'::jsonb))
  where public.is_staff()
$$;

-- "well equipped" now means enough good ones: 8 balls, 10 bibs, 10 cones and a first-aid kit
create or replace function public.well_equipped(p_academy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select good from public.academy_equipment where academy_id = p_academy and item = 'balls'), 0) >= 8
     and coalesce((select good from public.academy_equipment where academy_id = p_academy and item = 'bibs'), 0) >= 10
     and coalesce((select good from public.academy_equipment where academy_id = p_academy and item = 'cones'), 0) >= 10
     and coalesce((select good from public.academy_equipment where academy_id = p_academy and item = 'first_aid'), 0) >= 1
$$;
revoke execute on function public.well_equipped(uuid) from public, anon, authenticated;
-- badge check uses it
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
  if public.well_equipped(v_academy) then perform public.give_badge(p_user, v_proj, 'well_equipped'); end if;

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

update public.badges set description = 'At least 8 good balls, 10 bibs, 10 cones and a first-aid kit.' where code = 'well_equipped';

-- the points can carry the project's own name (Settings): projects.settings.points_name = {one, many, short}; empty = points
create or replace function public.award_points(p_rule text, p_user uuid, p_ref_table text default null, p_ref_id text default null, p_note text default null, p_points int default null, p_by uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare r public.point_rules; v_proj uuid; v_academy uuid; v_season uuid; v_status public.user_status; v_role public.app_role;
        v_before int; v_after int; lv_before jsonb; lv_after jsonb; v_pts int; n int; v_name text;
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
  v_name := coalesce((select settings->'points_name'->>'many' from public.projects where id = v_proj), 'points');
  insert into public.point_events(project_id, season_id, user_id, academy_id, rule, points, ref_table, ref_id, note, created_by)
  values (v_proj, v_season, p_user, v_academy, p_rule, v_pts, p_ref_table, p_ref_id, p_note, p_by);
  v_after := v_before + v_pts;
  perform public.notify('points.earned', p_user, '+' || v_pts || ' ' || v_name || ' · ' || r.label, 'You now have ' || v_after || ' ' || v_name || '.', '/progress', jsonb_build_object('rule', p_rule, 'points', v_pts), 'points:' || to_char(now(), 'YYYY-MM-DD'));
  lv_before := public.level_of(v_proj, v_before); lv_after := public.level_of(v_proj, v_after);
  if lv_after->>'code' is distinct from lv_before->>'code' and v_pts > 0 then
    perform public.notify('level.up', p_user, 'You reached ' || (lv_after->>'label') || '!', 'Level ' || (lv_after->>'label') || ' with ' || v_after || ' ' || v_name || '. Keep going.', '/progress', jsonb_build_object('level', lv_after->>'code'));
  end if;
  perform public.check_badges(p_user);
  return v_pts;
end $$;

