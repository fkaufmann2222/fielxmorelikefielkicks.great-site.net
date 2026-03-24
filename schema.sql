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
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint match_scouts_alliance_check check (alliance is null or alliance in ('Red', 'Blue'))
);

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
  auth_type text not null check (auth_type in ('password', 'faceid')),
  password_hash text,
  password_salt text,
  face_id_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_user_state (
  id text primary key,
  active_user_profile_id text references public.admin_user_profiles(id) on delete set null
);

alter table public.match_scouts
add column if not exists previous_team_ranking text;

create index if not exists idx_pit_scouts_updated_at on public.pit_scouts (updated_at desc);
create index if not exists idx_pit_scouts_team_number on public.pit_scouts (team_number);
create index if not exists idx_pit_scouts_event_key on public.pit_scouts (event_key);
create index if not exists idx_pit_scouts_event_team on public.pit_scouts (event_key, team_number);

create index if not exists idx_match_scouts_updated_at on public.match_scouts (updated_at desc);
create index if not exists idx_match_scouts_match_number on public.match_scouts (match_number);
create index if not exists idx_match_scouts_team_number on public.match_scouts (team_number);
create index if not exists idx_face_id_enrollments_updated_at on public.face_id_enrollments (updated_at desc);
create index if not exists idx_face_id_enrollments_created_at on public.face_id_enrollments (created_at desc);
create index if not exists idx_face_id_enrollments_event_key on public.face_id_enrollments (event_key);
create index if not exists idx_face_id_enrollments_profile_id on public.face_id_enrollments (profile_id);
create index if not exists idx_face_id_enrollments_person_name on public.face_id_enrollments (person_name);
create index if not exists idx_competition_profiles_updated_at on public.competition_profiles (updated_at desc);
create index if not exists idx_competition_profiles_created_at on public.competition_profiles (created_at desc);
create index if not exists idx_admin_user_profiles_created_at on public.admin_user_profiles (created_at desc);

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

alter table public.pit_scouts enable row level security;
alter table public.match_scouts enable row level security;
alter table public.face_id_enrollments enable row level security;
alter table public.competition_profiles enable row level security;
alter table public.admin_user_profiles enable row level security;
alter table public.admin_user_state enable row level security;

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
with check (true);

drop policy if exists "anon_rw_admin_user_profiles" on public.admin_user_profiles;
create policy "anon_rw_admin_user_profiles"
on public.admin_user_profiles
for all
to anon
using (true)
with check (true);

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
