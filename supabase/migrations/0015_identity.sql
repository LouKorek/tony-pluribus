-- Tony Next · 0015 identity: project settings (partner, tagline, languages), invite links, project join links.

-- ───────── Project settings ─────────
alter table public.projects add column if not exists settings jsonb not null default '{}'::jsonb;

update public.projects set settings = settings || jsonb_build_object(
  'tagline', 'Rwandan Youth Football Talents',
  'partner', jsonb_build_object('name', 'SL Benfica', 'logo', '/brand/benfica.png', 'show_in', jsonb_build_array('certificates', 'exports', 'share')),
  'languages', jsonb_build_array('en', 'rw'),
  'currency', 'RWF',
  'geo_labels', jsonb_build_object('region', 'Province', 'district', 'District'))
where slug = 'tony-rwanda' and not (settings ? 'partner');

-- ───────── Invite links ─────────
alter table public.profiles add column if not exists invite_token text unique;
alter table public.profiles add column if not exists invite_expires_at timestamptz;
alter table public.profiles add column if not exists invite_accepted_at timestamptz;
alter table public.profiles add column if not exists invited_by uuid references public.profiles(id);

-- A user created without a password cannot sign in until the invite is accepted.
drop function if exists public.admin_create_user(text, text, text, public.app_role, text, uuid, uuid);
create or replace function public.admin_create_user(
  p_username text, p_password text, p_full_name text, p_role public.app_role,
  p_phone text default null, p_academy_id uuid default null, p_region_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_id uuid := gen_random_uuid(); v_email text; v_pw text;
begin
  if not public.is_admin() then raise exception 'Only owners and admins can create users'; end if;
  if p_role = 'owner' and public.current_role_name() <> 'owner' then raise exception 'Only the owner can create another owner'; end if;
  p_username := lower(trim(p_username));
  if p_username !~ '^[a-z0-9._-]{3,32}$' then raise exception 'Username must be 3-32 letters, digits, dots, dashes or underscores'; end if;
  if p_password is not null and length(p_password) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if exists (select 1 from public.profiles where username = p_username) then raise exception 'Username already taken'; end if;
  if p_role = 'coach' and p_academy_id is null then raise exception 'A coach must be linked to an academy'; end if;
  v_email := p_username || '@users.pluribus.app';
  v_pw := coalesce(p_password, encode(gen_random_bytes(32), 'hex'));
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          crypt(v_pw, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('username', p_username, 'full_name', p_full_name, 'phone', p_phone),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());
  update public.profiles
     set role = p_role, status = 'active', academy_id = p_academy_id, region_id = p_region_id,
         approved_by = auth.uid(), approved_at = now(), invited_by = auth.uid()
   where id = v_id;
  return v_id;
end $$;
revoke execute on function public.admin_create_user(text,text,text,public.app_role,text,uuid,uuid) from public, anon;
grant execute on function public.admin_create_user(text,text,text,public.app_role,text,uuid,uuid) to authenticated;

-- A fresh invite link for a user: new users set their first password with it, existing users reset theirs.
create or replace function public.admin_issue_invite(p_user uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text; v_role public.app_role;
begin
  if not public.is_admin() then raise exception 'Only owners and admins can send invites'; end if;
  select role into v_role from public.profiles where id = p_user;
  if v_role is null then raise exception 'User not found'; end if;
  if v_role = 'owner' and public.current_role_name() <> 'owner' then raise exception 'Only the owner can reset an owner'; end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  update public.profiles set invite_token = v_token, invite_expires_at = now() + interval '7 days', invite_accepted_at = null, invited_by = auth.uid()
   where id = p_user;
  return v_token;
end $$;
revoke execute on function public.admin_issue_invite(uuid) from public, anon;
grant execute on function public.admin_issue_invite(uuid) to authenticated;

-- What the welcome page shows before the password is set (no sign-in yet).
create or replace function public.invite_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; pr public.projects; a text;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into p from public.profiles where invite_token = p_token;
  if p.id is null then return null; end if;
  select * into pr from public.projects where id = p.project_id;
  select name into a from public.academies where id = p.academy_id;
  return jsonb_build_object('full_name', p.full_name, 'username', p.username, 'role', p.role, 'status', p.status,
    'project', pr.name, 'tagline', pr.settings->>'tagline', 'academy', a,
    'expired', p.invite_expires_at < now(), 'expires_at', p.invite_expires_at);
end $$;
grant execute on function public.invite_info(text) to anon, authenticated;

-- The user sets the password; the link is spent.
create or replace function public.accept_invite(p_token text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare p public.profiles;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'This link is not valid'; end if;
  select * into p from public.profiles where invite_token = p_token;
  if p.id is null then raise exception 'This link is not valid'; end if;
  if p.invite_expires_at < now() then raise exception 'This link has expired. Ask your admin for a new one.'; end if;
  if p.status = 'locked' then raise exception 'This account is locked'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = p.id;
  delete from auth.refresh_tokens where user_id = p.id::text;
  update public.profiles set invite_token = null, invite_accepted_at = now() where id = p.id;
  return jsonb_build_object('username', p.username);
end $$;
grant execute on function public.accept_invite(text, text) to anon, authenticated;

-- ───────── Join link per project (coach self sign-up) ─────────
create or replace function public.project_join_info(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr public.projects;
begin
  select * into pr from public.projects where slug = p_slug and is_active;
  if pr.id is null then return null; end if;
  return jsonb_build_object('id', pr.id, 'name', pr.name, 'country', pr.country, 'tagline', pr.settings->>'tagline', 'languages', pr.settings->'languages',
    'geo_labels', pr.settings->'geo_labels',
    'academies', coalesce((select jsonb_agg(jsonb_build_object('academy_id', a.id, 'academy', a.name, 'district', d.name, 'region', r.name) order by r.sort, d.name, a.name)
                             from public.academies a left join public.districts d on d.id = a.district_id left join public.regions r on r.id = d.region_id
                            where a.project_id = pr.id and a.is_active), '[]'::jsonb));
end $$;
grant execute on function public.project_join_info(text) to anon, authenticated;

-- New sign-ups land in the project of the join link they used (the first project otherwise).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_username text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)));
  v_org uuid; v_proj uuid;
  v_is_owner boolean;
begin
  v_proj := nullif(new.raw_user_meta_data->>'project_id', '')::uuid;
  if v_proj is null then select id into v_proj from public.projects order by created_at limit 1; end if;
  select org_id into v_org from public.projects where id = v_proj;
  v_is_owner := v_username = 'loukorek' and not exists (select 1 from public.profiles where role = 'owner');
  insert into public.profiles(id, username, full_name, phone, role, status, org_id, project_id, academy_id, requested_academy)
  values (new.id, v_username,
          nullif(new.raw_user_meta_data->>'full_name',''),
          nullif(new.raw_user_meta_data->>'phone',''),
          case when v_is_owner then 'owner'::public.app_role else 'coach'::public.app_role end,
          case when v_is_owner then 'active'::public.user_status else 'pending'::public.user_status end,
          v_org, v_proj,
          nullif(new.raw_user_meta_data->>'academy_id','')::uuid,
          nullif(new.raw_user_meta_data->>'requested_academy',''));
  return new;
end $$;

-- ───────── Shared pages carry the project and its partner (when the project shows it there) ─────────
create or replace function public.showcase_view(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.showcases; pr public.projects; partner jsonb;
begin
  select * into s from public.showcases where token = p_token and active and (expires_on is null or expires_on >= current_date);
  if s.id is null then return null; end if;
  update public.showcases set views = views + 1 where id = s.id;
  select * into pr from public.projects where id = s.project_id;
  partner := case when pr.settings->'partner'->'show_in' ? 'share' then jsonb_build_object('name', pr.settings->'partner'->>'name', 'logo', pr.settings->'partner'->>'logo') end;
  return jsonb_build_object('title', s.title, 'intro', s.intro, 'audience', s.audience,
    'project', jsonb_build_object('name', pr.name, 'tagline', pr.settings->>'tagline', 'partner', partner),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.first_name || case when p.last_name <> '—' then ' ' || upper(p.last_name) else '' end,
      'birth_year', p.birth_year, 'foot', p.preferred_foot, 'positions', coalesce(p.positions, (select tp.position from public.team_players tp where tp.player_id = p.id order by tp.created_at desc limit 1)),
      'team', (select t.name || ' · ' || se.label from public.team_players tp join public.teams t on t.id = tp.team_id join public.seasons se on se.id = t.season_id where tp.player_id = p.id order by se.label desc limit 1),
      'note', sp.note,
      'stats', case when s.show_stats then (select jsonb_build_object('matches', count(*), 'goals', coalesce(sum(goals), 0), 'assists', coalesce(sum(assists), 0)) from public.match_players mp where mp.player_id = p.id) end,
      'tests', case when s.show_tests then (select jsonb_object_agg(metric, value) from (select distinct on (metric) metric, value from public.measurements m where m.player_id = p.id and metric in ('sprint_10m','sprint_20m','height_cm','weight_kg') order by metric, taken_on desc nulls last) x) end
    ) order by sp.sort, p.last_name) from public.showcase_players sp join public.players p on p.id = sp.player_id where sp.showcase_id = s.id), '[]'::jsonb));
end $$;

-- ───────── Wording: the programme is Tony ─────────
create or replace function public.coach_remove_player(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ctx record;
begin
  select * into ctx from public.coach_ctx();
  if not exists (select 1 from public.players where id = p_id and academy_id = ctx.v_academy) then raise exception 'Player not found in your squad'; end if;
  if exists (select 1 from public.camp_participants where player_id = p_id and status <> 'removed') then
    raise exception 'This player has already been to a Tony camp and stays on record. Ask Tony staff if he left your academy.';
  end if;
  delete from public.players where id = p_id;
end $$;
