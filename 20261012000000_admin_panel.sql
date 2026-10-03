-- Update 10: Admin panel — admin account, moderator powers, statistics, play log, sponsors.

-- ---------------------------------------------------------------- make the owner an admin (moderator)
insert into public.moderators (user_id)
select id from auth.users where lower(email) = 'robertvtemployee@gmail.com'
on conflict do nothing;

-- ---------------------------------------------------------------- moderators can remove anything
create policy "tracks: moderators remove" on public.tracks for delete using (private.is_moderator());
create policy "bands: moderators remove" on public.bands for delete using (private.is_moderator());
create policy "band_photos: moderators remove" on public.band_photos for delete using (private.is_moderator());
create policy "listing_photos: moderators remove" on public.listing_photos for delete using (private.is_moderator());
create policy "gigs: moderators manage" on public.gigs for all using (private.is_moderator()) with check (private.is_moderator());
create policy "minaw: moderators remove files" on storage.objects for delete
  using (bucket_id in ('avatars','banners','band-photos','post-images','gear-photos','tracks','sponsors') and private.is_moderator());

-- ---------------------------------------------------------------- activity tracking
alter table public.profiles add column if not exists last_seen_at timestamptz;
create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at);
create index if not exists profiles_created_idx on public.profiles (created_at);

-- called by the app when someone opens it (at most once every 10 minutes)
create or replace function public.touch_seen()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_seen_at = now()
   where id = (select auth.uid()) and (last_seen_at is null or last_seen_at < now() - interval '10 minutes');
$$;

-- one row per play, for "plays today" and the plays chart (no user info stored)
create table if not exists public.play_log (
  id        bigint generated always as identity primary key,
  track_id  uuid not null references public.tracks(id) on delete cascade,
  played_at timestamptz not null default now()
);
create index if not exists play_log_played_idx on public.play_log (played_at);
alter table public.play_log enable row level security;  -- no policies: only database functions touch it

create or replace function public.record_play(p_track_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.tracks set play_count = play_count + 1 where id = p_track_id and not is_hidden;
  if found then insert into public.play_log (track_id) values (p_track_id); end if;
end $$;

-- ---------------------------------------------------------------- sponsors (Sponsored Spotlight)
create table if not exists public.sponsors (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 120),
  sponsor_name text not null check (char_length(sponsor_name) between 1 and 80),
  badge        text check (char_length(badge) <= 40),
  tagline      text check (char_length(tagline) <= 200),
  details      text check (char_length(details) <= 1000),
  image_url    text,
  cta_text     text not null default 'Learn More' check (char_length(cta_text) <= 30),
  promo_code   text check (char_length(promo_code) <= 40),
  link_url     text check (char_length(link_url) <= 500),
  contact      text check (char_length(contact) <= 120),
  venue_id     uuid references public.profiles(id) on delete set null,  -- their Venue/Business page on MINAW DVO
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  starts_at    timestamptz,
  ends_at      timestamptz,
  clicks       int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.sponsors enable row level security;
create policy "sponsors: live ones are public" on public.sponsors for select
  using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or private.is_moderator());
create policy "sponsors: moderators manage" on public.sponsors for all
  using (private.is_moderator()) with check (private.is_moderator());
create or replace trigger sponsors_updated_at before update on public.sponsors for each row execute function public.set_updated_at();

