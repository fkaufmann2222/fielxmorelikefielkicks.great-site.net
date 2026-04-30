-- Supabase schema for scouting backend migration.
-- Run this in the Supabase SQL editor before starting the backend.

create table if not exists public.pit_scouts (
  id text primary key,
  event_key text,
  profile_id text,
  team_number integer,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pit_scouts
add column if not exists event_key text;

alter table public.pit_scouts
add column if not exists profile_id text;

-- Purge legacy unscoped pit records so all remaining data is competition-specific.
delete from public.pit_scouts
where coalesce(event_key, '') = ''
   or team_number is null;

alter table public.pit_scouts
alter column event_key set not null;

alter table public.pit_scouts
alter column team_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pit_scouts_unique_event_team'
      and conrelid = 'public.pit_scouts'::regclass
  ) then
    alter table public.pit_scouts
    add constraint pit_scouts_unique_event_team unique (event_key, team_number);
  end if;
end;
$$;

create table if not exists public.match_scouts (
  id text primary key,
  match_number integer,
  team_number integer,
  alliance text,
  previous_team_ranking text,
  validated boolean not null default false,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint match_scouts_alliance_check check (alliance is null or alliance in ('Red', 'Blue'))
);

-- Autonomous path capture is stored inside match_scouts.data JSONB as data.autonPath.
-- Expected shape:
-- {
--   "startSlot": "R1" | "R2" | "R3" | "B1" | "B2" | "B3",
--   "capturedAt": "ISO-8601 timestamp",
--   "durationMs": 15000,
--   "trajectoryPoints": [{ "x": 0.08, "y": 0.34, "timestampMs": 0 }],
--   "shotAttempts": [{ "x": 0.45, "y": 0.52, "timestampMs": 8200 }],
--   "fieldVersion": "2026-field-v1"
-- }
-- Optional index for heavy auton replay analytics:
-- create index if not exists idx_match_scouts_auton_path on public.match_scouts using gin ((data -> 'autonPath'));

