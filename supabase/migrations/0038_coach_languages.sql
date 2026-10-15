-- 0038 · The coach portal in the coach's language (stage 20).
-- profiles.lang (the language the coach chose in the portal); notifications carry a Kinyarwanda title/body rendered
-- from their data (notif_rw) so the in-app list and the push both arrive in the coach's language; Kinyarwanda labels
-- for badges, levels, point rules, rewards and notification types; coach_progress and my_notification_prefs return them.

-- ───────── Columns ─────────
alter table public.profiles add column if not exists lang text not null default 'en';
alter table public.notifications add column if not exists title_rw text, add column if not exists body_rw text;
alter table public.badges add column if not exists label_rw text, add column if not exists description_rw text;
alter table public.point_levels add column if not exists label_rw text;
alter table public.point_rules add column if not exists label_rw text, add column if not exists description_rw text;
alter table public.reward_catalog add column if not exists label_rw text, add column if not exists description_rw text;
alter table public.notification_types add column if not exists label_rw text, add column if not exists description_rw text;

-- The portal tells the server which language the coach uses (push notifications follow it).
create or replace function public.set_lang(p_lang text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set lang = case when p_lang ~ '^[a-z]{2,5}$' then p_lang else 'en' end where id = auth.uid()
$$;
revoke execute on function public.set_lang(text) from public, anon;
grant execute on function public.set_lang(text) to authenticated;

-- ───────── Kinyarwanda dates ─────────
create or replace function public.rw_month(p_month int) returns text
language sql immutable as $$
  select (array['Mutarama','Gashyantare','Werurwe','Mata','Gicurasi','Kamena','Nyakanga','Kanama','Nzeri','Ukwakira','Ugushyingo','Ukuboza'])[p_month]
$$;
create or replace function public.rw_date(p_date date, p_year boolean default true) returns text
language sql immutable as $$
  select case when p_date is null then null
              else extract(day from p_date)::int || ' ' || public.rw_month(extract(month from p_date)::int) || case when p_year then ' ' || extract(year from p_date)::int else '' end end
$$;
create or replace function public.rw_day(p_date date) returns text
language sql immutable as $$
  select case when p_date is null then null
              else (array['Ku wa mbere','Ku wa kabiri','Ku wa gatatu','Ku wa kane','Ku wa gatanu','Ku wa gatandatu','Ku cyumweru'])[extract(isodow from p_date)::int] || ', ' || public.rw_date(p_date, false) end
$$;

-- ───────── Kinyarwanda text of a notification, from its data ─────────
-- Returns nulls when the type has no template (staff notifications, free-text messages): the English text stays.
create or replace function public.notif_rw(p_type text, p_user uuid, p_data jsonb, out o_title text, out o_body text) returns record
language plpgsql stable security definer set search_path = public as $$
declare d jsonb := coalesce(p_data, '{}'::jsonb); v_proj uuid; v_name text; v_label text; v_desc text;
        v_stage text; v_dec text;
begin
  o_title := null; o_body := null;
  if p_type = 'invite.final' then
    v_stage := case d->>'stage' when 'national_final' then 'irushanwa rya nyuma ry''igihugu' when 'province_final' then 'irushanwa rya nyuma ry''intara' else 'ikambi' end;
    o_title := (d->>'player') || ' yatumiwe mu ' || v_stage;
    o_body := coalesce(d->>'camp', '') || coalesce(' · ' || public.rw_date((d->>'date')::date), '') || coalesce(' · ' || (d->>'venue'), '')
      || coalesce('. Nyamuneka usubize bitarenze ' || public.rw_date((d->>'deadline')::date, false) || '.', '. Nyamuneka wemeze ko azaza.');
  elsif p_type = 'decision.published' then
    v_dec := case d->>'decision' when 'selected' then 'Yatoranyijwe' when 'see_again' then 'Azongera kurebwa' else 'Ntiyatoranyijwe ubu' end;
    o_title := (d->>'player') || ': ' || v_dec;
    o_body := coalesce(d->>'camp', '') || coalesce(E'\n' || nullif(d->>'message', ''), '');
  elsif p_type = 'camp.opened' then
    o_title := (d->>'camp') || ' yafunguwe: ohereza abakinnyi';
    o_body := coalesce((d->>'district') || ' · ', '') || coalesce(public.rw_date((d->>'date')::date), 'itariki izemezwa') || coalesce(' · ' || (d->>'venue'), '')
      || '. Ohereza abakinnyi ushaka ko abashakashatsi b''impano babona.';
  elsif p_type = 'camp.day_assigned' then
    o_title := 'Umunsi wawe kuri ' || (d->>'camp') || ': ' || coalesce(public.rw_day((d->>'day')::date), '');
    o_body := 'Mugereyo ' || coalesce('saa ' || (d->>'time'), 'ku itangira') || coalesce(' · ' || (d->>'venue'), '') || '. Nyamuneka wemeze muri Gahunda.';
  elsif p_type = 'camp.reminder' then
    o_title := (d->>'camp') || case when (d->>'days') = '1' then ' ni ejo' else ' ni mu minsi 3' end;
    o_body := coalesce(public.rw_date((d->>'date')::date, false), '') || coalesce(' · ' || (d->>'venue'), '') || '. Genzura abakinnyi bawe kandi mugere ku gihe.';
  elsif p_type = 'rsvp.deadline' then
    o_title := 'Subiza bitarenze ejo: ' || (d->>'camp');
    o_body := 'Ubutumire bwo mu irushanwa rya nyuma buracyategereje igisubizo cyawe.';
  elsif p_type = 'points.earned' then
    select project_id into v_proj from public.profiles where id = p_user;
    v_name := coalesce(nullif(d->>'name', ''), 'amanota');
    select coalesce(r.label_rw, r.label) into v_label from public.point_rules r where r.project_id = v_proj and r.code = d->>'rule';
    o_title := '+' || coalesce(d->>'points', '0') || ' ' || v_name || coalesce(' · ' || v_label, '');
    o_body := 'Ubu ufite ' || v_name || ' ' || coalesce(d->>'total', '0') || '.';
  elsif p_type = 'level.up' then
    select project_id into v_proj from public.profiles where id = p_user;
    v_name := coalesce(nullif(d->>'name', ''), 'amanota');
    if d ? 'badge' then
      select coalesce(b.label_rw, b.label), coalesce(b.description_rw, b.description) into v_label, v_desc from public.badges b where b.project_id = v_proj and b.code = d->>'badge';
      o_title := 'Ikirango gishya: ' || coalesce(v_label, d->>'badge');
      o_body := v_desc;
    else
      select coalesce(l.label_rw, l.label) into v_label from public.point_levels l where l.project_id = v_proj and l.code = d->>'level';
      o_title := 'Wageze ku rwego ' || coalesce(v_label, d->>'level') || '!';
      o_body := 'Urwego ' || coalesce(v_label, d->>'level') || coalesce(' ufite ' || v_name || ' ' || (d->>'total'), '') || '. Komeza utyo.';
    end if;
  elsif p_type = 'account.approved' then
    o_title := 'Konti yawe yemejwe';
    o_body := 'Murakaza neza kuri Tony. Irembo ry''ishuri ryawe rirafunguye: ongeramo ikipe yawe kandi ukurikirane ikambi zifunguye.';
  end if;
end $$;
revoke execute on function public.notif_rw(text, uuid, jsonb) from public, anon, authenticated;

-- ───────── notify(): both languages stored; grouping keeps them current ─────────
create or replace function public.notify(p_type text, p_user uuid, p_title text, p_body text, p_link text default null, p_data jsonb default '{}'::jsonb, p_group_key text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare ch record; t public.notification_types; v_id uuid; v_proj uuid; v_existing uuid; rw record;
begin
  select * into ch from public.notification_channels(p_user, p_type);
  if not (ch.in_app or ch.push or ch.email or ch.sms) then return null; end if;
  select * into t from public.notification_types where code = p_type;
  select project_id into v_proj from public.profiles where id = p_user;
  select * into rw from public.notif_rw(p_type, p_user, p_data);
  -- grouping: a fresh unread notification of the same kind absorbs this one
  if p_group_key is not null and t.group_window is not null then
    select id into v_existing from public.notifications
     where user_id = p_user and type = p_type and group_key = p_group_key and read_at is null and created_at > now() - t.group_window
     order by created_at desc limit 1;
    if v_existing is not null then
      update public.notifications set count = count + 1, body = p_body, body_rw = rw.o_body, data = p_data, created_at = now() where id = v_existing;
      return v_existing;
    end if;
  end if;
  insert into public.notifications(user_id, project_id, type, title, body, title_rw, body_rw, link, data, group_key, read_at, seen_at)
  values (p_user, v_proj, p_type, p_title, p_body, rw.o_title, rw.o_body, p_link, coalesce(p_data, '{}'::jsonb), p_group_key,
          case when ch.in_app then null else now() end, case when ch.in_app then null else now() end)
  returning id into v_id;
  if ch.push and exists (select 1 from public.push_subscriptions where user_id = p_user) then
    insert into public.notification_outbox(notification_id, channel) values (v_id, 'push');
  end if;
  if ch.email then insert into public.notification_outbox(notification_id, channel, status) values (v_id, 'email', 'skipped'); end if;
  if ch.sms then insert into public.notification_outbox(notification_id, channel, status) values (v_id, 'sms', 'skipped'); end if;
  return v_id;
end $$;

-- The push goes out in the language of the profile.
create or replace function public.outbox_take(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return coalesce((with q as (
      select o.id from public.notification_outbox o where o.status = 'queued' and o.channel = 'push' and o.send_after <= now() order by o.id limit p_limit for update skip locked),
    u as (update public.notification_outbox o set status = 'sending', attempts = attempts + 1 from q where o.id = q.id returning o.id, o.notification_id)
    select jsonb_agg(jsonb_build_object('outbox_id', u.id, 'notification_id', n.id, 'user_id', n.user_id,
             'title', case when pr.lang = 'rw' and n.title_rw is not null then n.title_rw else n.title end,
             'body', case when pr.lang = 'rw' and n.title_rw is not null then n.body_rw else n.body end,
             'link', n.link, 'type', n.type,
             'subs', (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) from public.push_subscriptions s where s.user_id = n.user_id)))
      from u join public.notifications n on n.id = u.notification_id left join public.profiles pr on pr.id = n.user_id), '[]'::jsonb);
end $$;

-- ───────── Senders pass what the template needs ─────────
drop function if exists public.notify_academy(uuid, text, text, text);
create or replace function public.notify_academy(p_player uuid, p_title text, p_body text, p_link text, p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare u record; v_type text := case when p_link = 'invites' then 'invite.final' else 'decision.published' end;
        v_link text := case when p_link = 'invites' then '/camps' when p_link like 'player:%' then '/squad?player=' || substr(p_link, 8) else p_link end;
begin
  for u in select pr.id from public.players pl join public.profiles pr on pr.academy_id = pl.academy_id and pr.role = 'coach' and pr.status = 'active' where pl.id = p_player loop
    perform public.notify(v_type, u.id, p_title, p_body, v_link, coalesce(p_data, '{}'::jsonb) || jsonb_build_object('player_id', p_player));
  end loop;
end $$;
revoke execute on function public.notify_academy(uuid, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.cp_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.camps; v_name text;
begin
  select * into c from public.camps where id = new.camp_id;
  select trim(first_name || ' ' || last_name) into v_name from public.players where id = new.player_id;
  if new.status = 'invited' and (tg_op = 'INSERT' or old.status is distinct from 'invited') and c.stage <> 'district' then
    perform public.notify_academy(new.player_id,
      v_name || ' is invited to the ' || replace(c.stage::text, '_', ' '),
      c.name || coalesce(' · ' || to_char(c.starts_on, 'DD Mon YYYY'), '') || coalesce(' · ' || c.venue, '')
        || coalesce('. Please reply by ' || to_char(c.rsvp_deadline, 'DD Mon'), '. Please confirm attendance.'),
      'invites',
      jsonb_build_object('player', v_name, 'camp', c.name, 'stage', c.stage, 'date', c.starts_on, 'venue', c.venue, 'deadline', c.rsvp_deadline, 'camp_id', c.id));
  end if;
  if tg_op = 'UPDATE' and new.decision_published and new.decision is not null
     and (not old.decision_published or old.decision is distinct from new.decision) then
    perform public.notify_academy(new.player_id,
      v_name || ': ' || case new.decision when 'selected' then 'selected' when 'see_again' then 'to be seen again' else 'not selected this time' end,
      c.name || coalesce(E'\n' || new.coach_message, ''),
      'player:' || new.player_id,
      jsonb_build_object('player', v_name, 'camp', c.name, 'stage', c.stage, 'decision', new.decision, 'message', new.coach_message, 'camp_id', c.id));
  end if;
  return null;
end $$;

create or replace function public.camps_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_region uuid; v_dist text;
begin
  if tg_op = 'UPDATE' and new.submissions_open and not old.submissions_open and new.stage = 'district' and new.status in ('planned','open') then
    select d.region_id, d.name into v_region, v_dist from public.districts d where d.id = new.district_id;
    perform public.notify_coaches('camp.opened', new.project_id, coalesce(new.region_id, v_region), null,
      new.name || ' is open for submissions',
      coalesce(v_dist || ' · ', '') || coalesce(to_char(new.starts_on, 'DD Mon YYYY'), 'date to be confirmed') || coalesce(' · ' || new.venue, '') || '. Submit the players you want the scouts to see.',
      '/camps', jsonb_build_object('camp_id', new.id, 'camp', new.name, 'district', v_dist, 'date', new.starts_on, 'venue', new.venue));
  end if;
  return null;
end $$;

create or replace function public.camp_bookings_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.camps; d public.camp_days; v_role public.app_role; v_time text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'coach' or new.day_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.day_id is not distinct from old.day_id and new.report_time is not distinct from old.report_time then return null; end if;
  select * into c from public.camps where id = new.camp_id;
  select * into d from public.camp_days where id = new.day_id;
  v_time := to_char(coalesce(new.report_time, d.start_time), 'HH24:MI');
  perform public.notify_coaches_of_academy('camp.day_assigned', new.academy_id,
    'Your day at ' || c.name || ': ' || to_char(d.day_date, 'Dy DD Mon'),
    'Report at ' || coalesce(v_time, 'the start') || coalesce(' · ' || c.venue, '') || '. Please confirm in the Schedule.',
    '/schedule', jsonb_build_object('camp_id', c.id, 'booking_id', new.id, 'camp', c.name, 'day', d.day_date, 'time', v_time, 'venue', c.venue));
  return null;
end $$;

create or replace function public.notifications_daily() returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_today date := current_date;
begin
  -- coaches: camp in 3 days / tomorrow where their players are submitted or invited
  for r in select distinct pr.id as user_id, c.id as camp_id, c.name, c.starts_on, c.venue
             from public.camp_participants cp join public.camps c on c.id = cp.camp_id join public.players p on p.id = cp.player_id
             join public.profiles pr on pr.academy_id = p.academy_id and pr.role = 'coach' and pr.status = 'active'
            where cp.status in ('submitted','invited','confirmed') and c.status in ('planned','open') and c.starts_on in (v_today + 3, v_today + 1) loop
    perform public.notify('camp.reminder', r.user_id, r.name || case when r.starts_on = v_today + 1 then ' is tomorrow' else ' is in 3 days' end,
      to_char(r.starts_on, 'DD Mon') || coalesce(' · ' || r.venue, '') || '. Check your players and be on time.', '/camps',
      jsonb_build_object('camp_id', r.camp_id, 'camp', r.name, 'date', r.starts_on, 'venue', r.venue, 'days', case when r.starts_on = v_today + 1 then 1 else 3 end),
      'camp:' || r.camp_id || ':' || r.starts_on);
  end loop;
  -- coaches: reply deadline tomorrow
  for r in select distinct pr.id as user_id, c.id as camp_id, c.name, c.rsvp_deadline
             from public.camp_participants cp join public.camps c on c.id = cp.camp_id join public.players p on p.id = cp.player_id
             join public.profiles pr on pr.academy_id = p.academy_id and pr.role = 'coach' and pr.status = 'active'
            where cp.status = 'invited' and c.rsvp_deadline = v_today + 1 loop
    perform public.notify('rsvp.deadline', r.user_id, 'Reply by tomorrow: ' || r.name, 'An invitation to a final still waits for your answer.', '/camps',
      jsonb_build_object('camp_id', r.camp_id, 'camp', r.name, 'deadline', r.rsvp_deadline), 'rsvp:' || r.camp_id);
  end loop;
  -- admins: coaches waiting more than 48 hours
  for r in select project_id, count(*) n from public.profiles where role = 'coach' and status = 'pending' and created_at < now() - interval '48 hours' group by project_id loop
    perform public.notify_staff('coach.pending_reminder', r.project_id, null, r.n || ' coach' || case when r.n > 1 then 'es are' else ' is' end || ' waiting for approval',
      'They signed up more than two days ago. Open Users to review them.', '/users', '{}'::jsonb, 'pending');
  end loop;
  -- staff: camp in 3 days in their provinces
  for r in select id, project_id, name, starts_on, venue from public.camps where status in ('planned','open') and starts_on = v_today + 3 loop
    perform public.notify_staff('camp.starts_soon', r.project_id, public.camp_region(r.id), r.name || ' starts in 3 days',
      to_char(r.starts_on, 'DD Mon') || coalesce(' · ' || r.venue, '') || '. Check the camp sheet, staff and equipment.', '/scouting/camps/' || r.id, jsonb_build_object('camp_id', r.id), 'soon:' || r.id);
  end loop;
  -- staff: decisions still unpublished a week after a camp ended
  for r in select c.id, c.project_id, c.name, count(*) n from public.camps c join public.camp_participants cp on cp.camp_id = c.id
            where coalesce(c.ends_on, c.starts_on) = v_today - 7 and cp.decision is not null and not cp.decision_published group by c.id loop
    perform public.notify_staff('decisions.unpublished', r.project_id, public.camp_region(r.id), r.name || ': ' || r.n || ' decisions not published',
      'The camp ended a week ago. Publish the decisions so the coaches hear back.', '/scouting/camps/' || r.id, jsonb_build_object('camp_id', r.id), 'unpub:' || r.id);
  end loop;
  -- admins: documents expiring within 30 days
  for r in select p.project_id, count(*) n from public.player_documents d join public.players p on p.id = d.player_id
            where d.expires_on between v_today and v_today + 30 and d.status <> 'expired' group by p.project_id loop
    perform public.notify_staff('document.expiring', r.project_id, null, r.n || ' player document' || case when r.n > 1 then 's expire' else ' expires' end || ' within 30 days',
      'Open Player files to see which ones.', '/player-files', '{}'::jsonb, 'docs');
  end loop;
  -- housekeeping: read notifications older than 90 days go
  delete from public.notifications where read_at is not null and created_at < now() - interval '90 days';
  delete from public.notification_outbox where status in ('sent','failed','skipped') and created_at < now() - interval '30 days';
end $$;

-- level_of carries the Kinyarwanda label too
create or replace function public.level_of(p_project uuid, p_points int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', l.code, 'label', l.label, 'label_rw', l.label_rw, 'min_points', l.min_points,
           'next', (select jsonb_build_object('code', n.code, 'label', n.label, 'label_rw', n.label_rw, 'min_points', n.min_points) from public.point_levels n where n.project_id = p_project and n.min_points > p_points order by n.min_points limit 1))
    from public.point_levels l where l.project_id = p_project and l.min_points <= p_points order by l.min_points desc limit 1
$$;

create or replace function public.award_points(p_rule text, p_user uuid, p_ref_table text default null, p_ref_id text default null, p_note text default null, p_points int default null, p_by uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare r public.point_rules; v_proj uuid; v_academy uuid; v_season uuid; v_status public.user_status; v_role public.app_role;
        v_before int; v_after int; lv_before jsonb; lv_after jsonb; v_pts int; n int; v_name text; v_custom text;
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
  v_custom := nullif(trim(coalesce((select settings->'points_name'->>'many' from public.projects where id = v_proj), '')), '');
  v_name := coalesce(v_custom, 'points');
  insert into public.point_events(project_id, season_id, user_id, academy_id, rule, points, ref_table, ref_id, note, created_by)
  values (v_proj, v_season, p_user, v_academy, p_rule, v_pts, p_ref_table, p_ref_id, p_note, p_by);
  v_after := v_before + v_pts;
  perform public.notify('points.earned', p_user, '+' || v_pts || ' ' || v_name || ' · ' || r.label, 'You now have ' || v_after || ' ' || v_name || '.', '/progress',
    jsonb_build_object('rule', p_rule, 'points', v_pts, 'total', v_after, 'name', v_custom), 'points:' || to_char(now(), 'YYYY-MM-DD'));
  lv_before := public.level_of(v_proj, v_before); lv_after := public.level_of(v_proj, v_after);
  if lv_after->>'code' is distinct from lv_before->>'code' and v_pts > 0 then
    perform public.notify('level.up', p_user, 'You reached ' || (lv_after->>'label') || '!', 'Level ' || (lv_after->>'label') || ' with ' || v_after || ' ' || v_name || '. Keep going.', '/progress',
      jsonb_build_object('level', lv_after->>'code', 'total', v_after, 'name', v_custom));
  end if;
  perform public.check_badges(p_user);
  return v_pts;
end $$;

create or replace function public.give_badge(p_user uuid, p_proj uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.badges;
begin
  insert into public.user_badges(user_id, badge) values (p_user, p_code) on conflict do nothing;
  if not found then return; end if;
  select * into b from public.badges where project_id = p_proj and code = p_code;
  perform public.notify('level.up', p_user, 'New badge: ' || coalesce(b.label, p_code), b.description, '/progress', jsonb_build_object('badge', p_code));
end $$;

-- ───────── What the coach reads ─────────
create or replace function public.coach_progress(p_academy uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx record; v_user uuid; v_season uuid; v_total int; v_season_pts int; lv jsonb;
begin
  select * into ctx from public.coach_ctx(p_academy);
  v_user := case when p_academy is null then auth.uid() else (select id from public.profiles where academy_id = ctx.v_academy and role = 'coach' and status = 'active' order by created_at limit 1) end;
  select id into v_season from public.seasons where project_id = ctx.v_project and is_current_scouting;
  v_total := coalesce(public.user_points(v_user), 0); v_season_pts := coalesce(public.user_points(v_user, v_season), 0);
  lv := public.level_of(ctx.v_project, v_total);
  return jsonb_build_object(
    'points', v_total, 'season_points', v_season_pts, 'level', lv,
    'levels', (select jsonb_agg(jsonb_build_object('code', code, 'label', label, 'label_rw', label_rw, 'min_points', min_points) order by min_points) from public.point_levels where project_id = ctx.v_project),
    'badges', (select jsonb_agg(jsonb_build_object('code', b.code, 'label', b.label, 'label_rw', b.label_rw, 'description', b.description, 'description_rw', b.description_rw, 'icon', b.icon, 'family', b.family, 'tier', b.tier, 'earned_at', ub.earned_at) order by b.sort)
                 from public.badges b left join public.user_badges ub on ub.badge = b.code and ub.user_id = v_user where b.project_id = ctx.v_project),
    'rules', (select jsonb_agg(jsonb_build_object('code', code, 'points', points, 'label', label, 'label_rw', label_rw, 'description', description, 'description_rw', description_rw, 'cap', cap, 'cap_period', cap_period) order by sort)
                from public.point_rules where project_id = ctx.v_project and active and code not like 'staff.bonus' and code not like 'staff.penalty'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.created_at, 'rule', e.rule, 'points', e.points, 'label', coalesce(r.label, e.rule), 'label_rw', r.label_rw, 'note', e.note) order by e.created_at desc)
                 from (select * from public.point_events where user_id = v_user and voided_at is null order by created_at desc limit 30) e
                 left join public.point_rules r on r.project_id = ctx.v_project and r.code = e.rule), '[]'::jsonb),
    'rank', jsonb_build_object(
      'district', (select x->>'rank' from jsonb_array_elements(public.leaderboard('district', v_season, ctx.v_academy)) x where (x->>'mine')::boolean limit 1),
      'province', (select x->>'rank' from jsonb_array_elements(public.leaderboard('province', v_season, ctx.v_academy)) x where (x->>'mine')::boolean limit 1),
      'national', (select x->>'rank' from jsonb_array_elements(public.leaderboard('national', v_season, ctx.v_academy)) x where (x->>'mine')::boolean limit 1)),
    'province_board', public.leaderboard('province', v_season, ctx.v_academy),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', created_at, 'reliability', reliability, 'player_quality', player_quality, 'engagement', engagement, 'cooperation', cooperation, 'comment', comment) order by created_at desc)
                 from public.coach_reviews where coach_id = v_user and visible_to_coach), '[]'::jsonb));
end $$;

create or replace function public.my_notification_prefs() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('type', t.code, 'category', t.category, 'label', t.label, 'description', t.description, 'label_rw', t.label_rw, 'description_rw', t.description_rw,
           'in_app', c.in_app, 'push', c.push, 'email', c.email, 'sms', c.sms,
           'custom', exists (select 1 from public.notification_prefs p where p.user_id = auth.uid() and p.type = t.code)) order by t.sort), '[]'::jsonb)
    from public.notification_types t, lateral public.notification_channels(auth.uid(), t.code) c
   where (select role from public.profiles where id = auth.uid()) = any(t.audience)