create or replace function public.record_sponsor_click(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.sponsors set clicks = clicks + 1 where id = p_id and is_active;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sponsors', 'sponsors', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "minaw: sponsor images readable" on storage.objects for select using (bucket_id = 'sponsors');
create policy "minaw: moderators upload sponsor images" on storage.objects for insert
  with check (bucket_id = 'sponsors' and private.is_moderator());
create policy "minaw: moderators update sponsor images" on storage.objects for update
  using (bucket_id = 'sponsors' and private.is_moderator());

-- the four spotlight ads that were hard-coded in the app
insert into public.sponsors (title, sponsor_name, badge, tagline, details, image_url, promo_code, sort_order)
select * from (values
  ('Kadayawan Gear & Pedalboard Mega Sale', 'MTS Music Hub & Audio Lab', 'EXCLUSIVE SCENE DEAL',
   'Up to 30% OFF on Boss, Fender & hand-forged Brass Kulintang sets.',
   'Matina Town Square branch exclusive. Show your MINAW DVO profile at the cashier counter to receive an instant 30% discount on select guitar effects, amplifiers, and strings.',
   'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&auto=format&fit=crop&q=80', 'TUGTOG30', 1),
  ('Suazo Craft Bar: Vinyl Thursdays & Craft Draft', 'Suazo Bar & Soundstage', 'WEEKLY GIG PROMO',
   'Buy 1 Davao Craft Beer, get free entry to Analog Listening Room.',
   'Located on Gov. Sales St, Poblacion. Acoustic vinyl listening with unreleased Davao band masters. Special rate on local cold IPAs and artisan tapas for musicians and fans.',
   'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=900&auto=format&fit=crop&q=80', 'SUAZO2FOR1', 2),
  ('SouthSound Rehearsal Studio Special', 'SouthSound Studio Davao', 'BAND REHEARSAL DEAL',
   'Book 3 Hours Rehearsal & Get a Free Live Multitrack Demo Recording.',
   'Fully acoustic-treated rooms in Matina equipped with Marshall JCM900, Ampeg SVT-CL, and Yamaha Maple Custom drums. Includes live 8-track audio recording of your session.',
   'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=900&auto=format&fit=crop&q=80', 'REHEARSEDVO', 3),
  ('Southern Mindanao Indie Fest 2026', 'Davao Cultural Sound Guild', 'FESTIVAL EARLY BIRD',
   '24 Homegrown Bands across 2 stages at MTS Taboan. Early bird VIP passes.',
   'Experience the largest independent music festival in Mindanao. VIP pass includes front-row lounge access, artist meet-and-greet pass, and exclusive screenprinted festival poster.',
   'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&auto=format&fit=crop&q=80', 'INDFEST2026', 4)
) v(title, sponsor_name, badge, tagline, details, image_url, promo_code, sort_order)
where not exists (select 1 from public.sponsors);

-- ---------------------------------------------------------------- admin functions (moderators only)
create or replace function private.require_moderator()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_moderator() then raise exception 'Admins only.'; end if;
end $$;

create or replace function public.admin_stats()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t0 timestamptz := (date_trunc('day', now() at time zone 'Asia/Manila')) at time zone 'Asia/Manila';  -- midnight, Davao time
  r jsonb;
begin
  perform private.require_moderator();
  select jsonb_build_object(
    'users_total',     (select count(*) from public.profiles),
    'fans',            (select count(*) from public.profiles where role = 'fan'),
    'artists',         (select count(*) from public.profiles where role = 'artist'),
    'venues',          (select count(*) from public.profiles where role = 'venue'),
    'suspended',       (select count(*) from public.profiles where is_suspended),
    'signups_today',   (select count(*) from public.profiles where created_at >= t0),
    'signups_7d',      (select count(*) from public.profiles where created_at >= t0 - interval '6 days'),
    'signups_30d',     (select count(*) from public.profiles where created_at >= t0 - interval '29 days'),
    'logins_today',    (select count(*) from auth.users where last_sign_in_at >= t0),
    'active_today',    (select count(*) from public.profiles where last_seen_at >= t0),
    'active_7d',       (select count(*) from public.profiles where last_seen_at >= t0 - interval '6 days'),
    'bands',           (select count(*) from public.bands),
    'tracks',          (select count(*) from public.tracks),
    'plays_total',     (select coalesce(sum(play_count), 0) from public.tracks),
    'plays_today',     (select count(*) from public.play_log where played_at >= t0),
    'plays_7d',        (select count(*) from public.play_log where played_at >= t0 - interval '6 days'),
    'posts_total',     (select count(*) from public.posts),
    'posts_today',     (select count(*) from public.posts where created_at >= t0),
    'comments_total',  (select count(*) from public.comments),
    'comments_today',  (select count(*) from public.comments where created_at >= t0),
    'reactions_total', (select count(*) from public.post_reactions),
    'listings_active', (select count(*) from public.listings where status = 'active' and not is_hidden),
    'listings_total',  (select count(*) from public.listings),
    'gigs_upcoming',   (select count(*) from public.gigs where starts_at >= now()),
    'gigs_total',      (select count(*) from public.gigs),
    'rsvps_total',     (select count(*) from public.gig_rsvps),
    'playlists',       (select count(*) from public.playlists),
    'follows_total',   (select count(*) from public.follows) + (select count(*) from public.user_follows),
    'reviews_pending', (select count(*) from public.band_reviews where status = 'pending') + (select count(*) from public.venue_reviews where status = 'pending'),
    'reports_open',    (select count(*) from public.reports where status in ('open', 'reviewing')),
    'sponsor_clicks',  (select coalesce(sum(clicks), 0) from public.sponsors),
    'by_day', (
      select jsonb_agg(jsonb_build_object(
        'day', to_char(d at time zone 'Asia/Manila', 'Mon DD'),
        'signups', (select count(*) from public.profiles where created_at >= d and created_at < d + interval '1 day'),
        'active',  (select count(*) from public.profiles where last_seen_at >= d and last_seen_at < d + interval '1 day'),
        'plays',   (select count(*) from public.play_log where played_at >= d and played_at < d + interval '1 day'),
        'posts',   (select count(*) from public.posts where created_at >= d and created_at < d + interval '1 day')
      ) order by d)
      from generate_series(t0 - interval '13 days', t0, interval '1 day') d
    ),
    'top_tracks', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select t.id, t.title, t.play_count, b.id as band_id, b.name as band_name
          from public.tracks t join public.bands b on b.id = t.band_id
         order by t.play_count desc, t.created_at desc limit 5) x
    )
  ) into r;
  return r;
