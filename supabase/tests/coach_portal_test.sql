-- Pluribus · coach portal test. Runs as one transaction and always rolls back (ends with an exception carrying TESTRESULT).
do $$
declare
  r jsonb := '{}'; v_acad uuid; v_dist uuid; v_reg uuid; v_proj uuid; v_season uuid; v_coach uuid := gen_random_uuid();
  v_other uuid; v_camp uuid; v_final uuid; v_p1 uuid; v_p2 uuid; v_foreign uuid; v_cp uuid; n int; j jsonb; v_owner uuid;
begin
  select a.id, a.district_id, d.region_id, a.project_id into v_acad, v_dist, v_reg, v_proj
    from public.academies a join public.districts d on d.id = a.district_id order by a.name limit 1;
  select a.id into v_other from public.academies a where a.id <> v_acad and a.district_id is not null limit 1;
  select id into v_owner from public.profiles where role = 'owner' limit 1;
  select id into v_season from public.seasons where is_current_scouting and project_id = v_proj;
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                         created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_coach, 'authenticated', 'authenticated', 'zz_test_coach@users.pluribus.app', 'x', now(),
          '{}', '{"username":"zz_test_coach"}', now(), now(), '', '', '', '');
  update public.profiles set status = 'active', academy_id = v_acad where id = v_coach;
  insert into public.camps(project_id, season_id, stage, name, district_id, region_id, starts_on, ends_on, status, submissions_open)
  values (v_proj, v_season, 'district', 'ZZ test camp', v_dist, v_reg, current_date + 30, current_date + 30, 'open', true) returning id into v_camp;
  insert into public.camps(project_id, season_id, stage, name, region_id, starts_on, status, submissions_open, rsvp_deadline)
  values (v_proj, v_season, 'province_final', 'ZZ test final', v_reg, current_date + 60, 'planned', false, current_date + 50) returning id into v_final;
  insert into public.players(project_id, first_name, last_name, birth_year, academy_id, source)
  values (v_proj, 'Zz', 'Foreign', 2014, v_other, 'staff') returning id into v_foreign;

  -- ===== as the coach =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_coach, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_p1 := public.coach_save_player(null, '{"first_name":"Zz","last_name":"One","birth_year":"2014","guardian_name":"G"}');
  v_p2 := public.coach_save_player(null, '{"first_name":"Zz","last_name":"Two","birth_year":"2012"}');
  r := r || jsonb_build_object('created', v_p1 is not null and v_p2 is not null);
  begin perform public.coach_save_player(null, '{"first_name":"zz","last_name":"one","birth_year":"2014"}'); r := r || '{"dup_blocked":false}';
  exception when others then r := r || jsonb_build_object('dup_blocked', sqlerrm like '%already%'); end;
  perform public.coach_save_player(v_p1, '{"first_name":"Zz","last_name":"One","birth_year":"2014","positions":"ST","guardian_name":"G"}');
  begin perform public.coach_save_player(v_foreign, '{"first_name":"X","last_name":"Y","birth_year":"2014"}'); r := r || '{"foreign_edit_blocked":false}';
  exception when others then r := r || '{"foreign_edit_blocked":true}'; end;
  j := public.coach_squad();
  r := r || jsonb_build_object('squad_n', jsonb_array_length(j),
         'squad_has_foreign', j::text like '%Foreign%',
         'positions_saved', exists (select 1 from jsonb_array_elements(j) x where x->>'positions' = 'ST'));
  select count(*) into n from public.players; r := r || jsonb_build_object('direct_players_visible', n);
  update public.players set first_name = 'Hack' where id in (v_p1, v_foreign); get diagnostics n = row_count;
  r := r || jsonb_build_object('direct_update_rows', n);

  j := public.coach_camps();
  r := r || jsonb_build_object('camp_listed', j::text like '%' || v_camp || '%', 'final_not_listed', j::text not like '%' || v_final || '%');
  n := public.coach_submit(v_camp, array[v_p1, v_p2], 'Fast winger'); r := r || jsonb_build_object('submitted', n);
  n := public.coach_submit(v_camp, array[v_p1], null); r := r || jsonb_build_object('resubmit_inserted', n);
  begin perform public.coach_submit(v_camp, array[v_foreign], null); r := r || '{"foreign_submit_blocked":false}';
  exception when others then r := r || '{"foreign_submit_blocked":true}'; end;
  begin perform public.coach_submit(v_final, array[v_p1], null); r := r || '{"final_submit_blocked":false}';
  exception when others then r := r || '{"final_submit_blocked":true}'; end;
  select count(*) into n from public.camp_participants; r := r || jsonb_build_object('direct_cp_visible', n);
  begin perform public.coach_squad(v_other); r := r || '{"coach_preview_blocked":false}';
  exception when others then r := r || '{"coach_preview_blocked":true}'; end;

  select (x->'journey'->0->>'id')::uuid into v_cp from jsonb_array_elements(public.coach_squad()) x where x->>'id' = v_p2::text;
  perform public.coach_withdraw(v_cp);
  perform public.coach_remove_player(v_p2);
  begin perform public.coach_remove_player(v_p1); r := r || '{"remove_with_history_blocked":false}';
  exception when others then r := r || '{"remove_with_history_blocked":true}'; end;
  r := r || jsonb_build_object('squad_after_remove', jsonb_array_length(public.coach_squad()));

  -- ===== staff grades (unpublished) and invites to the province final =====
  reset role;
  update public.camp_participants set obs = 'A', decision = 'selected', coach_message = 'Well done', status = 'attended'
   where camp_id = v_camp and player_id = v_p1;
  insert into public.camp_participants(camp_id, player_id, status) values (v_final, v_p1, 'invited');

  set local role authenticated;
  j := (select x->'journey' from jsonb_array_elements(public.coach_squad()) x where x->>'id' = v_p1::text);
  r := r || jsonb_build_object('unpublished_hidden', (select bool_and(e->'decision' = 'null'::jsonb and e->'message' = 'null'::jsonb)
                                                       from jsonb_array_elements(j) e where e->>'camp_id' = v_camp::text),
                               'journey_len', jsonb_array_length(j));
  select count(*) into n from public.notifications where read_at is null; r := r || jsonb_build_object('notif_after_invite', n);
  select (e->>'id')::uuid into v_cp from jsonb_array_elements(j) e where e->>'camp_id' = v_final::text;
  begin perform public.coach_rsvp(v_cp, false, ''); r := r || '{"decline_needs_reason":false}';
  exception when others then r := r || '{"decline_needs_reason":true}'; end;
  perform public.coach_rsvp(v_cp, false, 'School exams');
  perform public.coach_rsvp(v_cp, true, null);
  r := r || jsonb_build_object('rsvp_status', (select e->>'status' from jsonb_array_elements(
          (select x->'journey' from jsonb_array_elements(public.coach_squad()) x where x->>'id' = v_p1::text)) e where e->>'camp_id' = v_final::text));

  -- ===== staff publishes =====
  reset role;
  update public.camp_participants set decision_published = true where camp_id = v_camp;
  r := r || jsonb_build_object('pool_status', (select pool_status from public.players where id = v_p1));

  set local role authenticated;
  j := (select x->'journey' from jsonb_array_elements(public.coach_squad()) x where x->>'id' = v_p1::text);
  r := r || jsonb_build_object('published_visible', (select e->>'decision' || '/' || (e->>'message') from jsonb_array_elements(j) e where e->>'camp_id' = v_camp::text));
  select count(*) into n from public.notifications where read_at is null; r := r || jsonb_build_object('notif_after_publish', n);
  r := r || jsonb_build_object('standing', public.coach_standing());
  perform public.mark_notifications_read();
  select count(*) into n from public.notifications where read_at is null; r := r || jsonb_build_object('notif_unread_after_mark', n);

  -- ===== staff preview (as the owner) =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('staff_preview_squad', jsonb_array_length(public.coach_squad(v_acad)));
  begin perform public.coach_submit(v_camp, array[v_p1], null); r := r || '{"staff_write_blocked":false}';
  exception when others then r := r || '{"staff_write_blocked":true}'; end;

  reset role;
  raise exception 'TESTRESULT %', r;
end $$;
