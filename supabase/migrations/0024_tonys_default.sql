-- Tony Next · 0024 new projects call their points Tonys (decided 14.10.2026); Rwanda was set the same way.
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
                             'points_name', jsonb_build_object('one', 'Tony', 'many', 'Tonys', 'short', 'Tonys'),
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
