-- Pluribus · 0013 live sync of the Talent folder index with SharePoint (stage 6)
-- The edge function "sharepoint-sync" reads Microsoft Graph with the Pluribus Sync app and applies the changes here.

alter table public.talent_files add column if not exists item_id text;
create unique index if not exists talent_files_item on public.talent_files(item_id) where item_id is not null;

create table if not exists public.sync_state (
  project_id uuid primary key references public.projects(id) on delete cascade,
  drive_id text,
  root_item_id text,
  delta_link text,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_status text,
  last_error text
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','error')),
  full_scan boolean not null default false,
  changed int not null default 0,
  deleted int not null default 0,
  error text,
  triggered_by uuid references public.profiles(id)
);
create index if not exists sync_runs_started on public.sync_runs(project_id, started_at desc);

alter table public.sync_state enable row level security;
alter table public.sync_runs enable row level security;
drop policy if exists sync_state_read on public.sync_state;
create policy sync_state_read on public.sync_state for select to authenticated using (public.is_admin());
drop policy if exists sync_runs_read on public.sync_runs;
create policy sync_runs_read on public.sync_runs for select to authenticated using (public.is_admin());

-- Apply one page of changes from Graph. Called by the edge function with the service key only.
create or replace function public.talent_sync_apply(p_project uuid, p_items jsonb, p_deleted text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r jsonb; v_path text; v_name text;
begin
  if p_deleted is not null and array_length(p_deleted, 1) > 0 then
    delete from public.talent_files where project_id = p_project and item_id = any(p_deleted);
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_path := r->>'path'; v_name := r->>'name';
    -- a renamed or moved item frees its old path; another item that sat on the new path is gone
    delete from public.talent_files where project_id = p_project and path = v_path and id <> (r->>'id')::uuid;
    insert into public.talent_files (id, project_id, path, parent, name, is_folder, ext, size, modified_at, restricted, indexed_at, item_id)
    values ((r->>'id')::uuid, p_project, v_path, coalesce(r->>'parent', ''), v_name, coalesce((r->>'is_folder')::boolean, false),
            nullif(r->>'ext', ''), (r->>'size')::bigint, (r->>'modified_at')::timestamptz, public.talent_is_restricted(v_path, v_name), now(), r->>'item_id')
    on conflict (id) do update set path = excluded.path, parent = excluded.parent, name = excluded.name, is_folder = excluded.is_folder,
      ext = excluded.ext, size = excluded.size, modified_at = excluded.modified_at, restricted = excluded.restricted, indexed_at = now(), item_id = excluded.item_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.talent_sync_apply(uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.talent_sync_apply(uuid, jsonb, text[]) to service_role;

-- After a full scan: rows the scan did not touch no longer exist in SharePoint.
create or replace function public.talent_sync_prune(p_project uuid, p_before timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.talent_files where project_id = p_project and indexed_at < p_before;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.talent_sync_prune(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.talent_sync_prune(uuid, timestamptz) to service_role;
