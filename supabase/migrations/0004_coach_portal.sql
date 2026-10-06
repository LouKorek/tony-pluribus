-- Pluribus · 0004 coach portal
-- Coaches never read players or camp rows directly: every coach action goes through the functions below,
-- which return only the coach's own academy, and only results the staff has published.

drop policy if exists players_coach_read on public.players;
drop policy if exists players_coach_insert on public.players;
drop policy if exists players_coach_update on public.players;

create or replace function public.coach_ctx(out v_academy uuid, out v_project uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  select p.academy_id, p.project_id into v_academy, v_project
    from public.profiles p where p.id = auth.uid() and p.role = 'coach' and p.status = 'active';
  if v_academy is null then raise exception 'Only an approved academy coach can do this'; end if;
end $$;

-- What a coach may see of one participation
create or replace function public.coach_view_participation(cp public.camp_participants, c public.camps)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', cp.id, 'camp_id', c.id, 'camp', c.name, 'stage', c.stage, 'starts_on', c.starts_on, 'ends_on', c.ends_on,
    'venue', c.venue, 'rsvp_deadline', c.rsvp_deadline, 'status', cp.status,
    'decision', case when cp.decision_published then cp.decision end,
    'message', case when cp.decision_published then cp.coach_message end,
    'absence_reason', cp.absence_reason, 'note', cp.submission_note)
$$;

create or replace function public.coach_squad() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
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

