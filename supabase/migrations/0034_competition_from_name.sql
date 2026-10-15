-- Tony Next · 0034 the competition of a stats workbook or a report comes from its file name first
-- ("3rd Division Match Control - Stats - 25-26.xlsx" in Control Documents), then from the folders under Matches.
create or replace function public.talent_competition(p_path text) returns text
language plpgsql immutable as $$
declare seg text; segs text[];
begin
  segs := array[regexp_replace(split_part(p_path, '/', array_length(string_to_array(p_path, '/'), 1)), '\.[A-Za-z0-9]+$', '')];
  if p_path ~ '/Matches/' then segs := segs || string_to_array(substring(p_path from '/Matches/(.*)$'), '/'); end if;
  foreach seg in array segs loop
    if seg ~* 'friendly' then return 'Friendly'; end if;
    if seg ~* '\mtds\M' then return 'TDS'; end if;
    if seg ~* '\m\d(st|nd|rd|th) division' then return lower(substring(seg from '(?i)(\d(?:st|nd|rd|th))')) || ' Division'; end if;
    if seg ~* '\mU-?\d{2}\M.*league' then return upper(regexp_replace(substring(seg from '(?i)(U-?\d{2})'), '-', '')) || ' League'; end if;
    if seg ~* 'league' and seg !~ '^\d+\s*-' and seg !~* 'match control' then return trim(seg); end if;
    if seg ~* '\mcup\M' and seg !~ '^\d+\s*-' and seg !~* 'match control' then return trim(seg); end if;
  end loop;
  return 'Friendly';
end $$;
-- matches that carried the wrong competition name are read and linked again
update public.matches m set competition = public.talent_competition(f.path) from public.talent_files f where f.id = m.report_file_id and m.competition <> public.talent_competition(f.path);
delete from public.matches where report_file_id is null and exists (select 1 from public.talent_content c join public.talent_files f on f.id = c.file_id where c.kind = 'matchstats' and public.talent_team_for(f.path) = matches.team_id and public.talent_competition(f.path) = matches.competition);
update public.talent_content set parsed_modified_at = null, attempts = 0, error = null where kind = 'matchstats';
