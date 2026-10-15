-- Tony Next · 0031 content sync: the files are the truth for squads and matches.
-- · a team's squad is exactly the players in its Presence Control file (a membership that is not in the file is removed)
-- · a competition's matches are exactly the columns of its Match Control file plus the match reports; the name of the
--   competition is read from any folder under Matches ("Match Report/Friendly Matches", "U14 TDS", "3rd Division/1 - League Stage")
-- · finance sheets are keyed by their trimmed name (a sheet "APR 25 " and "APR 25" are the same sheet)

create or replace function public.talent_competition(p_path text) returns text
language plpgsql immutable as $$
declare seg text; rest text;
begin
  rest := substring(p_path from '/Matches/(.*)$');
  if rest is null then return 'Friendly'; end if;
  foreach seg in array string_to_array(rest, '/') loop
    if seg ~* 'friendly' then return 'Friendly'; end if;
    if seg ~* 'tds' then return 'TDS'; end if;
    if seg ~* '\m\d(st|nd|rd|th) division' then return lower(substring(seg from '(?i)(\d(?:st|nd|rd|th))')) || ' Division'; end if;
    if seg ~* '\mU-?\d{2}\M.*league' then return upper(regexp_replace(substring(seg from '(?i)(U-?\d{2})'), '-', '')) || ' League'; end if;
    if seg ~* 'league' and seg !~ '^\d+\s*-' then return trim(seg); end if;
    if seg ~* 'cup' and seg !~ '^\d+\s*-' then return trim(seg); end if;
  end loop;
  return 'Friendly';
end $$;