$$;

-- ───────── Kinyarwanda drafts (a native review is still planned) ─────────
update public.notification_types t set label_rw = v.l, description_rw = v.d from (values
  ('account.approved',   'Konti yemejwe',                        'Konti yawe yemejwe kandi irembo ry''ishuri ryawe rirafunguye.'),
  ('camp.opened',        'Ikambi yafunguwe',                     'Ikambi y''akarere mu ntara yawe yafunguriwe kohereza abakinnyi.'),
  ('camp.day_assigned',  'Umunsi wawe w''ikambi',                'Umunsi n''isaha ishuri ryawe rizaza mu ikambi byashyizweho cyangwa byahinduwe.'),
  ('camp.reminder',      'Kwibutsa ikambi',                      'Iminsi itatu n''umunsi umwe mbere y''ikambi abakinnyi bawe barimo.'),
  ('invite.final',       'Ubutumire mu irushanwa rya nyuma',     'Umwe mu bakinnyi bawe yatumiwe mu irushanwa rya nyuma ry''intara cyangwa ry''igihugu.'),
  ('rsvp.deadline',      'Igihe ntarengwa cyo gusubiza',         'Umunsi mbere y''igihe ntarengwa cyo gusubiza ubutumire.'),
  ('decision.published', 'Icyemezo ku mukinnyi',                 'Abakozi batangaje icyemezo ku mwe mu bakinnyi bawe.'),
  ('player.status',      'Aho umukinnyi ageze',                  'Umukinnyi yimuriwe mu itsinda ry''impano, mu ikipe ya Tony, cyangwa yarekuwe.'),
  ('points.earned',      'Amanota wabonye',                      'Amanota wabonye, rimwe ku munsi.'),
  ('level.up',           'Urwego rushya cyangwa ikirango',       'Wageze ku rwego rushya cyangwa wabonye ikirango.'),
  ('message.staff',      'Ubutumwa bw''abakozi ba Tony',         'Ubutumwa bwihariye buturutse ku bakozi.')
) as v(c, l, d) where t.code = v.c;

