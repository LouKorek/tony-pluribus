-- Pluribus · 0008 one rule for which Talent files are admin-only
-- Players' personal documents (birth certificates, contracts, health files, release letters) and finance.
-- Club Management/Media and the pitch timetable stay open to the staff.
create or replace function public.talent_is_restricted(p_path text, p_name text) returns boolean
language sql immutable as $$
  select p_path ~* '^(Players Documents|Reports/Finance|Club Management/Birth certificate|Talent/Release Letter)'
      or p_name ~* 'contract|passport|salary|payslip|bank|invoice|finance|medical|health|birth cert'
$$;
update public.talent_files set restricted = public.talent_is_restricted(path, name);
