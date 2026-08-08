-- Nimbus shared-memory schema for Supabase (PostgreSQL).
-- Run this in the Supabase SQL editor (or via `supabase db push`).
--
-- Mirrors server/db.js: users + photos, no exploration state.

create table if not exists public.users (
  id            text primary key,
  display_name  text not null,
  color         text not null,
  is_seed       boolean not null default false
);

create table if not exists public.photos (
  id          text primary key,
  user_id     text not null references public.users (id) on delete cascade,
  lat         double precision not null,
  lon         double precision not null,
  taken_at    bigint not null,
  caption     text not null default '',
  media_file  text not null,
  place_name  text
);

-- Bounding-box prefilter for nearby search; latitude first (more selective).
create index if not exists photos_lat_lon on public.photos (lat, lon);

alter table public.users enable row level security;
alter table public.photos enable row level security;

-- Demo policies: anon can read/write shared photos. Tighten for production.
create policy "public can read users"
  on public.users for select to anon using (true);

create policy "public can upsert users"
  on public.users for insert to anon with check (true);

create policy "public can update users"
  on public.users for update to anon using (true);

create policy "public can read photos"
  on public.photos for select to anon using (true);

create policy "public can insert photos"
  on public.photos for insert to anon with check (true);

-- Storage bucket for uploaded images (create in Dashboard > Storage if this fails).
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

create policy "public can read media"
  on storage.objects for select to anon
  using (bucket_id = 'media');

create policy "public can upload media"
  on storage.objects for insert to anon
  with check (bucket_id = 'media');
