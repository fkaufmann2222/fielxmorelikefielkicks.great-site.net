-- Supabase schema for scouting backend migration.
-- Run this in the Supabase SQL editor before starting the backend.

create table if not exists public.pit_scouts (
  id text primary key,
  team_number integer,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.match_scouts (
  id text primary key,
  match_number integer,
  team_number integer,
  alliance text,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint match_scouts_alliance_check check (alliance is null or alliance in ('Red', 'Blue'))
);

create table if not exists public.team_imports (
  team_number integer primary key,
  previous_comp_rank text,
  auto_fuel_count numeric,
  auto_notes text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_pit_scouts_updated_at on public.pit_scouts (updated_at desc);
create index if not exists idx_pit_scouts_team_number on public.pit_scouts (team_number);

create index if not exists idx_match_scouts_updated_at on public.match_scouts (updated_at desc);
create index if not exists idx_match_scouts_match_number on public.match_scouts (match_number);
create index if not exists idx_match_scouts_team_number on public.match_scouts (team_number);
create index if not exists idx_team_imports_updated_at on public.team_imports (updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pit_scouts_updated_at on public.pit_scouts;
create trigger set_pit_scouts_updated_at
before update on public.pit_scouts
for each row
execute function public.set_updated_at();

drop trigger if exists set_match_scouts_updated_at on public.match_scouts;
create trigger set_match_scouts_updated_at
before update on public.match_scouts
for each row
execute function public.set_updated_at();

drop trigger if exists set_team_imports_updated_at on public.team_imports;
create trigger set_team_imports_updated_at
before update on public.team_imports
for each row
execute function public.set_updated_at();

alter table public.pit_scouts enable row level security;
alter table public.match_scouts enable row level security;
alter table public.team_imports enable row level security;

-- Service-role requests bypass RLS in Supabase, but explicit policies are included
-- so this schema remains predictable when roles are customized.
drop policy if exists "service_role_full_pit_scouts" on public.pit_scouts;
create policy "service_role_full_pit_scouts"
on public.pit_scouts
for all
to service_role
using (true)
with check (true);

drop policy if exists "service_role_full_match_scouts" on public.match_scouts;
create policy "service_role_full_match_scouts"
on public.match_scouts
for all
to service_role
using (true)
with check (true);

drop policy if exists "service_role_full_team_imports" on public.team_imports;
create policy "service_role_full_team_imports"
on public.team_imports
for all
to service_role
using (true)
with check (true);

-- Temporary authenticated access policy (optional for future direct client access).
-- Replace with user/event-scoped policies when auth is introduced.
drop policy if exists "authenticated_rw_pit_scouts" on public.pit_scouts;
create policy "authenticated_rw_pit_scouts"
on public.pit_scouts
for all
to authenticated
using (true)
with check (true);

drop policy if exists "anon_rw_pit_scouts" on public.pit_scouts;
create policy "anon_rw_pit_scouts"
on public.pit_scouts
for all
to anon
using (true)
with check (true);

drop policy if exists "authenticated_rw_match_scouts" on public.match_scouts;
create policy "authenticated_rw_match_scouts"
on public.match_scouts
for all
to authenticated
using (true)
with check (true);

drop policy if exists "anon_rw_match_scouts" on public.match_scouts;
create policy "anon_rw_match_scouts"
on public.match_scouts
for all
to anon
using (true)
with check (true);

drop policy if exists "authenticated_rw_team_imports" on public.team_imports;
create policy "authenticated_rw_team_imports"
on public.team_imports
for all
to authenticated
using (true)
with check (true);

drop policy if exists "anon_rw_team_imports" on public.team_imports;
create policy "anon_rw_team_imports"
on public.team_imports
for all
to anon
using (true)
with check (true);
