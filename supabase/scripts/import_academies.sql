-- One-off: import academy lists from the Talent folder ("ACADEMIES FOR SCOUTING <season>.xlsx").
-- Created with a one-time token, called once from the SharePoint tab, then dropped.
-- Row shape: [province, district, name, contact, date, scouted, selected, obs, rating, status]

create or replace function public.tmp_import_academies(p_token text, p_season text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_proj uuid; v_season uuid; v_lbl text; v_dist uuid; v_ac uuid;
  v_name text; v_dname text; v_contact text; v_phone text; v_cname text;
  v_date date; v_sw date; v_from date; v_to date;
  n_new int := 0; n_rows int := 0; unmatched text[] := '{}';
begin
  if p_token is distinct from '<one-time token>' then raise exception 'not allowed'; end if;
  select id into v_proj from public.projects where slug = 'tony-rwanda';
  select id, label into v_season, v_lbl from public.seasons where project_id = v_proj and label = p_season;
  v_from := make_date(left(v_lbl,4)::int, 10, 1);
  v_to   := make_date(right(v_lbl,4)::int, 6, 30);
  for r in select value from jsonb_array_elements(p_rows) loop
    v_name := regexp_replace(trim(coalesce(r->>2,'')), '\s+', ' ', 'g');
    continue when v_name = '' or upper(v_name) in ('NAME','ACADEMY');
    v_dname := upper(trim(coalesce(r->>1,'')));
    v_dname := case v_dname when 'NIHABIHU' then 'NYABIHU' when 'RUBAVO' then 'RUBAVU' else v_dname end;
    v_dist := null;
    select id into v_dist from public.districts where project_id = v_proj and upper(name) = v_dname;
    if v_dist is null and v_dname <> '' then unmatched := array_append(unmatched, v_dname); end if;

    v_contact := trim(coalesce(r->>3,''));
    v_phone := replace(substring(replace(v_contact,'O','0') from '(\d[\d ]{6,}\d)'), ' ', '');
    if v_phone ~ '^7\d{8}$' then v_phone := '0' || v_phone; end if;
    v_cname := nullif(trim(regexp_replace(regexp_replace(v_contact, '[0-9O]?[0-9][0-9 ]{5,}[0-9]', ' ', 'g'), '[/,:]|\s+', ' ', 'g')), '');

    v_date := null;
    if r->>4 ~ '^\d{4}-\d{2}-\d{2}$' then
      v_date := (r->>4)::date;
      if v_date not between v_from and v_to then
        begin
          v_sw := make_date(extract(year from v_date)::int, extract(day from v_date)::int, extract(month from v_date)::int);
        exception when others then v_sw := null; end;
        v_date := case when v_sw between v_from and v_to then v_sw else null end;
      end if;
    end if;

    select id into v_ac from public.academies
     where project_id = v_proj and coalesce(district_id,'00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_dist,'00000000-0000-0000-0000-000000000000'::uuid)
       and upper(name) = upper(v_name);
    if v_ac is null then
      insert into public.academies(project_id, district_id, name, contact_name, contact_phone, is_active)
      values (v_proj, v_dist, upper(v_name), v_cname, v_phone, not (coalesce(r->>7,'') ~* 'no longer exist'))
      returning id into v_ac;
      n_new := n_new + 1;
    else
      update public.academies set contact_phone = coalesce(contact_phone, v_phone), contact_name = coalesce(contact_name, v_cname) where id = v_ac;
    end if;

    insert into public.academy_seasons(academy_id, season_id, visit_date, scouted, selected, obs, rating, status, source)
    values (v_ac, v_season, v_date,
            case when r->>5 ~ '^\d+$' then (r->>5)::int end,
            case when r->>6 ~ '^\d+$' then (r->>6)::int end,
            nullif(r->>7,''), nullif(r->>8,''), nullif(r->>9,''), 'import')
    on conflict (academy_id, season_id) do update
      set visit_date = coalesce(excluded.visit_date, academy_seasons.visit_date),
          scouted = coalesce(excluded.scouted, academy_seasons.scouted),
          selected = coalesce(excluded.selected, academy_seasons.selected),
          obs = coalesce(excluded.obs, academy_seasons.obs),
          rating = coalesce(excluded.rating, academy_seasons.rating),
          status = coalesce(excluded.status, academy_seasons.status);
    n_rows := n_rows + 1;
  end loop;
  return jsonb_build_object('rows', n_rows, 'new_academies', n_new, 'unmatched_districts', (select jsonb_agg(distinct u) from unnest(unmatched) u));
end $$;
grant execute on function public.tmp_import_academies(text, text, jsonb) to anon;

-- Season mapping: the scouting folder inside "Season X" scouts FOR the following season.
-- Rows imported from "Season 2025-2026/Scouting" belong to season 2026-2027, and so on:
-- update public.academy_seasons set season_id = <next season> where season_id = <folder season>;
drop function if exists public.tmp_import_academies(text, text, jsonb);