create table if not exists public.face_id_enrollments (
  id text primary key,
  person_name text not null,
  event_key text,
  profile_id text,
  embedding jsonb not null,
  embedding_model text not null default 'face-api.js@tiny-face-detector-v1',
  quality_score double precision,
  photo_urls jsonb not null default '[]'::jsonb,
  metadata jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.competition_profiles (
  id text primary key,
  event_key text not null unique,
  name text not null,
  location text,
  year integer,
  team_count integer not null default 0,
  teams jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_user_profiles (
  id text primary key,
  name text not null,
  role text not null default 'admin' check (role in ('admin', 'scout')),
  auth_type text not null check (auth_type in ('password', 'faceid')),
  password_hash text,
  password_salt text,
  face_id_name text,
  banned_at timestamptz,
  banned_reason text,
  banned_by_profile_id text references public.admin_user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_user_profiles
add column if not exists role text not null default 'admin' check (role in ('admin', 'scout'));

alter table public.admin_user_profiles
add column if not exists banned_at timestamptz;

alter table public.admin_user_profiles
add column if not exists banned_reason text;

alter table public.admin_user_profiles
add column if not exists banned_by_profile_id text references public.admin_user_profiles(id) on delete set null;

-- Keep only explicit allowlisted admin profiles.
-- Scout profiles are always preserved.
delete from public.admin_user_profiles
where role = 'admin'
  and id not in (
    'user-208e09f6-d1f6-4169-99fd-e509856aa8eb'
  );

create table if not exists public.scout_assignments (
  id text primary key,
  event_key text not null,
  match_number integer not null,
  team_number integer not null,
  scout_profile_id text not null references public.admin_user_profiles(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'completed')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prescouting_team_claims (
  id text primary key,
  season_year integer not null,
  team_number integer not null,
  claimer_profile_id text not null references public.admin_user_profiles(id) on delete cascade,
  claimer_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prescouting_team_claims_unique_team unique (season_year, team_number)
);

create table if not exists public.admin_user_state (
  id text primary key,
  active_user_profile_id text references public.admin_user_profiles(id) on delete set null
);

alter table public.match_scouts
add column if not exists previous_team_ranking text;

alter table public.match_scouts
add column if not exists validated boolean not null default false;

create index if not exists idx_pit_scouts_updated_at on public.pit_scouts (updated_at desc);
create index if not exists idx_pit_scouts_team_number on public.pit_scouts (team_number);
create index if not exists idx_pit_scouts_event_key on public.pit_scouts (event_key);
create index if not exists idx_pit_scouts_event_team on public.pit_scouts (event_key, team_number);

create index if not exists idx_match_scouts_updated_at on public.match_scouts (updated_at desc);
create index if not exists idx_match_scouts_match_number on public.match_scouts (match_number);
create index if not exists idx_match_scouts_team_number on public.match_scouts (team_number);
create index if not exists idx_match_scouts_validated on public.match_scouts (validated);
create index if not exists idx_face_id_enrollments_updated_at on public.face_id_enrollments (updated_at desc);
create index if not exists idx_face_id_enrollments_created_at on public.face_id_enrollments (created_at desc);
create index if not exists idx_face_id_enrollments_event_key on public.face_id_enrollments (event_key);
create index if not exists idx_face_id_enrollments_profile_id on public.face_id_enrollments (profile_id);
create index if not exists idx_face_id_enrollments_person_name on public.face_id_enrollments (person_name);
create index if not exists idx_competition_profiles_updated_at on public.competition_profiles (updated_at desc);
create index if not exists idx_competition_profiles_created_at on public.competition_profiles (created_at desc);
create index if not exists idx_admin_user_profiles_created_at on public.admin_user_profiles (created_at desc);
create index if not exists idx_admin_user_profiles_role on public.admin_user_profiles (role);
create index if not exists idx_admin_user_profiles_banned_at on public.admin_user_profiles (banned_at);
create index if not exists idx_scout_assignments_event_match_team on public.scout_assignments (event_key, match_number, team_number);
create index if not exists idx_scout_assignments_scout_profile_id on public.scout_assignments (scout_profile_id);
create index if not exists idx_prescouting_team_claims_season_team on public.prescouting_team_claims (season_year, team_number);
create index if not exists idx_prescouting_team_claims_claimer_profile_id on public.prescouting_team_claims (claimer_profile_id);
create index if not exists idx_prescouting_team_claims_updated_at on public.prescouting_team_claims (updated_at desc);

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

drop trigger if exists set_face_id_enrollments_updated_at on public.face_id_enrollments;
create trigger set_face_id_enrollments_updated_at
before update on public.face_id_enrollments
for each row
execute function public.set_updated_at();

drop trigger if exists set_competition_profiles_updated_at on public.competition_profiles;
create trigger set_competition_profiles_updated_at
before update on public.competition_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_scout_assignments_updated_at on public.scout_assignments;
create trigger set_scout_assignments_updated_at
before update on public.scout_assignments
for each row
execute function public.set_updated_at();

drop trigger if exists set_prescouting_team_claims_updated_at on public.prescouting_team_claims;
create trigger set_prescouting_team_claims_updated_at
before update on public.prescouting_team_claims
for each row
execute function public.set_updated_at();

alter table public.pit_scouts enable row level security;
alter table public.match_scouts enable row level security;
alter table public.face_id_enrollments enable row level security;
alter table public.competition_profiles enable row level security;
alter table public.admin_user_profiles enable row level security;
alter table public.admin_user_state enable row level security;
alter table public.scout_assignments enable row level security;
alter table public.prescouting_team_claims enable row level security;

-- Remove any previously-created admin_user_profiles policies (including legacy recursive ones)
-- so policy state is deterministic across environments before recreating known-safe policies.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_user_profiles'
  loop
    execute format('drop policy if exists %I on public.admin_user_profiles', existing_policy.policyname);
  end loop;
end;
$$;

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

drop policy if exists "service_role_full_face_id_enrollments" on public.face_id_enrollments;
create policy "service_role_full_face_id_enrollments"
on public.face_id_enrollments
for all
to service_role
using (true)
with check (true);

drop policy if exists "service_role_full_competition_profiles" on public.competition_profiles;
create policy "service_role_full_competition_profiles"
on public.competition_profiles
for all
to service_role
using (true)
with check (true);

drop policy if exists "service_role_full_admin_user_profiles" on public.admin_user_profiles;
create policy "service_role_full_admin_user_profiles"
on public.admin_user_profiles
for all
to service_role
using (true)
with check (true);

drop policy if exists "service_role_full_admin_user_state" on public.admin_user_state;
create policy "service_role_full_admin_user_state"
on public.admin_user_state
for all
to service_role
using (true)
with check (true);

drop policy if exists "service_role_full_scout_assignments" on public.scout_assignments;
create policy "service_role_full_scout_assignments"
on public.scout_assignments
for all
to service_role
using (true)
with check (true);

drop policy if exists "service_role_full_prescouting_team_claims" on public.prescouting_team_claims;
create policy "service_role_full_prescouting_team_claims"
on public.prescouting_team_claims
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

drop policy if exists "authenticated_rw_face_id_enrollments" on public.face_id_enrollments;
create policy "authenticated_rw_face_id_enrollments"
on public.face_id_enrollments
for all
to authenticated
using (true)
with check (true);

drop policy if exists "anon_rw_face_id_enrollments" on public.face_id_enrollments;
create policy "anon_rw_face_id_enrollments"
on public.face_id_enrollments
for all
to anon
using (true)
with check (true);

drop policy if exists "authenticated_rw_competition_profiles" on public.competition_profiles;
create policy "authenticated_rw_competition_profiles"
on public.competition_profiles
for all
to authenticated
using (true)
with check (true);

drop policy if exists "anon_rw_competition_profiles" on public.competition_profiles;
create policy "anon_rw_competition_profiles"
on public.competition_profiles
for all
to anon
using (true)
with check (true);

drop policy if exists "authenticated_rw_admin_user_profiles" on public.admin_user_profiles;
create policy "authenticated_rw_admin_user_profiles"
on public.admin_user_profiles
for all
to authenticated
using (true)
with check (
  role = 'scout'
  or role = 'admin'
);

drop policy if exists "anon_rw_admin_user_profiles" on public.admin_user_profiles;
create policy "anon_rw_admin_user_profiles"
on public.admin_user_profiles
for all
to anon
using (true)
with check (
  role = 'scout'
  or role = 'admin'
);

drop policy if exists "authenticated_rw_admin_user_state" on public.admin_user_state;
create policy "authenticated_rw_admin_user_state"
on public.admin_user_state
for all
to authenticated
using (true)
with check (true);

drop policy if exists "anon_rw_admin_user_state" on public.admin_user_state;
create policy "anon_rw_admin_user_state"
on public.admin_user_state
for all
to anon
using (true)
with check (true);

drop policy if exists "authenticated_rw_scout_assignments" on public.scout_assignments;
create policy "authenticated_rw_scout_assignments"
on public.scout_assignments
for all
to authenticated
using (true)
with check (true);

drop policy if exists "anon_rw_scout_assignments" on public.scout_assignments;
create policy "anon_rw_scout_assignments"
on public.scout_assignments
for all
to anon
using (true)
with check (true);

drop policy if exists "authenticated_rw_prescouting_team_claims" on public.prescouting_team_claims;
create policy "authenticated_rw_prescouting_team_claims"
on public.prescouting_team_claims
for all
to authenticated
using (true)
with check (true);

drop policy if exists "anon_rw_prescouting_team_claims" on public.prescouting_team_claims;
create policy "anon_rw_prescouting_team_claims"
on public.prescouting_team_claims
for all
to anon
using (true)
with check (true);

-- Storage bucket for pit scouting photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pit-scout-photos',
  'pit-scout-photos',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'face-id-snapshots',
  'face-id-snapshots',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public_read_pit_scout_photos" on storage.objects;
create policy "public_read_pit_scout_photos"
on storage.objects
for select
to public
using (bucket_id = 'pit-scout-photos');

drop policy if exists "anon_insert_pit_scout_photos" on storage.objects;
create policy "anon_insert_pit_scout_photos"
on storage.objects
for insert
to anon
with check (bucket_id = 'pit-scout-photos');

drop policy if exists "authenticated_insert_pit_scout_photos" on storage.objects;
create policy "authenticated_insert_pit_scout_photos"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'pit-scout-photos');

drop policy if exists "anon_delete_pit_scout_photos" on storage.objects;
create policy "anon_delete_pit_scout_photos"
on storage.objects
for delete
to anon
using (bucket_id = 'pit-scout-photos');

drop policy if exists "authenticated_delete_pit_scout_photos" on storage.objects;
create policy "authenticated_delete_pit_scout_photos"
on storage.objects
for delete
to authenticated
using (bucket_id = 'pit-scout-photos');

drop policy if exists "public_read_face_id_snapshots" on storage.objects;
create policy "public_read_face_id_snapshots"
on storage.objects
for select
to public
using (bucket_id = 'face-id-snapshots');

drop policy if exists "anon_insert_face_id_snapshots" on storage.objects;
create policy "anon_insert_face_id_snapshots"
on storage.objects
for insert
to anon
with check (bucket_id = 'face-id-snapshots');

drop policy if exists "authenticated_insert_face_id_snapshots" on storage.objects;
create policy "authenticated_insert_face_id_snapshots"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'face-id-snapshots');

drop policy if exists "anon_delete_face_id_snapshots" on storage.objects;
create policy "anon_delete_face_id_snapshots"
on storage.objects
for delete
to anon
using (bucket_id = 'face-id-snapshots');

drop policy if exists "authenticated_delete_face_id_snapshots" on storage.objects;
create policy "authenticated_delete_face_id_snapshots"
on storage.objects
for delete
to authenticated
using (bucket_id = 'face-id-snapshots');

-- Purge legacy unscoped pit photos under pit/{teamNumber}/...
begin;
select set_config('storage.allow_delete_query', 'true', true);

delete from storage.objects
where bucket_id = 'pit-scout-photos'
  and name ~ '^pit/[0-9]+/';

commit;

-- Clean up legacy table from older migrations.
drop table if exists public.team_imports;
