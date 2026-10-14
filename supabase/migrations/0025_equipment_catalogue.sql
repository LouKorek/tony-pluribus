-- Tony Next · 0025 equipment catalogue: ~50 items the coach picks from (balls by size, goals by size, training gear,
-- kit, health, coaching tools), and his own items as custom:<name>. "Other" is gone.

alter table public.academy_equipment drop constraint if exists academy_equipment_item_check;
alter table public.academy_equipment add column if not exists label text;
alter table public.academy_equipment add constraint academy_equipment_item_check check (item ~ '^[a-z0-9_]{2,40}$' or item ~ '^custom:[^\s].{0,60}$');

-- old codes to the new catalogue
update public.academy_equipment set item = 'ball_s4' where item = 'balls';
update public.academy_equipment set item = 'goal_7' where item = 'goals';
update public.academy_equipment set item = 'goal_nets' where item = 'nets';
update public.academy_equipment set item = 'water_jerrycans' where item = 'water';
update public.academy_equipment set item = 'kit_match' where item = 'kits';
update public.academy_equipment set item = 'ball_pump' where item = 'pump';
update public.academy_equipment set item = 'custom:other', label = coalesce(label, notes, 'Other') where item = 'other';
delete from public.academy_equipment where quantity = 0 and needed = 0;

create or replace function public.coach_save_equipment(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record; x jsonb; g int; w int; n int; v_item text;
begin
  select * into ctx from public.coach_ctx();
  for x in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    v_item := trim(x->>'item');
    if v_item is null or not (v_item ~ '^[a-z0-9_]{2,40}$' or v_item ~ '^custom:[^\s].{0,60}$') then continue; end if;
    g := greatest(0, coalesce((x->>'good')::int, 0)); w := greatest(0, coalesce((x->>'worn')::int, 0)); n := greatest(0, coalesce((x->>'needed')::int, 0));
    if coalesce((x->>'remove')::boolean, false) or (g = 0 and w = 0 and n = 0) then
      delete from public.academy_equipment where academy_id = ctx.v_academy and item = v_item;
      continue;
    end if;
    insert into public.academy_equipment(academy_id, item, label, good, worn, needed, quantity, condition, notes, updated_at)
    values (ctx.v_academy, v_item, nullif(trim(x->>'label'), ''), g, w, n, g + w, case when g + w = 0 then 'missing' when w > 0 then 'worn' else 'good' end, nullif(x->>'notes',''), now())
    on conflict (academy_id, item) do update set label = coalesce(excluded.label, academy_equipment.label), good = excluded.good, worn = excluded.worn, needed = excluded.needed, quantity = excluded.quantity, condition = excluded.condition, notes = excluded.notes, updated_at = now();
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
            'equipment', coalesce((select jsonb_agg(jsonb_build_object('item', e.item, 'label', e.label, 'good', e.good, 'worn', e.worn, 'needed', e.needed, 'quantity', e.quantity, 'condition', e.condition, 'notes', e.notes, 'updated_at', e.updated_at) order by e.updated_at) from public.academy_equipment e where e.academy_id = a.id), '[]'::jsonb))
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
    'equipment', coalesce((select jsonb_agg(jsonb_build_object('item', item, 'label', label, 'good', good, 'worn', worn, 'needed', needed, 'quantity', quantity, 'condition', condition) order by item) from public.academy_equipment where academy_id = p_academy), '[]'::jsonb),
    'equipment_updated_at', (select equipment_updated_at from public.academies where id = p_academy),
    'coaches', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(full_name, username), 'last_seen_at', last_seen_at)) from public.profiles where academy_id = p_academy and role = 'coach' and status = 'active'), '[]'::jsonb))
  where public.is_staff()
$$;

-- well equipped: 8 good balls of any size, 10 bibs, 10 cones or discs, a first-aid kit
create or replace function public.well_equipped(p_academy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(good) from public.academy_equipment where academy_id = p_academy and item in ('ball_s3','ball_s4','ball_s5','ball_futsal')), 0) >= 8
     and coalesce((select good from public.academy_equipment where academy_id = p_academy and item = 'bibs'), 0) >= 10
     and coalesce((select sum(good) from public.academy_equipment where academy_id = p_academy and item in ('cones','marker_discs')), 0) >= 10
     and coalesce((select good from public.academy_equipment where academy_id = p_academy and item = 'first_aid'), 0) >= 1
$$;
update public.badges set description = 'At least 8 good balls, 10 bibs, 10 cones or discs and a first-aid kit.' where code = 'well_equipped';
