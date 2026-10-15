-- Tony Next · 0030 content sync on a schedule: while workbooks are pending, one is read every minute.
create or replace function public.content_tick() returns void
language plpgsql security definer set search_path = public as $$
declare t text; p uuid;
begin
  select cron_token, project_id into t, p from public.sync_state limit 1;
  if t is null then return; end if;
  if jsonb_array_length(public.talent_content_pending(p, 1)) = 0 then return; end if;
  perform net.http_post(
    url := 'https://lppabwdwltbcjynwdflz.supabase.co/functions/v1/sharepoint-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-token', t),
    body := '{"content": true}'::jsonb,
    timeout_milliseconds := 60000);
end $$;
revoke execute on function public.content_tick() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'tonynext-content-sync';
select cron.schedule('tonynext-content-sync', '* * * * *', 'select public.content_tick()');
