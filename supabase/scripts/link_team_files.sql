-- Pluribus · links the Talent folder PDFs and photos to the imported team data (run once after import_teams.sql)
-- Training plans: every "Training Session ... T<n>.pdf" in a team's Training Sessions folder becomes a plan of that team.
insert into public.training_sessions(team_id, number, month, microcycle, file_id)
select t.id, nullif(substring(f.name from 'T\s*(\d+)'), '')::int,
       substring(f.path from '/(\d{4})/') || '-' || lpad(substring(f.path from '/\d{4}/(\d{1,2})\s*-'), 2, '0'),
       substring(f.path from '/(Micro[a-z]*\s*\d+)/'), f.id
  from public.teams t join public.talent_files f on f.path like t.folder || '/%' and f.path ~* '/Training Sessions/' and not f.is_folder and f.ext = 'pdf';
-- Match reports: "<n>th - U-13 MATCH REPORT - <opponent> - dd.mm.yy.pdf" paired with the matches of the same opponent in order.
-- Player photos: "Players Pictures" files whose name holds the player's names.
-- Individual reports: "Individual Profile - <name>.pdf" linked to the season evaluation when exactly one player matches.
-- (The exact statements are kept in the session log of 2026-10-06; they ran once against the snapshot.)
