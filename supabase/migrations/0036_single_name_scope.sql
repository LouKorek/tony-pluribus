-- Tony Next · 0036 a single given name ("Prince") only matches inside its own team; across teams it would mix two children.
create or replace function public.talent_match_player(p_project uuid, p_raw text, p_team uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare n record; v_id uuid; v_first text; v_last text; parts text[]; k text;
begin
  select * into n from public.talent_parse_name(p_raw);
  if n.o_name is null or n.o_name = '' then return null; end if;
  k := public.talent_norm(n.o_name);
  if k is null or k = '' then return null; end if;
  parts := regexp_split_to_array(n.o_name, '\s+');
  if p_team is not null then
    select p.id into v_id from public.team_players tp join public.players p on p.id = tp.player_id
     where tp.team_id = p_team and p.merged_into is null and p.name_key = k limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  if array_length(parts, 1) > 1 then
    select p.id into v_id from public.players p
     where p.project_id = p_project and p.merged_into is null and p.name_key = k
       and (n.o_year is null or p.birth_year is null or p.birth_year = n.o_year)
     order by (p.pool_status = 'tony_squad') desc, (p.source = 'import') desc, p.created_at desc limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  if array_length(parts, 1) = 1 then
    v_first := initcap(parts[1]); v_last := '';
  else
    v_last := initcap(parts[1]); v_first := initcap(array_to_string(parts[2:], ' '));
  end if;
  perform set_config('pluribus.system', 'on', true);
  insert into public.players(project_id, first_name, last_name, birth_year, positions, source, pool_status, staff_notes)
  values (p_project, v_first, v_last, n.o_year, n.o_pos, 'import', 'tony_squad', 'Added from the Tony team files in the Talent folder')
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.talent_match_player(uuid,text,uuid) from public, anon, authenticated;
-- the 2024-25 teams are read again so that each team keeps its own children
delete from public.team_players tp using public.teams t, public.seasons s where t.id = tp.team_id and s.id = t.season_id and s.label = '2024-2025';
update public.talent_content c set parsed_modified_at = null, attempts = 0, error = null from public.talent_files f where f.id = c.file_id and f.path like 'Season 2024-2025/%';
