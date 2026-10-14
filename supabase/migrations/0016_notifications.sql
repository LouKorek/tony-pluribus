-- Tony Next · 0016 notifications: a catalogue of types with defaults per role, preferences per user,
-- one notify() for every event, grouping, an outbox for push (and later SMS / e-mail), scheduled reminders.

-- ───────── Catalogue ─────────
create table if not exists public.notification_types (
  code text primary key,
  audience public.app_role[] not null,
  category text not null,                -- camps · players · account · points · staff · system
  label text not null,
  description text not null,
  default_in_app boolean not null default true,
  default_push boolean not null default false,
  default_email boolean not null default false,
  default_sms boolean not null default false,
  group_window interval,                 -- several events in this window become one notification
  sort int not null default 0
);
alter table public.notification_types enable row level security;
drop policy if exists notification_types_read on public.notification_types;
create policy notification_types_read on public.notification_types for select to authenticated using (true);

insert into public.notification_types (code, audience, category, label, description, default_in_app, default_push, group_window, sort) values
  ('account.approved',      '{coach}',                      'account', 'Account approved',        'Your account was approved and your academy portal is open.', true, true, null, 10),
  ('camp.opened',           '{coach}',                      'camps',   'Camp open for submissions', 'A district camp in your province opens for player submissions.', true, true, null, 20),
  ('camp.day_assigned',     '{coach}',                      'camps',   'Your camp day',           'The day and time your academy comes to a camp was set or changed.', true, true, null, 21),
  ('camp.reminder',         '{coach}',                      'camps',   'Camp reminder',           'Three days and one day before a camp your players are in.', true, true, null, 22),
  ('invite.final',          '{coach}',                      'camps',   'Invitation to a final',   'One of your players is invited to a province or national final.', true, true, null, 23),
  ('rsvp.deadline',         '{coach}',                      'camps',   'Reply deadline',          'The day before the deadline to answer an invitation.', true, true, null, 24),
  ('decision.published',    '{coach}',                      'players', 'Decision on a player',    'The staff published a decision about one of your players.', true, true, null, 30),
  ('player.status',         '{coach}',                      'players', 'Player status',           'A player moved to the potential pool, a Tony squad, or was released.', true, false, null, 31),
  ('points.earned',         '{coach}',                      'points',  'Points earned',           'Points you earned, once a day.', true, false, '1 day', 40),
  ('level.up',              '{coach}',                      'points',  'New level or badge',      'You reached a new level or earned a badge.', true, true, null, 41),
  ('message.staff',         '{coach}',                      'account', 'Message from Tony staff', 'A personal message from the staff.', true, true, null, 50),
  ('coach.signup',          '{owner,admin}',                'account', 'Coach waiting for approval', 'A coach created an account and waits for approval.', true, false, null, 60),
  ('coach.pending_reminder','{owner,admin}',                'account', 'Coach still waiting',     'A coach has been waiting for approval for more than two days.', true, false, '1 day', 61),
  ('submission.received',   '{owner,admin,staff,scout}',    'camps',   'Players submitted',       'A coach submitted players to a camp in your provinces.', true, false, '1 hour', 70),
  ('rsvp.answered',         '{owner,admin,staff,scout}',    'camps',   'Invitation answered',     'A coach confirmed or declined an invitation to a final.', true, false, '1 hour', 71),
  ('camp.starts_soon',      '{owner,admin,staff,scout}',    'camps',   'Camp in three days',      'A camp in your provinces starts in three days.', true, false, null, 72),
  ('decisions.unpublished', '{owner,admin,staff}',          'camps',   'Decisions not published', 'A camp ended a week ago and decisions are still unpublished.', true, false, '1 day', 73),
  ('sync.error',            '{owner,admin}',                'system',  'Sync problem',            'The SharePoint sync failed twice in a row.', true, true, '6 hours', 80),
  ('document.expiring',     '{owner,admin}',                'players', 'Document expiring',       'A player document expires within 30 days.', true, false, '1 day', 81),
  ('report.filed',          '{owner,admin}',                'staff',   'Staff report filed',      'A staff activity report was filed.', true, false, '1 hour', 82),
  ('digest.weekly',         '{owner,admin,staff,scout,observer,coach}', 'system', 'Weekly digest', 'A summary of the week, every Monday.', false, false, null, 90)