update public.point_levels t set label_rw = v.l from (values
  ('rookie', 'Umutangizi'), ('bronze', 'Umuringa'), ('silver', 'Ifeza'), ('gold', 'Zahabu'), ('platinum', 'Platine'), ('diamond', 'Diyama'), ('legend', 'Ikirangirire')
) as v(c, l) where t.code = v.c;

update public.point_rules t set label_rw = v.l, description_rw = v.d from (values
  ('academy.photo',            'Ifoto y''ikipe',                                   'Ifoto y''ishuri cyangwa y''ikipe ku mwirondoro.'),
  ('academy.profile_complete', 'Umwirondoro w''ishuri wuzuye',                      'Ikibuga, iminsi, telefone n''amatsinda y''imyaka byujujwe.'),
  ('account.approved',         'Konti yemejwe',                                    'Konti yawe y''umutoza yemejwe.'),
  ('camp.arrived',             'Mwaje mu ikambi',                                  'Ishuri ryawe ryageze mu ikambi n''abakinnyi baryo.'),
  ('camp.booking_confirmed',   'Umunsi w''ikambi wemejwe',                          'Wemeje umunsi wawe mu ikambi ku gihe.'),
  ('camp.submitted',           'Umukinnyi yoherejwe',                              'Umukinnyi yoherejwe mu ikambi y''akarere.'),
  ('equipment.updated',        'Urutonde rw''ibikoresho rwavuguruwe',               'Ibikoresho ku kibuga byabazwe kandi bivugururwa (rimwe mu gihembwe).'),
  ('match.logged',             'Umukino wanditswe',                                'Umukino w''ishuri n''abakinnyi baryo.'),
  ('match.official',           'Umukino wemewe',                                   'Inyongera ku mukino wa shampiyona, igikombe cyangwa irushanwa.'),
  ('player.added',             'Umukinnyi yongewemo',                              'Umukinnyi yongewe mu ikipe yawe.'),
  ('player.attended',          'Umukinnyi yitabiriye',                             'Umukinnyi wawe yari mu ikambi.'),
  ('player.guardian_consent',  'Uburenganzira bw''umurera',                         'Umurera yemeye ikambi za Tony.'),
  ('player.profile_complete',  'Umwirondoro w''umukinnyi wuzuye',                   'Ifoto, uburebure n''ibiro byongewe ku mukinnyi.'),
  ('player.remeasured',        'Umukinnyi yongeye gupimwa',                        'Uburebure n''ibiro byavuguruwe nyuma y''amezi abiri cyangwa arenga.'),
  ('player.selected.district', 'Yatoranyijwe mu ikambi y''akarere',                 'Umwe mu bakinnyi bawe yatoranyijwe mu ikambi y''akarere.'),
  ('player.selected.national', 'Yatoranyijwe mu irushanwa rya nyuma ry''igihugu',   'Umwe mu bakinnyi bawe yatoranyijwe mu irushanwa rya nyuma ry''igihugu.'),
  ('player.selected.province', 'Yatoranyijwe mu irushanwa rya nyuma ry''intara',    'Umwe mu bakinnyi bawe yatoranyijwe mu irushanwa rya nyuma ry''intara.'),
  ('player.tony_squad',        'Umukinnyi yinjiye mu ikipe ya Tony',               'Umwe mu bakinnyi bawe yabaye umukinnyi w''ikipe ya Tony.'),
  ('rsvp.on_time',             'Wasubije ku gihe',                                 'Wasubije ubutumire mbere y''igihe ntarengwa.'),
  ('session.full_attendance',  'Ubwitabire bukomeye',                              'Imyitozo aho nibura 80% by''ikipe bari bahari.'),
  ('session.logged',           'Imyitozo yanditswe',                               'Imyitozo ifite urutonde rw''abitabiriye.'),
  ('staff.bonus',              'Inyongera y''abakozi ba Tony',                      'Amanota y''inyongera yatanzwe n''abakozi.'),
  ('staff.member_added',       'Umukozi yongewemo',                                'Umutoza, umwungirije cyangwa umufasha w''ishuri yongewemo (kugeza kuri 5).'),
  ('staff.penalty',            'Igihano cy''abakozi ba Tony',                       'Amanota yakuweho n''abakozi.'),
  ('weekly.active',            'Wakoze iki cyumweru',                              'Wakoresheje irembo iki cyumweru.')
) as v(c, l, d) where t.code = v.c;

