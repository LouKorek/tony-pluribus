-- Tony Next · 0021 global: one database, many countries.
-- Every row belongs to a project; a user works in one project at a time (profiles.project_id) and may be a
-- member of several. Restrictive policies keep each project's data to its own members, on top of the role rules.

-- ───────── Membership ─────────
create table if not exists public.project_members (
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  added_by uuid references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.project_members enable row level security;
drop policy if exists pm_own on public.project_members;
create policy pm_own on public.project_members for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- everyone belongs to the project they are in today
insert into public.project_members(user_id, project_id) select id, project_id from public.profiles where project_id is not null on conflict do nothing;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active' and role = 'owner')
$$;

create or replace function public.my_project() returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.my_projects() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'country', p.country, 'is_active', p.is_active,
                                               'current', p.id = (select project_id from public.profiles where id = auth.uid())) order by p.name), '[]'::jsonb)
    from public.projects p
   where p.id in (select project_id from public.project_members where user_id = auth.uid())
      or public.is_owner()
$$;

create or replace function public.switch_project(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_role public.app_role;
begin
  select role into v_role from public.profiles where id = auth.uid() and status = 'active';
  if v_role is null or v_role = 'coach' then raise exception 'Not allowed'; end if;
  if v_role <> 'owner' and not exists (select 1 from public.project_members where user_id = auth.uid() and project_id = p_project) then raise exception 'You are not a member of that project'; end if;
  if not exists (select 1 from public.projects where id = p_project) then raise exception 'Project not found'; end if;
  insert into public.project_members(user_id, project_id) values (auth.uid(), p_project) on conflict do nothing;
  update public.profiles set project_id = p_project, academy_id = null, region_id = null where id = auth.uid();
end $$;

-- ───────── Isolation: restrictive policies, AND-ed with the role policies ─────────
do $$ declare t text; pred text; begin
  for t, pred in
    select * from (values
      ('seasons',   'project_id = public.my_project()'), ('regions', 'project_id = public.my_project()'), ('districts', 'project_id = public.my_project()'),
      ('academies', 'project_id = public.my_project()'), ('players', 'project_id = public.my_project()'), ('camps', 'project_id = public.my_project()'),
      ('badges', 'project_id = public.my_project()'), ('point_rules', 'project_id = public.my_project()'), ('point_levels', 'project_id = public.my_project()'),
      ('point_events', 'project_id = public.my_project()'), ('coach_reviews', 'project_id = public.my_project()'), ('reward_catalog', 'project_id = public.my_project()'),
      ('activity_events', 'project_id is null or project_id = public.my_project()'), ('notifications', 'project_id is null or project_id = public.my_project()'),
      ('project_notification_defaults', 'project_id = public.my_project()'), ('partners', 'project_id = public.my_project()'), ('finance_accounts', 'project_id = public.my_project()'),
      ('showcases', 'project_id = public.my_project()'), ('staff_activities', 'project_id = public.my_project()'), ('sync_runs', 'project_id = public.my_project()'),
      ('sync_state', 'project_id = public.my_project()'), ('talent_files', 'project_id = public.my_project()'), ('teams', 'project_id = public.my_project()'),
      ('age_groups', 'exists (select 1 from public.seasons s where s.id = season_id and s.project_id = public.my_project())'),
      ('academy_seasons', 'exists (select 1 from public.academies a where a.id = academy_id and a.project_id = public.my_project())'),
      ('academy_sessions', 'exists (select 1 from public.academies a where a.id = academy_id and a.project_id = public.my_project())'),
      ('camp_bookings', 'exists (select 1 from public.academies a where a.id = academy_id and a.project_id = public.my_project())'),
      ('camp_days', 'exists (select 1 from public.camps c where c.id = camp_id and c.project_id = public.my_project())'),
      ('camp_participants', 'exists (select 1 from public.camps c where c.id = camp_id and c.project_id = public.my_project())'),
      ('player_log', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('academy_session_players', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('attendance', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('measurements', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('player_documents', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('player_moves', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('showcase_players', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('match_players', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('team_players', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('evaluations', 'exists (select 1 from public.players p where p.id = player_id and p.project_id = public.my_project())'),
      ('matches', 'exists (select 1 from public.teams t where t.id = team_id and t.project_id = public.my_project())'),
      ('team_days', 'exists (select 1 from public.teams t where t.id = team_id and t.project_id = public.my_project())'),
      ('training_sessions', 'exists (select 1 from public.teams t where t.id = team_id and t.project_id = public.my_project())'),
      ('finance_tx', 'exists (select 1 from public.finance_accounts f where f.id = account_id and f.project_id = public.my_project())'),
      ('partner_contacts', 'exists (select 1 from public.partners x where x.id = partner_id and x.project_id = public.my_project())'),
      ('partner_notes', 'exists (select 1 from public.partners x where x.id = partner_id and x.project_id = public.my_project())')
    ) v(t, pred)
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_project', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (%s) with check (%s)', t || '_project', t, pred, pred);
  end loop;
end $$;

-- profiles: staff see the people of their own project (and themselves); admins of one project cannot list another's users
drop policy if exists profiles_project on public.profiles;
create policy profiles_project on public.profiles as restrictive for all to authenticated
  using (id = auth.uid() or project_id = public.my_project() or public.is_owner())
  with check (id = auth.uid() or project_id = public.my_project() or public.is_owner());
-- projects: the ones you belong to
drop policy if exists projects_member on public.projects;
create policy projects_member on public.projects as restrictive for all to authenticated
  using (id = public.my_project() or id in (select project_id from public.project_members where user_id = auth.uid()) or public.is_owner())
  with check (public.is_admin());

-- staff lists of users are project-scoped already by the policy above; the join link info stays public per slug.

-- ───────── Creating a project ─────────
create or replace function public.admin_create_project(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slug text; v_season uuid; v_label text; v_org uuid;
begin
  if (select role from public.profiles where id = auth.uid() and status = 'active') <> 'owner' then raise exception 'Only an owner can create a project'; end if;
  v_slug := lower(regexp_replace(coalesce(nullif(trim(p->>'slug'), ''), p->>'name'), '[^a-z0-9]+', '-', 'gi'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' or nullif(trim(p->>'name'), '') is null then raise exception 'Give the project a name'; end if;
  if exists (select 1 from public.projects where slug = v_slug) then raise exception 'A project with this slug exists already'; end if;
  select org_id into v_org from public.profiles where id = auth.uid();
  insert into public.projects(org_id, name, slug, country, timezone, partner, settings)
  values (v_org, trim(p->>'name'), v_slug, nullif(trim(p->>'country'), ''), coalesce(nullif(trim(p->>'timezone'), ''), 'UTC'), nullif(trim(p->'partner'->>'name'), ''),
          jsonb_build_object('tagline', coalesce(nullif(trim(p->>'tagline'), ''), 'The global stars of tomorrow'),
                             'currency', coalesce(nullif(trim(p->>'currency'), ''), 'USD'),
                             'geo_labels', jsonb_build_object('region', coalesce(nullif(trim(p->'geo_labels'->>'region'), ''), 'Province'), 'district', coalesce(nullif(trim(p->'geo_labels'->>'district'), ''), 'District')),
                             'languages', coalesce(p->'languages', '["en"]'::jsonb),
                             'partner', case when nullif(trim(p->'partner'->>'name'), '') is null then null else jsonb_build_object('name', trim(p->'partner'->>'name'), 'logo', nullif(trim(p->'partner'->>'logo'), ''), 'show_in', coalesce(p->'partner'->'show_in', '["certificates","exports","share"]'::jsonb)) end))
  returning id into v_id;
  v_label := coalesce(nullif(trim(p->>'season'), ''), to_char(current_date, 'YYYY') || '-' || to_char(current_date + interval '1 year', 'YYYY'));
  insert into public.seasons(project_id, label, starts_on, ends_on, is_current_scouting, is_current_operational)
  values (v_id, v_label, nullif(p->>'season_start', '')::date, nullif(p->>'season_end', '')::date, true, true) returning id into v_season;
  insert into public.age_groups(season_id, code, birth_year_from, birth_year_to, sort)
  select v_season, x->>'code', (x->>'from')::int, (x->>'to')::int, ord from jsonb_array_elements(coalesce(p->'age_groups', '[]'::jsonb)) with ordinality a(x, ord);
  insert into public.project_members(user_id, project_id, added_by) values (auth.uid(), v_id, auth.uid()) on conflict do nothing;
  return v_id;
end $$;

-- "Province name: District, District, District" per line
create or replace function public.admin_import_geo(p_project uuid, p_text text) returns int
language plpgsql security definer set search_path = public as $$
declare line text; v_region text; v_dists text; d text; v_rid uuid; n int := 0; i int := 0;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if p_project <> public.my_project() and not public.is_owner() then raise exception 'Not your project'; end if;
  foreach line in array string_to_array(coalesce(p_text, ''), E'\n') loop
    line := trim(line);
    if line = '' then continue; end if;
    v_region := trim(split_part(line, ':', 1)); v_dists := trim(substr(line, length(split_part(line, ':', 1)) + 2));
    if v_region = '' then continue; end if;
    i := i + 1;
    select id into v_rid from public.regions where project_id = p_project and lower(name) = lower(v_region);
    if v_rid is null then insert into public.regions(project_id, name, sort) values (p_project, v_region, i) returning id into v_rid; end if;
    foreach d in array string_to_array(v_dists, ',') loop
      d := trim(d);
      if d = '' then continue; end if;
      insert into public.districts(project_id, region_id, name) select p_project, v_rid, d where not exists (select 1 from public.districts where project_id = p_project and lower(name) = lower(d));
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- ───────── Portal strings per project and language ─────────
create table if not exists public.portal_strings (
  project_id uuid not null references public.projects(id) on delete cascade,
  lang text not null,
  key text not null,
  text text not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, lang, key)
);
alter table public.portal_strings enable row level security;
drop policy if exists portal_strings_read on public.portal_strings;
create policy portal_strings_read on public.portal_strings for select to authenticated using (project_id = public.my_project());
drop policy if exists portal_strings_admin on public.portal_strings;
create policy portal_strings_admin on public.portal_strings for all to authenticated using (public.is_admin() and project_id = public.my_project()) with check (public.is_admin() and project_id = public.my_project());

create or replace function public.portal_strings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(lang, strings), '{}'::jsonb)
    from (select lang, jsonb_object_agg(key, text) as strings from public.portal_strings where project_id = public.my_project() group by lang) x
$$;

do $$ declare f text; begin
  foreach f in array array['is_owner()','my_project()','my_projects()','switch_project(uuid)','admin_create_project(jsonb)','admin_import_geo(uuid,text)','portal_strings()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Rwanda keeps its words
update public.projects set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('currency', 'RWF', 'languages', '["en","rw"]'::jsonb, 'geo_labels', jsonb_build_object('region', 'Province', 'district', 'District'))
 where slug = 'tony-rwanda' and not (settings ? 'currency');