end $$;

create or replace function public.admin_users(p_search text default '', p_role text default '', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, display_name text, username text, avatar_url text, role text, email text,
  created_at timestamptz, last_sign_in_at timestamptz, last_seen_at timestamptz,
  is_suspended boolean, is_verified boolean, is_moderator boolean, posts bigint, band_id uuid
) language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_moderator();
  return query
  select p.id, p.display_name, p.username, p.avatar_url, p.role::text, u.email::text,
         p.created_at, u.last_sign_in_at, p.last_seen_at,
         p.is_suspended, p.is_verified, exists (select 1 from public.moderators m where m.user_id = p.id),
         (select count(*) from public.posts po where po.author_id = p.id),
         (select b.id from public.bands b where b.owner_id = p.id limit 1)
    from public.profiles p join auth.users u on u.id = p.id
   where (coalesce(p_search, '') = '' or p.display_name ilike '%' || p_search || '%' or p.username ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%')
     and (coalesce(p_role, '') = '' or p.role::text = p_role)
   order by p.created_at desc
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

-- Suspend = can't post, profile hidden, and can't log in. Unsuspend reverses all three.
create or replace function public.admin_set_suspended(p_user uuid, p_suspend boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_moderator();
  if p_user = (select auth.uid()) then raise exception 'You can’t suspend your own account.'; end if;
  if exists (select 1 from public.moderators where user_id = p_user) then raise exception 'You can’t suspend another admin.'; end if;
  update public.profiles set is_suspended = p_suspend where id = p_user;
  update auth.users set banned_until = case when p_suspend then '2999-12-31'::timestamptz else null end where id = p_user;
end $$;

create or replace function public.admin_set_verified(p_user uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_moderator();
  update public.profiles set is_verified = p_verified where id = p_user;
  update public.bands set is_verified = p_verified where owner_id = p_user;
end $$;
