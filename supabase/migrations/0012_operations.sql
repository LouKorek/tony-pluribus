-- Pluribus · 0012 operations: player files, staff reports, finance, partners, transfers, club portal

create extension if not exists pg_trgm with schema extensions;

-- ───────── Player files (documents per player) ─────────
create table if not exists public.player_documents (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('birth_certificate','registration_agreement','non_registration','parental_consent','contract','medical','id','photo','release','other')),
  file_id uuid references public.talent_files(id) on delete set null,
  status text not null default 'received' check (status in ('missing','requested','received','verified','expired')),
  expires_on date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists player_documents_player on public.player_documents(player_id);
create unique index if not exists player_documents_file on public.player_documents(player_id, file_id) where file_id is not null;

-- ───────── Staff reports: the weekly coordinator log ─────────
create table if not exists public.staff_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  day date not null,
  time_text text,
  location text,
  contact text,
  activity text not null,
  status text,
  feedback text,
  staff text,
  file_id uuid references public.talent_files(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists staff_activities_day on public.staff_activities(day);

-- ───────── Finance ─────────
create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  kind text not null default 'mobile' check (kind in ('mobile','bank','cash','card','other')),
  currency text not null default 'RWF',
  holder text,
  unique (project_id, name)
);
create table if not exists public.finance_tx (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.finance_accounts(id) on delete cascade,
  day date not null,
  amount_out numeric not null default 0,
  amount_in numeric not null default 0,
  description text,
  type text,
  subtype text,
  payee text,
  invoice_ref text,
  invoice_kind text,
  file_id uuid references public.talent_files(id) on delete set null,
  balance numeric,
  source text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists finance_tx_day on public.finance_tx(account_id, day);

-- ───────── Partners: clubs, federation, schools, sponsors ─────────
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  kind text not null default 'club' check (kind in ('club','federation','school','sponsor','academy','agency','media','government','other')),
  country text, city text, website text,
  status text not null default 'active' check (status in ('active','prospect','past')),
  folder text,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.partner_contacts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null, role text, phone text, email text, notes text
);
create table if not exists public.partner_notes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  day date not null default current_date,
  note text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ───────── Transfer desk ─────────
create table if not exists public.player_moves (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete set null,
  club text,
  kind text not null check (kind in ('interest','trial','offer','loan','transfer','release','return')),
  status text not null default 'open' check (status in ('open','in_progress','agreed','completed','declined','cancelled')),
  starts_on date, ends_on date,
  amount numeric, currency text default 'EUR',
  notes text,
  file_id uuid references public.talent_files(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ───────── Club portal: curated player lists shared with clubs by link ─────────
create table if not exists public.showcases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  audience text,
  intro text,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  active boolean not null default true,
  expires_on date,
  show_stats boolean not null default true,
  show_tests boolean not null default true,
  views int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.showcase_players (
  showcase_id uuid not null references public.showcases(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  note text,
  sort int not null default 0,
  primary key (showcase_id, player_id)
);

-- Public read of one showcase by its token (no sign-in). Only what the list chooses to show; no contacts, no documents.
create or replace function public.showcase_view(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.showcases;
begin
  select * into s from public.showcases where token = p_token and active and (expires_on is null or expires_on >= current_date);
  if s.id is null then return null; end if;
  update public.showcases set views = views + 1 where id = s.id;
  return jsonb_build_object('title', s.title, 'intro', s.intro, 'audience', s.audience,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.first_name || case when p.last_name <> '—' then ' ' || upper(p.last_name) else '' end,
      'birth_year', p.birth_year, 'foot', p.preferred_foot, 'positions', coalesce(p.positions, (select tp.position from public.team_players tp where tp.player_id = p.id order by tp.created_at desc limit 1)),
      'team', (select t.name || ' · ' || se.label from public.team_players tp join public.teams t on t.id = tp.team_id join public.seasons se on se.id = t.season_id where tp.player_id = p.id order by se.label desc limit 1),
      'note', sp.note,
      'stats', case when s.show_stats then (select jsonb_build_object('matches', count(*), 'goals', coalesce(sum(goals), 0), 'assists', coalesce(sum(assists), 0)) from public.match_players mp where mp.player_id = p.id) end,
      'tests', case when s.show_tests then (select jsonb_object_agg(metric, value) from (select distinct on (metric) metric, value from public.measurements m where m.player_id = p.id and metric in ('sprint_10m','sprint_20m','height_cm','weight_kg') order by metric, taken_on desc nulls last) x) end
    ) order by sp.sort, p.last_name) from public.showcase_players sp join public.players p on p.id = sp.player_id where sp.showcase_id = s.id), '[]'::jsonb));
end $$;
grant execute on function public.showcase_view(text) to anon, authenticated;

-- ───────── Access rules ─────────
do $$
declare t text; a text;
begin
  for t, a in select * from (values ('player_documents','player_files'),('staff_activities','staff_reports'),('finance_accounts','finance'),('finance_tx','finance'),
                                    ('partners','partners'),('partner_contacts','partners'),('partner_notes','partners'),('player_moves','transfers'),
                                    ('showcases','club_portal'),('showcase_players','club_portal')) v(t, a) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can(%L, 1))', t || '_read', t, a);
    execute format('create policy %I on public.%I for all to authenticated using (public.can(%L, 2)) with check (public.can(%L, 2))', t || '_write', t, a, a);
  end loop;
  foreach t in array array['player_documents','staff_activities','finance_tx','partners','player_moves','showcases'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;