on conflict (code) do update set audience = excluded.audience, category = excluded.category, label = excluded.label, description = excluded.description,
  default_in_app = excluded.default_in_app, default_push = excluded.default_push, group_window = excluded.group_window, sort = excluded.sort;

-- ───────── Preferences ─────────
create table if not exists public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null references public.notification_types(code) on delete cascade,
  in_app boolean not null default true,
  push boolean not null default false,
  email boolean not null default false,
  sms boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);
alter table public.notification_prefs enable row level security;
drop policy if exists notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.project_notification_defaults (
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null references public.notification_types(code) on delete cascade,
  in_app boolean not null default true,
  push boolean not null default false,
  email boolean not null default false,
  sms boolean not null default false,
  primary key (project_id, type)
);
alter table public.project_notification_defaults enable row level security;
drop policy if exists pnd_read on public.project_notification_defaults;
create policy pnd_read on public.project_notification_defaults for select to authenticated using (public.is_active_user());
drop policy if exists pnd_admin on public.project_notification_defaults;
create policy pnd_admin on public.project_notification_defaults for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────── Notifications, outbox, push subscriptions ─────────
alter table public.notifications add column if not exists type text references public.notification_types(code);
alter table public.notifications add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.notifications add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.notifications add column if not exists priority smallint not null default 0;
alter table public.notifications add column if not exists group_key text;
alter table public.notifications add column if not exists count int not null default 1;
alter table public.notifications add column if not exists seen_at timestamptz;
alter table public.notifications add column if not exists expires_at timestamptz;
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_group_idx on public.notifications(user_id, type, group_key) where read_at is null;

create table if not exists public.notification_outbox (
  id bigserial primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('push','email','sms')),
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  attempts int not null default 0,
  last_error text,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notification_outbox_queue on public.notification_outbox(status, send_after) where status = 'queued';
