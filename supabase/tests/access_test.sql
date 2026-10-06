-- Pluribus · access test (always rolls back)
do $$
declare r jsonb := '{}'; u uuid := gen_random_uuid(); n int; v_folder text;
begin
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', 'zz_access@users.pluribus.app', 'x', now(), '{}', '{"username":"zz_access"}', now(), now(), '', '', '', '');
  update public.profiles set role = 'observer', status = 'active' where id = u;
  select name into v_folder from public.talent_files where parent = '' and is_folder order by name limit 1;
  r := r || jsonb_build_object('observer_camps', public.access_level_for(u, 'camps'), 'observer_private', public.access_level_for(u, 'files.private'),
                               'observer_folder', public.access_level_for(u, 'files:' || v_folder));
  insert into public.user_access(user_id, area, level) values (u, 'camps', 2), (u, 'files', 0), (u, 'files:' || v_folder, 1);
  r := r || jsonb_build_object('override_camps', public.access_level_for(u, 'camps'), 'files_off', public.access_level_for(u, 'files:Season 2025-2026'),
                               'folder_back_on', public.access_level_for(u, 'files:' || v_folder));
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.talent_files; r := r || jsonb_build_object('visible_files', n,
     'expected', (select count(*) from public.talent_files where path like v_folder || '%' and not restricted));
  update public.academies set notes = notes where true; get diagnostics n = row_count; r := r || jsonb_build_object('academy_rows_editable', n);
  r := r || jsonb_build_object('my_access', public.my_access() -> 'camps');
  reset role;
  raise exception 'TESTRESULT %', r;
end $$;