-- new players from the files are written Surname / Given names in title case
create or replace function public.talent_match_player(p_project uuid, p_raw text, p_team uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare n record; v_id uuid; v_first text; v_last text; parts text[]; k text;
begin
  select * into n from public.talent_parse_name(p_raw);
  if n.o_name is null or n.o_name = '' then return null; end if;
  k := public.talent_norm(n.o_name);
  if k is null or k = '' then return null; end if;
  if p_team is not null then
    select p.id into v_id from public.team_players tp join public.players p on p.id = tp.player_id
     where tp.team_id = p_team and p.merged_into is null and p.name_key = k limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  select p.id into v_id from public.players p
   where p.project_id = p_project and p.merged_into is null and p.name_key = k
     and (n.o_year is null or p.birth_year is null or p.birth_year = n.o_year)
   order by (p.pool_status = 'tony_squad') desc, (p.source = 'import') desc, p.created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  parts := regexp_split_to_array(n.o_name, '\s+');
  v_last := initcap(parts[1]); v_first := initcap(coalesce(nullif(array_to_string(parts[2:], ' '), ''), parts[1]));
  perform set_config('pluribus.system', 'on', true);
  insert into public.players(project_id, first_name, last_name, birth_year, positions, source, pool_status, staff_notes)
  values (p_project, v_first, v_last, n.o_year, n.o_pos, 'import', 'tony_squad', 'Added from the Tony team files in the Talent folder')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.talent_apply_presence(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare m jsonb; d jsonb; r jsonb; c jsonb; v_month text; v_from date; v_to date; day_ids uuid[]; pid uuid; roster uuid[] := '{}'; n int := 0; nm record; v_day uuid; v_code text; v_min int;
begin
  if p_team is null then return 0; end if;
  perform set_config('pluribus.system', 'on', true);
  for m in select * from jsonb_array_elements(coalesce(p->'months', '[]'::jsonb)) loop
    v_month := m->>'month';
    v_from := (v_month || '-01')::date; v_to := (v_from + interval '1 month')::date;
    delete from public.team_days where team_id = p_team and day >= v_from and day < v_to;
    day_ids := '{}';
    for d in select * from jsonb_array_elements(coalesce(m->'days', '[]'::jsonb)) loop
      insert into public.team_days(team_id, day, seq, kind, label) values (p_team, (d->>'day')::date, coalesce((d->>'seq')::int, 1), coalesce(nullif(d->>'kind',''), 'training'), nullif(d->>'label',''))
      on conflict (team_id, day, seq) do update set kind = excluded.kind, label = excluded.label returning id into v_day;
      day_ids := array_append(day_ids, v_day);
    end loop;
    for r in select * from jsonb_array_elements(coalesce(m->'rows', '[]'::jsonb)) loop
      pid := public.talent_match_player(p_project, r->>'name', p_team);
      if pid is null then continue; end if;
      roster := array_append(roster, pid);
      select * into nm from public.talent_parse_name(r->>'name');
      insert into public.team_players(team_id, player_id, position, status) values (p_team, pid, nm.o_pos, 'active')
      on conflict (team_id, player_id) do update set position = coalesce(excluded.position, team_players.position), status = case when team_players.status = 'left' then 'active' else team_players.status end, left_on = null;
      for c in select * from jsonb_array_elements(coalesce(r->'cells', '[]'::jsonb)) loop
        v_day := day_ids[(c->>'d')::int + 1];
        if v_day is null then continue; end if;
        v_code := nullif(trim(c->>'v'), '');
        v_min := case when v_code ~ '^\d+$' then v_code::int else null end;
        insert into public.attendance(day_id, player_id, minutes, code) values (v_day, pid, v_min, case when v_min is null then v_code end)
        on conflict (day_id, player_id) do update set minutes = excluded.minutes, code = excluded.code;
        n := n + 1;
      end loop;
    end loop;
  end loop;
  -- the squad is exactly who is in the file
  if cardinality(roster) > 0 then
    delete from public.team_players where team_id = p_team and not (player_id = any(roster));
    update public.players set pool_status = 'tony_squad' where id = any(roster) and pool_status <> 'tony_squad';
  end if;
  return n;
end $$;

create or replace function public.talent_apply_matchstats(p_project uuid, p_team uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare m jsonb; r jsonb; s jsonb; ids uuid[] := '{}'; mid uuid; pid uuid; n int := 0; v_comp text;
begin
  if p_team is null then return 0; end if;
  v_comp := coalesce(nullif(p->>'competition',''), 'Friendly');
  for m in select * from jsonb_array_elements(coalesce(p->'matches', '[]'::jsonb)) loop
    mid := null;
    if nullif(m->>'number','') is not null then
      select id into mid from public.matches where team_id = p_team and number = (m->>'number')::int and competition = v_comp and not (id = any(ids)) limit 1;
    end if;
    if mid is null and nullif(m->>'date','') is not null then
      select id into mid from public.matches where team_id = p_team and played_on = (m->>'date')::date and competition = v_comp and not (id = any(ids)) order by (opponent = coalesce(m->>'opponent', opponent)) desc limit 1;
    end if;
    if mid is null then
      insert into public.matches(team_id, number, played_on, competition, opponent) values (p_team, nullif(m->>'number','')::int, nullif(m->>'date','')::date, v_comp, coalesce(nullif(m->>'opponent',''), 'Match ' || coalesce(m->>'number', m->>'date', '')))
      returning id into mid;
    else
      update public.matches set number = coalesce(number, nullif(m->>'number','')::int), played_on = coalesce(played_on, nullif(m->>'date','')::date),
             opponent = case when (opponent like 'Match %' or opponent is null) and nullif(m->>'opponent','') is not null then m->>'opponent' else opponent end where id = mid;
    end if;
    if nullif(m->>'goals_for','') is not null then update public.matches set goals_for = (m->>'goals_for')::int, goals_against = nullif(m->>'goals_against','')::int where id = mid; end if;
    ids := array_append(ids, mid);
  end loop;
  -- the competition's matches are the file's columns plus the reports: anything else came from an older reading
  if jsonb_array_length(coalesce(p->'matches', '[]'::jsonb)) > 0 then
    delete from public.matches where team_id = p_team and competition = v_comp and report_file_id is null and not (id = any(ids));
  end if;
  delete from public.match_players where match_id = any(ids);
  for r in select * from jsonb_array_elements(coalesce(p->'rows', '[]'::jsonb)) loop
    pid := public.talent_match_player(p_project, r->>'name', p_team);
    if pid is null then continue; end if;
    for s in select * from jsonb_array_elements(coalesce(r->'stats', '[]'::jsonb)) loop
      mid := ids[(s->>'m')::int + 1];
      if mid is null then continue; end if;
      insert into public.match_players(match_id, player_id, goals, assists, yellow, red)
      values (mid, pid, coalesce((s->>'goals')::int, 0), coalesce((s->>'assists')::int, 0), coalesce((s->>'yc')::int, 0), coalesce((s->>'rc')::int, 0))
      on conflict (match_id, player_id) do update set goals = excluded.goals, assists = excluded.assists, yellow = excluded.yellow, red = excluded.red;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.talent_apply_finance(p_project uuid, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare s jsonb; v_acc uuid; v_src text; n int := 0; k int;
begin
  insert into public.finance_accounts(project_id, name, kind, holder)
  values (p_project, p->>'account', case when p->>'account' = 'TRW MoMo' then 'mobile' else 'cash' end, case when p->>'account' in ('Andre','Fabio') then p->>'account' end)
  on conflict (project_id, name) do nothing;
  select id into v_acc from public.finance_accounts where project_id = p_project and name = p->>'account';
  for s in select * from jsonb_array_elements(coalesce(p->'sheets', '[]'::jsonb)) loop
    v_src := (p->>'file') || ' / ' || trim(s->>'name');
    delete from public.finance_tx where account_id = v_acc and (source = v_src or trim(source) = v_src);
    insert into public.finance_tx(account_id, day, amount_out, amount_in, description, type, subtype, payee, invoice_ref, balance, source, file_id)
    select v_acc, (e->>'date')::date, coalesce(nullif(e->>'out','')::numeric, 0), coalesce(nullif(e->>'in','')::numeric, 0), nullif(e->>'description',''), nullif(e->>'type',''),
           nullif(e->>'subtype',''), nullif(e->>'payee',''), nullif(e->>'invoice',''), nullif(e->>'balance','')::numeric, v_src,
           (select f.id from public.talent_files f where f.project_id = p_project and f.path like 'Reports/Finance Momo/%' and not f.is_folder and nullif(e->>'invoice','') is not null
              and lower(f.name) like lower(left(e->>'invoice', 40)) || '%' limit 1)
      from jsonb_array_elements(coalesce(s->'rows', '[]'::jsonb)) e where nullif(e->>'date','') is not null;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;

revoke execute on function public.talent_match_player(uuid,text,uuid), public.talent_apply_presence(uuid,uuid,jsonb), public.talent_apply_matchstats(uuid,uuid,jsonb), public.talent_apply_finance(uuid,jsonb) from public, anon, authenticated;

-- ───────── one-time clean-up of what the first readings and the one-off import left behind ─────────
-- finance: every ledger row comes from a file; the files are read again
delete from public.finance_tx;
-- matches with the wrong competition name, or created without a report by the first reading: read again
delete from public.matches where competition in ('Match Report', 'Friendly Matches') or (report_file_id is null and created_at >= '2026-10-15');
update public.matches set competition = public.talent_competition(f.path) from public.talent_files f where f.id = matches.report_file_id and competition <> public.talent_competition(f.path);
-- read the presence, stats and finance workbooks again with the new rules
update public.talent_content set parsed_modified_at = null, attempts = 0, error = null where kind in ('presence', 'matchstats', 'finance');
