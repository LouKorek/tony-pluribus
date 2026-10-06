-- Pluribus · one-off import of finance ledgers (Reports/Finance Momo) and the weekly coordinator reports (Reports/Professional)
-- Read in the browser, sent to this temporary token-guarded function, then dropped. __TOKEN__ is replaced at run time.
create or replace function public.tmp_ops(p_token text, p_kind text, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_proj uuid := (select id from public.projects order by created_at limit 1); n int;
begin
  if p_token is distinct from '__TOKEN__' then raise exception 'not allowed'; end if;
  if p_kind = 'finance' then
    insert into public.finance_accounts(project_id, name, kind, holder)
    select distinct v_proj, e->>'account', case when e->>'account' = 'TRW MoMo' then 'mobile' else 'cash' end,
           case when e->>'account' in ('Andre','Fabio') then e->>'account' end
      from jsonb_array_elements(p) e on conflict (project_id, name) do nothing;
    insert into public.finance_tx(account_id, day, amount_out, amount_in, description, type, subtype, payee, invoice_ref, balance, source, file_id)
    select a.id, (e->>'date')::date, coalesce((e->>'out')::numeric, 0), coalesce((e->>'in')::numeric, 0), nullif(e->>'description',''), nullif(e->>'type',''),
           nullif(e->>'subtype',''), nullif(e->>'payee',''), nullif(e->>'invoice',''), nullif(e->>'balance','')::numeric, e->>'source',
           (select f.id from public.talent_files f where f.path like 'Reports/Finance Momo/%' and nullif(e->>'invoice','') is not null
              and lower(f.name) like lower(left(e->>'invoice', 40)) || '%' limit 1)
      from jsonb_array_elements(p) e join public.finance_accounts a on a.project_id = v_proj and a.name = e->>'account';
  elsif p_kind = 'activities' then
    insert into public.staff_activities(project_id, day, time_text, location, contact, activity, status, feedback, staff, file_id)
    select v_proj, (e->>'day')::date, nullif(e->>'time',''), nullif(e->>'location',''), nullif(e->>'contact',''), e->>'activity',
           nullif(e->>'status',''), nullif(e->>'feedback',''), nullif(e->>'staff',''), (select id from public.talent_files where id = (e->>'file')::uuid)
      from jsonb_array_elements(p) e;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.tmp_ops(text, text, jsonb) to anon;
-- After the run: drop function public.tmp_ops(text, text, jsonb);