update public.badges t set label_rw = v.l, description_rw = v.d from (values
  ('active_10',          'Ibyumweru 10 ukora',                 'Wakoresheje irembo ibyumweru icumi bikurikirana.'),
  ('active_26',          'Igice cy''umwaka ukora',              'Wakoresheje irembo ibyumweru 26 bikurikirana.'),
  ('active_52',          'Umwaka wose',                        'Wakoresheje irembo ibyumweru 52 bikurikirana.'),
  ('all_rounder',        'Uzi byose',                          'Imyitozo ifite intego eshanu zitandukanye mu gihembwe kimwe.'),
  ('always_on_time',     'Buri gihe ku gihe',                  'Ubutumire butatu bwasubijwe mbere y''igihe ntarengwa.'),
  ('big_squad',          'Ikipe nini',                         'Abakinnyi 25 cyangwa barenga bakina.'),
  ('camp_regular',       'Umenyerewe mu ikambi',               'Wageze mu ikambi eshatu n''abakinnyi bawe.'),
  ('first_match',        'Umukino wa mbere',                   'Umukino wa mbere wanditswe.'),
  ('first_official',     'Umupira wemewe',                     'Umukino wa shampiyona, igikombe cyangwa irushanwa wanditswe.'),
  ('first_player',       'Umukinnyi wa mbere',                 'Wongeyeho umukinnyi wa mbere mu ikipe.'),
  ('first_selection',    'Gutoranywa kwa mbere',               'Umukinnyi watoranyijwe ku nshuro ya mbere.'),
  ('full_squad',         'Ikipe yuzuye',                       'Abakinnyi 15 cyangwa barenga bakina.'),
  ('gk_coach',           'Umutoza w''abanyezamu',               'Imyitozo itatu y''abanyezamu yanditswe.'),
  ('goals_50',           'Ibitego 50',                         'Ibitego 50 by''abakinnyi bawe byanditswe mu mikino.'),
  ('guardians_in',       'Ababyeyi bemeye',                    'Buri mukinnyi ukina afite uburenganzira bw''umurera.'),
  ('matches_10',         'Imikino 10',                         'Imikino 10 yanditswe.'),
  ('matches_50',         'Imikino 50',                         'Imikino 50 yanditswe.'),
  ('national_final',     'Irushanwa rya nyuma ry''igihugu',     'Umukinnyi mu irushanwa rya nyuma ry''igihugu.'),
  ('numbers_on',         'Nimero ku mugongo',                  'Nimero z''imyambaro ku bakinnyi nibura 11.'),
  ('perfect_attendance', 'Bose baje',                          'Imyitozo y''abakinnyi 10 cyangwa barenga nta n''umwe wabuze.'),
  ('profiles_done',      'Buri sura irazwi',                   'Buri mukinnyi ukina afite ifoto, uburebure n''ibiro.'),
  ('province_final',     'Irushanwa rya nyuma ry''intara',      'Umukinnyi mu irushanwa rya nyuma ry''intara.'),
  ('session_streak',     'Ibyumweru bine bikurikirana',        'Imyitozo yanditswe buri cyumweru mu byumweru bine.'),
  ('session_streak_12',  'Ibyumweru 12 bikurikirana',          'Imyitozo yanditswe buri cyumweru mu byumweru 12.'),
  ('session_streak_26',  'Igice cy''umwaka bikurikirana',       'Imyitozo yanditswe buri cyumweru mu byumweru 26.'),
  ('sessions_100',       'Imyitozo 100',                       'Imyitozo 100 yanditswe.'),
  ('sessions_25',        'Imyitozo 25',                        'Imyitozo 25 yanditswe.'),
  ('sessions_250',       'Imyitozo 250',                       'Imyitozo 250 yanditswe.'),
  ('team_behind',        'Ikipe inyuma y''ikipe',               'Abakozi b''ishuri batatu cyangwa barenga banditswe.'),
  ('team_photo',         'Ifoto y''ikipe',                      'Ifoto y''ikipe ku mwirondoro w''ishuri.'),
  ('ten_submitted',      'Umenya impano',                      'Abakinnyi 10 batandukanye boherejwe mu ikambi.'),
  ('tony_squad',         'Ikipe ya Tony',                      'Umukinnyi wawe yinjiye mu ikipe ya Tony.'),
  ('tournament',         'Ikipe y''amarushanwa',                'Imikino itatu y''amarushanwa yanditswe.'),
  ('well_equipped',      'Mufite ibikoresho bihagije',         'Nibura imipira 8 myiza, amakoti 10, utwuma 10 n''agasanduku k''ubutabazi bw''ibanze.')
) as v(c, l, d) where t.code = v.c;

-- Existing unread coach notifications get their Kinyarwanda text where the data allows it (older rows have no data: English stays).
with x as (
  select id, (public.notif_rw(type, user_id, data)).* from public.notifications
   where title_rw is null and type in ('account.approved', 'points.earned', 'level.up'))
update public.notifications n set title_rw = x.o_title, body_rw = x.o_body from x where x.id = n.id and x.o_title is not null;
