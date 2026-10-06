-- Pluribus · snapshot of the Talent folder index (until the live sync of stage 6)
-- The folder listing is read in the browser (signed in to SharePoint) and sent to this temporary token-guarded function.
-- __TOKEN__ is replaced by a one-time random value at run time. The function is dropped right after.
create or replace function public.tmp_files_put(p_token text, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_proj uuid := (select id from public.projects order by created_at limit 1);
begin
  if p_token is distinct from '__TOKEN__' then raise exception 'not allowed'; end if;
  insert into public.talent_files(id, project_id, path, parent, name, is_folder, ext, size, modified_at, restricted, indexed_at)
  select (x->>'id')::uuid, v_proj, x->>'path', x->>'parent', x->>'name', (x->>'folder')::boolean, nullif(x->>'ext',''),
         nullif(x->>'size','')::bigint, nullif(x->>'modified','')::timestamptz, (x->>'restricted')::boolean, now()
    from jsonb_array_elements(p) x
  on conflict (id) do update set path = excluded.path, parent = excluded.parent, name = excluded.name, ext = excluded.ext, size = excluded.size,
                                 modified_at = excluded.modified_at, restricted = excluded.restricted, indexed_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.tmp_files_put(text, jsonb) to anon;
-- After the run: delete rows not seen in this run, then
-- drop function public.tmp_files_put(text, jsonb);