alter table public.notification_outbox enable row level security;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures int not null default 0
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────── Effective preference ─────────
create or replace function public.notification_channels(p_user uuid, p_type text)
returns table (in_app boolean, push boolean, email boolean, sms boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_proj uuid; v_role public.app_role; v_status public.user_status; t public.notification_types; pr public.notification_prefs; d public.project_notification_defaults;
begin
  select project_id, role, status into v_proj, v_role, v_status from public.profiles where id = p_user;
  select * into t from public.notification_types where code = p_type;
  if t.code is null or v_status is distinct from 'active' or not (v_role = any(t.audience)) then
    return query select false, false, false, false; return;
  end if;
  select * into pr from public.notification_prefs where user_id = p_user and type = p_type;
  if pr.user_id is not null then return query select pr.in_app, pr.push, pr.email, pr.sms; return; end if;
  select * into d from public.project_notification_defaults where project_id = v_proj and type = p_type;
  if d.project_id is not null then return query select d.in_app, d.push, d.email, d.sms; return; end if;
  return query select t.default_in_app, t.default_push, t.default_email, t.default_sms;
end $$;

-- ───────── notify(): one entry point for every event ─────────
create or replace function public.notify(p_type text, p_user uuid, p_title text, p_body text, p_link text default null, p_data jsonb default '{}'::jsonb, p_group_key text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare ch record; t public.notification_types; v_id uuid; v_proj uuid; v_existing uuid;
begin
  select * into ch from public.notification_channels(p_user, p_type);
  if not (ch.in_app or ch.push or ch.email or ch.sms) then return null; end if;
  select * into t from public.notification_types where code = p_type;
  select project_id into v_proj from public.profiles where id = p_user;
  -- grouping: a fresh unread notification of the same kind absorbs this one
  if p_group_key is not null and t.group_window is not null then
    select id into v_existing from public.notifications
     where user_id = p_user and type = p_type and group_key = p_group_key and read_at is null and created_at > now() - t.group_window
     order by created_at desc limit 1;
    if v_existing is not null then
      update public.notifications set count = count + 1, body = p_body, data = p_data, created_at = now() where id = v_existing;
      return v_existing;
    end if;
  end if;
  insert into public.notifications(user_id, project_id, type, title, body, link, data, group_key, read_at, seen_at)
  values (p_user, v_proj, p_type, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb), p_group_key,
          case when ch.in_app then null else now() end, case when ch.in_app then null else now() end)
  returning id into v_id;
  if ch.push and exists (select 1 from public.push_subscriptions where user_id = p_user) then
    insert into public.notification_outbox(notification_id, channel) values (v_id, 'push');
  end if;
  if ch.email then insert into public.notification_outbox(notification_id, channel, status) values (v_id, 'email', 'skipped'); end if;
  if ch.sms then insert into public.notification_outbox(notification_id, channel, status) values (v_id, 'sms', 'skipped'); end if;
  return v_id;
end $$;

-- Staff of a project by role, optionally only those whose provinces include p_region (owners and admins always).
create or replace function public.notify_staff(p_type text, p_project uuid, p_region uuid, p_title text, p_body text, p_link text default null, p_data jsonb default '{}'::jsonb, p_group_key text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare t public.notification_types; u record; n int := 0;
begin
  select * into t from public.notification_types where code = p_type;
  for u in select id, role, region_ids from public.profiles
            where project_id = p_project and status = 'active' and role = any(t.audience) and role <> 'coach' loop
    if p_region is null or u.role in ('owner','admin') or u.region_ids = '{}' or p_region = any(u.region_ids) then
      if public.notify(p_type, u.id, p_title, p_body, p_link, p_data, p_group_key) is not null then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $$;

-- All active coaches of the academies in a district, a province, or the project.
create or replace function public.notify_coaches(p_type text, p_project uuid, p_region uuid, p_district uuid, p_title text, p_body text, p_link text default null, p_data jsonb default '{}'::jsonb, p_group_key text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0;
begin
  for u in select pr.id from public.profiles pr join public.academies a on a.id = pr.academy_id left join public.districts d on d.id = a.district_id
            where pr.project_id = p_project and pr.status = 'active' and pr.role = 'coach'
              and (p_district is null or a.district_id = p_district) and (p_region is null or d.region_id = p_region) loop
    if public.notify(p_type, u.id, p_title, p_body, p_link, p_data, p_group_key) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- The old coach notifier now goes through notify()
create or replace function public.notify_academy(p_player uuid, p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
declare u record; v_type text := case when p_link = 'invites' then 'invite.final' else 'decision.published' end;
        v_link text := case when p_link = 'invites' then '/camps' when p_link like 'player:%' then '/squad?player=' || substr(p_link, 8) else p_link end;
begin
  for u in select pr.id from public.players pl join public.profiles pr on pr.academy_id = pl.academy_id and pr.role = 'coach' and pr.status = 'active' where pl.id = p_player loop
    perform public.notify(v_type, u.id, p_title, p_body, v_link, jsonb_build_object('player_id', p_player));
  end loop;
end $$;

do $$ declare f text; begin
  foreach f in array array['notification_channels(uuid,text)','notify(text,uuid,text,text,text,jsonb,text)','notify_staff(text,uuid,uuid,text,text,text,jsonb,text)','notify_coaches(text,uuid,uuid,uuid,text,text,text,jsonb,text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ───────── What the user reads and changes ─────────
create or replace function public.my_notification_prefs() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('type', t.code, 'category', t.category, 'label', t.label, 'description', t.description,
           'in_app', c.in_app, 'push', c.push, 'email', c.email, 'sms', c.sms,
           'custom', exists (select 1 from public.notification_prefs p where p.user_id = auth.uid() and p.type = t.code)) order by t.sort), '[]'::jsonb)
    from public.notification_types t, lateral public.notification_channels(auth.uid(), t.code) c
   where (select role from public.profiles where id = auth.uid()) = any(t.audience)
$$;

create or replace function public.set_notification_pref(p_type text, p_in_app boolean, p_push boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.notification_channels(auth.uid(), p_type);
  insert into public.notification_prefs(user_id, type, in_app, push, email, sms) values (auth.uid(), p_type, p_in_app, p_push, coalesce(c.email, false), coalesce(c.sms, false))
  on conflict (user_id, type) do update set in_app = excluded.in_app, push = excluded.push, updated_at = now();
end $$;

create or replace function public.reset_notification_prefs() returns void
language sql security definer set search_path = public as $$
  delete from public.notification_prefs where user_id = auth.uid()
$$;

create or replace function public.mark_notification_read(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = coalesce(read_at, now()) where id = p_id and user_id = auth.uid()
$$;

create or replace function public.mark_notifications_seen() returns void
language sql security definer set search_path = public as $$
  update public.notifications set seen_at = now() where user_id = auth.uid() and seen_at is null
$$;

-- Admin: project defaults as a matrix
create or replace function public.admin_notification_defaults() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('type', t.code, 'category', t.category, 'label', t.label, 'description', t.description, 'audience', t.audience,
           'in_app', coalesce(d.in_app, t.default_in_app), 'push', coalesce(d.push, t.default_push), 'custom', d.project_id is not null) order by t.sort), '[]'::jsonb)
    from public.notification_types t
    left join public.project_notification_defaults d on d.type = t.code and d.project_id = (select project_id from public.profiles where id = auth.uid())
   where public.is_admin()
$$;
create or replace function public.admin_set_notification_default(p_type text, p_in_app boolean, p_push boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_proj uuid;
begin
  if not public.is_admin() then raise exception 'Only owners and admins can change notification defaults'; end if;
  select project_id into v_proj from public.profiles where id = auth.uid();
  insert into public.project_notification_defaults(project_id, type, in_app, push) values (v_proj, p_type, p_in_app, p_push)
  on conflict (project_id, type) do update set in_app = excluded.in_app, push = excluded.push;
end $$;

do $$ declare f text; begin
  foreach f in array array['my_notification_prefs()','set_notification_pref(text,boolean,boolean)','reset_notification_prefs()','mark_notification_read(uuid)','mark_notifications_seen()','admin_notification_defaults()','admin_set_notification_default(text,boolean,boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ───────── Events ─────────
-- A coach signs up → admins. A coach is approved → the coach.
create or replace function public.profiles_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.role = 'coach' and new.status = 'pending' then
    perform public.notify_staff('coach.signup', new.project_id, null,
      coalesce(new.full_name, new.username) || ' is waiting for approval',
      'A new coach account' || coalesce(' · ' || new.requested_academy, '') || '. Open Users to review it.', '/users', jsonb_build_object('user_id', new.id));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' and new.role = 'coach' then
    perform public.notify('account.approved', new.id, 'Your account is approved', 'Welcome to Tony. Your academy portal is open: add your squad and watch for open camps.', '/', '{}'::jsonb);
  end if;
  return null;
end $$;
drop trigger if exists profiles_notify on public.profiles;
create trigger profiles_notify after insert or update on public.profiles for each row execute function public.profiles_notify();

-- A district camp opens for submissions → the coaches of its province.
create or replace function public.camps_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_region uuid; v_dist text;
begin
  if tg_op = 'UPDATE' and new.submissions_open and not old.submissions_open and new.stage = 'district' and new.status in ('planned','open') then
    select d.region_id, d.name into v_region, v_dist from public.districts d where d.id = new.district_id;
    perform public.notify_coaches('camp.opened', new.project_id, coalesce(new.region_id, v_region), null,
      new.name || ' is open for submissions',
      coalesce(v_dist || ' · ', '') || coalesce(to_char(new.starts_on, 'DD Mon YYYY'), 'date to be confirmed') || coalesce(' · ' || new.venue, '') || '. Submit the players you want the scouts to see.',
      '/camps', jsonb_build_object('camp_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists camps_notify on public.camps;
create trigger camps_notify after update on public.camps for each row execute function public.camps_notify();

-- Coach actions on participations → the staff of the province.
create or replace function public.cp_notify_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.camps; v_region uuid; v_academy text; v_name text;
begin
  select * into c from public.camps where id = new.camp_id;
  v_region := public.camp_region(c.id);
  select a.name, p.first_name || ' ' || p.last_name into v_academy, v_name from public.players p left join public.academies a on a.id = p.academy_id where p.id = new.player_id;
  if tg_op = 'INSERT' and new.status = 'submitted' and new.submitted_by is not null and (select role from public.profiles where id = new.submitted_by) = 'coach' then
    perform public.notify_staff('submission.received', c.project_id, v_region,
      'New players submitted to ' || c.name, coalesce(v_academy, 'An academy') || ' submitted ' || v_name || '. Open the camp sheet to see all submissions.',
      '/scouting/camps/' || c.id, jsonb_build_object('camp_id', c.id), 'camp:' || c.id);
  elsif tg_op = 'UPDATE' and new.status in ('confirmed','declined') and old.status is distinct from new.status and c.stage <> 'district' then
    perform public.notify_staff('rsvp.answered', c.project_id, v_region,
      v_name || case when new.status = 'confirmed' then ' will come to ' else ' cannot come to ' end || c.name,
      coalesce(v_academy, '') || case when new.status = 'declined' and new.absence_reason is not null then ' · reason: ' || new.absence_reason else '' end,
      '/scouting/finals', jsonb_build_object('camp_id', c.id, 'player_id', new.player_id), 'camp:' || c.id);
  end if;
  return null;
end $$;
drop trigger if exists cp_notify_staff on public.camp_participants;
create trigger cp_notify_staff after insert or update on public.camp_participants for each row execute function public.cp_notify_staff();

-- Sync failed twice in a row → admins.
create or replace function public.sync_runs_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev text; v_proj uuid;
begin
  if new.status = 'error' then
    select status into prev from public.sync_runs where id <> new.id and project_id = new.project_id order by started_at desc limit 1;
    if prev = 'error' then
      perform public.notify_staff('sync.error', new.project_id, null, 'SharePoint sync is failing', coalesce(new.error, 'Unknown error') || '. Open Sync Center.', '/sync', '{}'::jsonb, 'sync');
    end if;
  end if;
  return null;
end $$;
drop trigger if exists sync_runs_notify on public.sync_runs;
create trigger sync_runs_notify after update on public.sync_runs for each row execute function public.sync_runs_notify();

-- A staff report filed → admins (not the author).
create or replace function public.staff_activities_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare u record;
begin
  for u in select id from public.profiles where project_id = new.project_id and status = 'active' and role in ('owner','admin') and id is distinct from new.created_by loop
    perform public.notify('report.filed', u.id, 'Staff report: ' || left(new.activity, 60), to_char(new.day, 'DD Mon') || coalesce(' · ' || new.staff, '') || coalesce(' · ' || new.location, ''), '/staff-reports', jsonb_build_object('id', new.id), 'reports');
  end loop;
  return null;
end $$;
drop trigger if exists staff_activities_notify on public.staff_activities;
create trigger staff_activities_notify after insert on public.staff_activities for each row execute function public.staff_activities_notify();

-- ───────── Scheduled reminders (once a day, early morning in the project's time) ─────────
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
      to_char(r.starts_on, 'DD Mon') || coalesce(' · ' || r.venue, '') || '. Check your players and be on time.', '/camps', jsonb_build_object('camp_id', r.camp_id), 'camp:' || r.camp_id || ':' || r.starts_on);
  end loop;
  -- coaches: reply deadline tomorrow
  for r in select distinct pr.id as user_id, c.id as camp_id, c.name, c.rsvp_deadline
             from public.camp_participants cp join public.camps c on c.id = cp.camp_id join public.players p on p.id = cp.player_id
             join public.profiles pr on pr.academy_id = p.academy_id and pr.role = 'coach' and pr.status = 'active'
            where cp.status = 'invited' and c.rsvp_deadline = v_today + 1 loop
    perform public.notify('rsvp.deadline', r.user_id, 'Reply by tomorrow: ' || r.name, 'An invitation to a final still waits for your answer.', '/camps', jsonb_build_object('camp_id', r.camp_id), 'rsvp:' || r.camp_id);
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
revoke execute on function public.notifications_daily() from public, anon, authenticated;

-- 04:00 UTC = 06:00 Kigali
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'tonynext-notifications-daily';
    perform cron.schedule('tonynext-notifications-daily', '0 4 * * *', 'select public.notifications_daily()');
  end if;
end $$;

-- ───────── Push dispatch: pg_cron calls the edge function every minute while there is something queued ─────────
create or replace function public.notify_tick() returns void
language plpgsql security definer set search_path = public as $$
declare v_token text; v_url text;
begin
  if not exists (select 1 from public.notification_outbox where status = 'queued' and channel = 'push' and send_after <= now()) then return; end if;
  select cron_token into v_token from public.sync_state limit 1;
  v_url := 'https://lppabwdwltbcjynwdflz.supabase.co/functions/v1/notify-dispatch';
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', coalesce(v_token, '')), body := '{}'::jsonb, timeout_milliseconds := 25000);
end $$;
revoke execute on function public.notify_tick() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'tonynext-notify-dispatch';
    perform cron.schedule('tonynext-notify-dispatch', '* * * * *', 'select public.notify_tick()');
  end if;
end $$;

-- The dispatcher (service role) takes a batch and reports back.
create or replace function public.outbox_take(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return coalesce((with q as (
      select o.id from public.notification_outbox o where o.status = 'queued' and o.channel = 'push' and o.send_after <= now() order by o.id limit p_limit for update skip locked),
    u as (update public.notification_outbox o set status = 'sending', attempts = attempts + 1 from q where o.id = q.id returning o.id, o.notification_id)
    select jsonb_agg(jsonb_build_object('outbox_id', u.id, 'notification_id', n.id, 'user_id', n.user_id, 'title', n.title, 'body', n.body, 'link', n.link, 'type', n.type,
             'subs', (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) from public.push_subscriptions s where s.user_id = n.user_id)))
      from u join public.notifications n on n.id = u.notification_id), '[]'::jsonb);
end $$;
create or replace function public.outbox_done(p_outbox_id bigint, p_ok boolean, p_error text, p_dead_subs uuid[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.notification_outbox set status = case when p_ok then 'sent' when attempts >= 3 then 'failed' else 'queued' end,
         last_error = p_error, sent_at = case when p_ok then now() end, send_after = now() + interval '5 minutes'
   where id = p_outbox_id;
  if array_length(p_dead_subs, 1) > 0 then delete from public.push_subscriptions where id = any(p_dead_subs); end if;
end $$;
revoke execute on function public.outbox_take(int) from public, anon, authenticated;
revoke execute on function public.outbox_done(bigint, boolean, text, uuid[]) from public, anon, authenticated;
grant execute on function public.outbox_take(int) to service_role;
grant execute on function public.outbox_done(bigint, boolean, text, uuid[]) to service_role;

-- Live updates in the app
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