create or replace function public.coach_save_player(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare ctx record; v_id uuid; v_first text; v_last text; v_year int; v_dist uuid;
begin
  select * into ctx from public.coach_ctx();
  v_first := nullif(trim(p->>'first_name'), ''); v_last := nullif(trim(p->>'last_name'), '');
  v_year := nullif(p->>'birth_year','')::int;
  if v_first is null or v_last is null then raise exception 'First and last name are required'; end if;
  if v_year is null or v_year < 1995 or v_year > extract(year from now())::int then raise exception 'Enter a valid birth year'; end if;
  select district_id into v_dist from public.academies where id = ctx.v_academy;
  perform set_config('pluribus.system', 'on', true);
  if p_id is null then
    if exists (select 1 from public.players where academy_id = ctx.v_academy and merged_into is null
                and lower(first_name) = lower(v_first) and lower(last_name) = lower(v_last) and birth_year = v_year) then
      raise exception 'This player is already in your squad';
    end if;
    insert into public.players(project_id, first_name, last_name, birth_year, birth_date, positions, preferred_foot,
                               guardian_name, guardian_phone, guardian_consent, coach_notes, academy_id, district_id, source, created_by)
    values (ctx.v_project, v_first, v_last, v_year, nullif(p->>'birth_date','')::date, nullif(p->>'positions',''), nullif(p->>'preferred_foot',''),
            nullif(p->>'guardian_name',''), nullif(p->>'guardian_phone',''), coalesce((p->>'guardian_consent')::boolean, false),
            nullif(p->>'coach_notes',''), ctx.v_academy, v_dist, 'portal', auth.uid())
    returning id into v_id;
  else
    update public.players set first_name = v_first, last_name = v_last, birth_year = v_year,
           birth_date = nullif(p->>'birth_date','')::date, positions = nullif(p->>'positions',''), preferred_foot = nullif(p->>'preferred_foot',''),
           guardian_name = nullif(p->>'guardian_name',''), guardian_phone = nullif(p->>'guardian_phone',''),
           guardian_consent = coalesce((p->>'guardian_consent')::boolean, false), coach_notes = nullif(p->>'coach_notes','')
     where id = p_id and academy_id = ctx.v_academy
     returning id into v_id;
    if v_id is null then raise exception 'Player not found in your squad'; end if;
  end if;
  perform set_config('pluribus.system', 'off', true);
  return v_id;
end $$;

create or replace function public.coach_remove_player(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  if not exists (select 1 from public.players where id = p_id and academy_id = ctx.v_academy) then raise exception 'Player not found in your squad'; end if;
  if exists (select 1 from public.camp_participants where player_id = p_id and status <> 'removed') then
    raise exception 'This player has already been to a TFEP camp and stays on record. Ask TFEP staff if he left your academy.';
  end if;
  delete from public.players where id = p_id;
end $$;

create or replace function public.coach_camps() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record; v_dist uuid; v_region uuid;
begin
  select * into ctx from public.coach_ctx();
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

create or replace function public.coach_submit(p_camp uuid, p_players uuid[], p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare ctx record; c public.camps; n int := 0; pid uuid;
begin
  select * into ctx from public.coach_ctx();
  select * into c from public.camps where id = p_camp;
  if c.id is null or c.stage <> 'district' or not c.submissions_open or c.status not in ('planned','open') then
    raise exception 'This camp is not open for submissions';
  end if;
  foreach pid in array p_players loop
    if not exists (select 1 from public.players where id = pid and academy_id = ctx.v_academy) then raise exception 'A player is not in your squad'; end if;
    insert into public.camp_participants(camp_id, player_id, status, submitted_by, submission_note)
    values (p_camp, pid, 'submitted', auth.uid(), nullif(trim(p_note), ''))
    on conflict (camp_id, player_id) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.coach_withdraw(p_participant uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  delete from public.camp_participants cp using public.players p, public.camps c
   where cp.id = p_participant and p.id = cp.player_id and c.id = cp.camp_id
     and p.academy_id = ctx.v_academy and cp.status = 'submitted' and cp.obs is null and cp.decision is null
     and (c.starts_on is null or c.starts_on > current_date);
  if not found then raise exception 'This submission can no longer be withdrawn'; end if;
end $$;

create or replace function public.coach_rsvp(p_participant uuid, p_attend boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  if not p_attend and coalesce(trim(p_reason), '') = '' then raise exception 'Please give the reason the player cannot come'; end if;
  update public.camp_participants cp
     set status = case when p_attend then 'confirmed' else 'declined' end,
         absence_reason = case when p_attend then null else trim(p_reason) end
    from public.players p
   where cp.id = p_participant and p.id = cp.player_id and p.academy_id = ctx.v_academy
     and cp.status in ('invited','confirmed','declined');
  if not found then raise exception 'This invitation cannot be answered any more'; end if;
end $$;

create or replace function public.coach_standing() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record; v_region uuid; v_season uuid; r jsonb;
begin
  select * into ctx from public.coach_ctx();
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
  ranked as (select *, rank() over (order by selected desc) rk, count(*) over () n from per)
  select jsonb_build_object('submitted', coalesce(r2.submitted,0), 'selected', coalesce(r2.selected,0),
           'rank', case when coalesce(r2.selected,0) > 0 then r2.rk end, 'academies', (select count(*) from per),
           'region', (select name from public.regions where id = v_region))
    into r from (select 1) one left join ranked r2 on r2.academy_id = ctx.v_academy;
  return r;
end $$;

-- Notifications to the academy's coaches
create or replace function public.notify_academy(p_player uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications(user_id, title, body, link)
  select pr.id, p_title, p_body, p_link
    from public.players pl join public.profiles pr on pr.academy_id = pl.academy_id and pr.role = 'coach' and pr.status = 'active'
   where pl.id = p_player
$$;

create or replace function public.cp_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.camps; v_name text;
begin
  select * into c from public.camps where id = new.camp_id;
  select first_name || ' ' || last_name into v_name from public.players where id = new.player_id;
  if new.status = 'invited' and (tg_op = 'INSERT' or old.status is distinct from 'invited') and c.stage <> 'district' then
    perform public.notify_academy(new.player_id,
      v_name || ' is invited to the ' || replace(c.stage::text, '_', ' '),
      c.name || coalesce(' · ' || to_char(c.starts_on, 'DD Mon YYYY'), '') || coalesce(' · ' || c.venue, '')
        || coalesce('. Please reply by ' || to_char(c.rsvp_deadline, 'DD Mon'), '. Please confirm attendance.'),
      'invites');
  end if;
  if tg_op = 'UPDATE' and new.decision_published and new.decision is not null
     and (not old.decision_published or old.decision is distinct from new.decision) then
    perform public.notify_academy(new.player_id,
      v_name || ': ' || case new.decision when 'selected' then 'selected' when 'see_again' then 'to be seen again' else 'not selected this time' end,
      c.name || coalesce(E'\n' || new.coach_message, ''),
      'player:' || new.player_id);
  end if;
  return null;
end $$;
drop trigger if exists cp_notify on public.camp_participants;
create trigger cp_notify after insert or update on public.camp_participants for each row execute function public.cp_notify();

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

do $$ declare f text; begin
  foreach f in array array['coach_squad()','coach_save_player(uuid,jsonb)','coach_remove_player(uuid)','coach_camps()',
                           'coach_submit(uuid,uuid[],text)','coach_withdraw(uuid)','coach_rsvp(uuid,boolean,text)','coach_standing()','mark_notifications_read()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['coach_ctx()','coach_view_participation(public.camp_participants,public.camps)','notify_academy(uuid,text,text,text)','cp_notify()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
