-- Tony Next · 0018 coach read functions take an optional academy (staff preview), like the ones from 0005.

drop function if exists public.coach_squad();
drop function if exists public.coach_academy();
drop function if exists public.coach_sessions();
drop function if exists public.coach_schedule();

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
      'photo_path', p.photo_path, 'shirt_no', p.shirt_no, 'height_cm', p.height_cm, 'weight_kg', p.weight_kg, 'measured_on', p.measured_on,
      'school', p.school, 'sector', p.sector, 'joined_year', p.joined_year, 'squad_status', p.squad_status, 'pool_status', p.pool_status,
      'sessions', (select count(*) from public.academy_session_players sp join public.academy_sessions s on s.id = sp.session_id where sp.player_id = p.id and sp.present and s.held_on > current_date - 90),
      'log', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'kind', l.kind, 'text', l.text) order by l.at desc)
                         from (select * from public.player_log where player_id = p.id order by at desc limit 12) l), '[]'::jsonb),
      'journey', coalesce((select jsonb_agg(public.coach_view_participation(cp, c) order by c.starts_on nulls last)
                             from public.camp_participants cp join public.camps c on c.id = cp.camp_id
                            where cp.player_id = p.id and cp.status <> 'removed'), '[]'::jsonb)
    ) order by p.squad_status = 'active' desc, p.last_name, p.first_name)
      from public.players p
     where p.academy_id = ctx.v_academy and p.merged_into is null and p.archived_at is null), '[]'::jsonb);
end $$;

create or replace function public.coach_academy(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx(p_academy);
  return (select jsonb_build_object('id', a.id, 'name', a.name, 'district', d.name, 'region', r.name, 'contact_name', a.contact_name, 'contact_phone', a.contact_phone,
            'venue', a.venue, 'training_days', a.training_days, 'training_time', a.training_time, 'players_count', a.players_count, 'age_groups', a.age_groups,
            'photo_path', a.photo_path, 'programme_status', a.programme_status, 'profile_updated_at', a.profile_updated_at,
            'complete', a.venue is not null and cardinality(a.training_days) > 0 and a.contact_phone is not null and cardinality(a.age_groups) > 0)
            from public.academies a left join public.districts d on d.id = a.district_id left join public.regions r on r.id = d.region_id where a.id = ctx.v_academy);
end $$;

create or replace function public.coach_sessions(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx(p_academy);
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'held_on', s.held_on, 'topic', s.topic, 'duration_min', s.duration_min, 'notes', s.notes,
            'present', (select count(*) from public.academy_session_players sp where sp.session_id = s.id and sp.present),
            'players', coalesce((select jsonb_agg(sp.player_id) from public.academy_session_players sp where sp.session_id = s.id and sp.present), '[]'::jsonb)) order by s.held_on desc, s.created_at desc)
          from (select * from public.academy_sessions where academy_id = ctx.v_academy order by held_on desc limit 40) s), '[]'::jsonb);
end $$;

create or replace function public.coach_schedule(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record; v_dist uuid; v_region uuid;
begin
  select * into ctx from public.coach_ctx(p_academy);
  select a.district_id, d.region_id into v_dist, v_region from public.academies a left join public.districts d on d.id = a.district_id where a.id = ctx.v_academy;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'stage', c.stage, 'status', c.status, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'venue', c.venue, 'age_groups', c.age_groups,
      'district', d.name, 'own_district', c.district_id = v_dist, 'submissions_open', c.submissions_open and c.status in ('planned','open'),
      'days', coalesce((select jsonb_agg(jsonb_build_object('id', cd.id, 'day_date', cd.day_date, 'start_time', cd.start_time, 'end_time', cd.end_time, 'notes', cd.notes) order by cd.day_date, cd.start_time) from public.camp_days cd where cd.camp_id = c.id), '[]'::jsonb),
      'booking', (select jsonb_build_object('id', b.id, 'day_id', b.day_id, 'day_date', cd.day_date, 'start_time', cd.start_time, 'end_time', cd.end_time, 'report_time', b.report_time,
                                            'players_expected', b.players_expected, 'status', b.status, 'coach_note', b.coach_note, 'staff_note', b.staff_note, 'confirmed_at', b.confirmed_at, 'arrived_at', b.arrived_at)
                    from public.camp_bookings b left join public.camp_days cd on cd.id = b.day_id where b.camp_id = c.id and b.academy_id = ctx.v_academy),
      'my_players', (select count(*) from public.camp_participants cp join public.players p on p.id = cp.player_id where cp.camp_id = c.id and p.academy_id = ctx.v_academy and cp.status <> 'removed'),
      'my_invited', (select count(*) from public.camp_participants cp join public.players p on p.id = cp.player_id where cp.camp_id = c.id and p.academy_id = ctx.v_academy and cp.status in ('invited','confirmed'))
    ) order by c.starts_on nulls last, c.name)
      from public.camps c left join public.districts d on d.id = c.district_id
      join public.seasons s on s.id = c.season_id and s.is_current_scouting
     where c.status <> 'cancelled'
       and (coalesce(c.ends_on, c.starts_on) is null or coalesce(c.ends_on, c.starts_on) >= current_date - 45)
       and ((c.stage = 'district' and (coalesce(c.region_id, d.region_id) = v_region))
            or (c.stage <> 'district' and exists (select 1 from public.camp_participants cp join public.players p on p.id = cp.player_id where cp.camp_id = c.id and p.academy_id = ctx.v_academy and cp.status <> 'removed')))
  ), '[]'::jsonb);
end $$;

do $$ declare f text; begin
  foreach f in array array['coach_squad(uuid)','coach_academy(uuid)','coach_sessions(uuid)','coach_schedule(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
