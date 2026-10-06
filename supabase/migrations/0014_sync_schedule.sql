-- Pluribus · 0014 run the SharePoint sync on its own every 15 minutes
create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.sync_state add column if not exists cron_token text not null default encode(extensions.gen_random_bytes(24), 'hex');
alter table public.sync_runs add column if not exists scheduled boolean not null default false;
-- the token never leaves the database: admins read sync_state, but not this column
revoke select on public.sync_state from authenticated;
grant select (project_id, drive_id, root_item_id, delta_link, last_run_at, last_ok_at, last_status, last_error) on public.sync_state to authenticated;

create or replace function public.sync_tick() returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select cron_token into t from public.sync_state limit 1;
  if t is null then return; end if;
  perform net.http_post(
    url := 'https://lppabwdwltbcjynwdflz.supabase.co/functions/v1/sharepoint-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-token', t),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
end $$;
revoke all on function public.sync_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'pluribus-sharepoint-sync';
select cron.schedule('pluribus-sharepoint-sync', '*/15 * * * *', 'select public.sync_tick()');
