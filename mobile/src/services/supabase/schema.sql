-- Nimbus shared-memory schema for Supabase (PostgreSQL).
-- Run this in the Supabase SQL editor (or via `supabase db push`).
--
-- Mirrors server/db.js: users + friendships + photos, no exploration state.
-- Re-running it is safe; it is also the upgrade path for a project created
-- before friendship existed here.

create table if not exists public.users (
  id            text primary key,
  display_name  text not null,
  color         text not null,
  is_seed       boolean not null default false
);

-- Six characters other people type to add you. Nullable, because the row is
-- created first and the code allocated second (see database.ts).
alter table public.users add column if not exists friend_code text;
create unique index if not exists users_friend_code on public.users (friend_code);

-- What a device reports about its own travels, for the friends leaderboard.
-- Defaulted rather than nullable so someone who has never registered still
-- ranks, at the bottom, instead of dropping out of the list.
alter table public.users add column if not exists steps bigint not null default 0;
alter table public.users add column if not exists explored_percent double precision not null default 0;
alter table public.users add column if not exists updated_at bigint not null default 0;

-- Friendship is stored both ways round, as it is in server/db.js: it is a
-- mutual relation, and storing both rows keeps "whose photos may I see" a
-- single-column lookup rather than an or-join.
create table if not exists public.friendships (
  user_id    text not null references public.users (id) on delete cascade,
  friend_id  text not null references public.users (id) on delete cascade,
  primary key (user_id, friend_id)
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
alter table public.friendships enable row level security;
alter table public.photos enable row level security;

-- Demo policies: anon can read/write shared photos. Tighten for production.
--
-- Note what this does *not* do: the audience filter that limits you to your
-- friends' photographs is applied by the client (`user_id=in.(…)`), not by RLS.
-- With the anon key there is no authenticated identity for a policy to test, so
-- anyone holding the publishable key can read every row. The Node server
-- enforces the same rule server-side and does not have this hole. Closing it
-- means Supabase Auth and policies written against `auth.uid()`.
drop policy if exists "public can read users" on public.users;
create policy "public can read users"
  on public.users for select to anon using (true);

drop policy if exists "public can upsert users" on public.users;
create policy "public can upsert users"
  on public.users for insert to anon with check (true);

drop policy if exists "public can update users" on public.users;
create policy "public can update users"
  on public.users for update to anon using (true);

drop policy if exists "public can read friendships" on public.friendships;
create policy "public can read friendships"
  on public.friendships for select to anon using (true);

drop policy if exists "public can add friendships" on public.friendships;
create policy "public can add friendships"
  on public.friendships for insert to anon with check (true);

drop policy if exists "public can read photos" on public.photos;
create policy "public can read photos"
  on public.photos for select to anon using (true);

drop policy if exists "public can insert photos" on public.photos;
create policy "public can insert photos"
  on public.photos for insert to anon with check (true);

-- Storage bucket for uploaded images (create in Dashboard > Storage if this fails).
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "public can read media" on storage.objects;
create policy "public can read media"
  on storage.objects for select to anon
  using (bucket_id = 'media');

drop policy if exists "public can upload media" on storage.objects;
create policy "public can upload media"
  on storage.objects for insert to anon
  with check (bucket_id = 'media');
