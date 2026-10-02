-- Applied 2026-10-03: common genres + custom "Other" genres, user-to-user follows, playlist likes & copies.
insert into public.genres (name) values
  ('Rock'), ('Pop'), ('Hip-Hop'), ('Rap'), ('R&B'), ('Soul'), ('Funk'), ('Jazz'), ('Blues'), ('Country'),
  ('Folk'), ('Indie'), ('Alternative'), ('Punk'), ('Pop Punk'), ('Hardcore'), ('Metal'), ('Heavy Metal'),
  ('Metalcore'), ('Death Metal'), ('Grunge'), ('Emo'), ('Shoegaze'), ('Post-Rock'), ('Progressive Rock'),
  ('Psychedelic'), ('Ska'), ('Reggae'), ('Dancehall'), ('Electronic'), ('EDM'), ('House'), ('Techno'),
  ('Trance'), ('Drum & Bass'), ('Dubstep'), ('Lo-Fi'), ('Ambient'), ('Experimental'), ('Classical'),
  ('Orchestral'), ('Acoustic'), ('Singer-Songwriter'), ('Gospel'), ('Worship'), ('Latin'), ('Bossa Nova'),
  ('World'), ('K-Pop'), ('J-Pop'), ('OPM'), ('P-Pop'), ('Ballad'), ('City Pop'), ('Disco'), ('Garage Rock'),
  ('Dream Pop'), ('Math Rock'), ('Jam Band'), ('Neo-Soul'), ('Synthwave'), ('Afrobeats'), ('Trap'),
  ('Ethnic / Tribal'), ('Kulintang Fusion'), ('BisRock'), ('Mindanao Indie')
on conflict (name) do nothing;
create unique index if not exists genres_name_lower_idx on public.genres (lower(name));
alter table public.genres add column if not exists is_custom boolean not null default false;
alter table public.genres add constraint genres_name_len check (char_length(trim(name)) between 2 and 40);
create policy "genres: artists add custom" on public.genres
  for insert to authenticated with check (private.can_post() and is_custom);

create table public.user_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index user_follows_followee_idx on public.user_follows (followee_id);
alter table public.user_follows enable row level security;
create policy "user_follows: readable by all" on public.user_follows for select using (true);
create policy "user_follows: follow as yourself" on public.user_follows
  for insert to authenticated with check (follower_id = (select auth.uid()) and private.is_active_user());
create policy "user_follows: unfollow as yourself" on public.user_follows
  for delete to authenticated using (follower_id = (select auth.uid()));

create table public.playlist_likes (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (playlist_id, user_id)
);
create index playlist_likes_user_idx on public.playlist_likes (user_id);
alter table public.playlist_likes enable row level security;
create policy "playlist_likes: readable by all" on public.playlist_likes for select using (true);
create policy "playlist_likes: like as yourself" on public.playlist_likes
  for insert to authenticated with check (user_id = (select auth.uid()) and private.is_active_user());
create policy "playlist_likes: unlike as yourself" on public.playlist_likes
  for delete to authenticated using (user_id = (select auth.uid()));

alter table public.playlists add column if not exists copied_from uuid references public.playlists (id) on delete set null;
alter table public.playlists add column if not exists original_owner_id uuid references public.profiles (id) on delete set null;
create index if not exists playlists_original_owner_idx on public.playlists (original_owner_id);
create index if not exists playlists_copied_from_idx on public.playlists (copied_from);
