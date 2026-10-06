-- Pluribus · 0007 index of the shared Talent folder (SharePoint)
-- One row per folder and file. Until the live SharePoint sync (stage 6) the index is a snapshot that an admin refreshes.
-- Finance and players' personal documents are visible to owners and admins only.

create table if not exists public.talent_files (
  id uuid primary key,                          -- SharePoint UniqueId
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null,                           -- relative to the Talent folder, e.g. "Season 2025-2026/Scouting/Data Base/East Province - Scouting.xlsx"
  parent text not null,                         -- folder path, '' for the root
  name text not null,
  is_folder boolean not null default false,
  ext text,
  size bigint,
  modified_at timestamptz,
  restricted boolean not null default false,
  indexed_at timestamptz not null default now(),
  unique (project_id, path)
);
create index if not exists talent_files_parent on public.talent_files(project_id, parent);
create index if not exists talent_files_name on public.talent_files using gin (to_tsvector('simple', name));

alter table public.talent_files enable row level security;
drop policy if exists talent_files_read on public.talent_files;
create policy talent_files_read on public.talent_files for select
  using (public.is_staff() and (not restricted or public.is_admin()));

create or replace function public.talent_folder_stats() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('files', count(*) filter (where not is_folder), 'folders', count(*) filter (where is_folder),
                            'bytes', coalesce(sum(size), 0), 'indexed_at', max(indexed_at), 'modified_at', max(modified_at))
    from public.talent_files
$$;
grant execute on function public.talent_folder_stats() to authenticated;
