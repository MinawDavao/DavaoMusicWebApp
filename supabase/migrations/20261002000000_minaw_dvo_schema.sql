-- =====================================================================
--  MINAW DVO — Supabase schema (v1)
--  Davao music & live scene app: fans, artists/bands, music, gigs,
--  Connect feed, Gear Exchange deals, Terms of Agreement & reports.
--
--  HOW TO RUN
--    Supabase dashboard → SQL Editor → New query → paste this whole
--    file → Run. Run it ONCE on a fresh project (it is wrapped in a
--    transaction, so if anything fails nothing is half-created).
--
--  AFTER RUNNING
--    1. Auth → Sign In / Providers → Email: turn OFF "Confirm email"
--       while testing (this is the "bypass verification" switch).
--       Turn it back ON before launch.
--    2. Make yourself a moderator (replace the email):
--         insert into public.moderators (user_id)
--         select id from auth.users where email = 'you@example.com';
--    3. Sign-up from the app must send metadata, e.g.
--         supabase.auth.signUp({ email, password,
--           options: { data: { role: 'fan' | 'artist', name: 'Kiko Alvarez' } } })
--
--  STORAGE PATHS
--    Upload every file under a folder named after the user's id:
--      avatars/<user_id>/avatar.jpg     tracks/<user_id>/song.mp3
--    The storage policies below only let users write inside their own folder.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------
create type public.user_role       as enum ('fan', 'artist');
create type public.gig_status      as enum ('confirmed', 'selling_fast', 'almost_full', 'secret_set', 'cancelled');
create type public.reaction_type   as enum ('rock', 'fire', 'orchid', 'durian');
create type public.deal_type       as enum ('for_sale', 'for_trade', 'sale_or_trade', 'looking_to_buy');
create type public.gear_category   as enum ('guitars_bass', 'pedals_fx', 'drums_percussion', 'keys_synths', 'amps_audio', 'accessories');
create type public.gear_condition  as enum ('brand_new', 'like_mint', 'gig_tested', 'vintage_relic');
create type public.listing_status  as enum ('active', 'sold', 'closed');
create type public.report_target   as enum ('post', 'comment', 'listing', 'track', 'band', 'review', 'profile');
create type public.report_reason   as enum ('nudity', 'violence', 'political', 'hate', 'scam', 'copyright', 'other');
create type public.report_status   as enum ('open', 'reviewing', 'removed', 'dismissed');

-- ---------------------------------------------------------------------
-- 2. GENERIC HELPERS
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. PEOPLE: moderators, profiles
-- ---------------------------------------------------------------------
create table public.moderators (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.moderators is 'Users who can review reports and remove content. Add rows from the SQL editor only.';

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.moderators m where m.user_id = auth.uid());
$$;

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  role                 public.user_role not null default 'fan',
  display_name         text not null check (char_length(display_name) between 1 and 80),
  username             text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  avatar_url           text,
  district             text,
  bio                  text check (char_length(bio) <= 280),
  instruments          text,
  instagram            text,
  facebook             text,
  show_rsvps           boolean not null default true,
  show_playlists       boolean not null default true,
  onboarding_completed boolean not null default false,
  is_verified          boolean not null default false,  -- moderator-controlled
  is_suspended         boolean not null default false,  -- moderator-controlled
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.profiles is 'One row per account (fan or artist). Created automatically on sign-up.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Only moderators may change verification / suspension flags.
create or replace function public.protect_profile_flags()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_moderator() then
    if tg_op = 'INSERT' then
      new.is_verified := false;
      new.is_suspended := false;
    else
      new.is_verified := old.is_verified;
      new.is_suspended := old.is_suspended;
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect_flags before insert or update on public.profiles
  for each row execute function public.protect_profile_flags();

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
  v_name text;
  v_base text;
begin
  v_role := case when new.raw_user_meta_data ->> 'role' = 'artist' then 'artist'::public.user_role
                 else 'fan'::public.user_role end;
  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1), 'New user');
  v_base := left(regexp_replace(lower(coalesce(split_part(new.email, '@', 1), '')), '[^a-z0-9_]', '', 'g'), 20);
  if char_length(v_base) < 3 then v_base := 'user' || v_base; end if;

  insert into public.profiles (id, role, display_name, username)
  values (new.id, v_role, left(v_name, 80), v_base || '_' || substr(md5(random()::text), 1, 5));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_suspended);
$$;

-- ---------------------------------------------------------------------
-- 4. TERMS OF AGREEMENT
-- ---------------------------------------------------------------------
create table public.terms_versions (
  version      text primary key,
  title        text not null default 'Terms of Agreement',
  summary      text,
  published_at timestamptz not null default now(),
  is_current   boolean not null default false
);
create unique index terms_versions_one_current on public.terms_versions (is_current) where is_current;

insert into public.terms_versions (version, summary, is_current) values
  ('2026-10', 'You own your music; downloads are the artist''s choice; no nudity, violence or political posts; reported content is reviewed and removed if it breaks the rules.', true);

create table public.terms_acceptances (
  user_id               uuid not null references public.profiles (id) on delete cascade,
  version               text not null references public.terms_versions (version),
  accepted_guidelines   boolean not null check (accepted_guidelines),
  accepted_music_rights boolean not null default false,  -- required for artists (enforced in app)
  accepted_at           timestamptz not null default now(),
  primary key (user_id, version)
);
comment on table public.terms_acceptances is 'Proof that a user agreed to a given version of the Terms (shown after sign-up).';

create or replace function public.has_accepted_terms()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.terms_acceptances a
    join public.terms_versions v on v.version = a.version and v.is_current
    where a.user_id = auth.uid()
  );
$$;

-- "Can this user post?" = signed in, not suspended, accepted current terms.
create or replace function public.can_post()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.has_accepted_terms();
$$;

-- ---------------------------------------------------------------------
-- 5. BANDS / ARTISTS
-- ---------------------------------------------------------------------
create table public.genres (
  id   smallint generated always as identity primary key,
  name text not null unique
);
insert into public.genres (name) values
  ('BisRock'), ('Mindanao Indie'), ('Reggae'), ('Funk Rock'), ('Synthwave'),
  ('Acoustic Folk'), ('Post-Hardcore'), ('Kulintang Fusion'), ('Neo-Soul'),
  ('Garage Rock'), ('Afro-Brass & Funk'), ('Chillhop / Lo-Fi');

create table public.bands (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null unique references public.profiles (id) on delete cascade,  -- one band page per artist account
  name              text not null check (char_length(name) between 1 and 80),
  handle            text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  logo_url          text,
  banner_url        text,
  home_base         text,
  year_formed       smallint check (year_formed between 1950 and 2100),
  bio               text check (char_length(bio) <= 500),
  influences        text,
  booking_email     text,
  mobile            text,
  facebook          text,
  instagram         text,
  streaming_url     text,
  open_for_bookings boolean not null default true,
  allow_downloads   boolean not null default false,  -- default for new tracks
  monthly_listeners integer not null default 0,      -- system-controlled
  is_verified       boolean not null default false,  -- moderator-controlled
  is_hidden         boolean not null default false,  -- moderator-controlled
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger bands_updated_at before update on public.bands
  for each row execute function public.set_updated_at();

create or replace function public.owns_band(p_band_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bands b where b.id = p_band_id and b.owner_id = auth.uid());
$$;

create or replace function public.check_band_owner_is_artist()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.owner_id and p.role = 'artist') then
    raise exception 'Only artist accounts can own a band page';
  end if;
  if not public.is_moderator() then
    if tg_op = 'INSERT' then
      new.is_verified := false; new.is_hidden := false; new.monthly_listeners := 0;
    else
      new.is_verified := old.is_verified; new.is_hidden := old.is_hidden; new.monthly_listeners := old.monthly_listeners;
    end if;
  end if;
  return new;
end $$;
create trigger bands_guard before insert or update on public.bands
  for each row execute function public.check_band_owner_is_artist();

create table public.band_genres (
  band_id  uuid not null references public.bands (id) on delete cascade,
  genre_id smallint not null references public.genres (id) on delete cascade,
  primary key (band_id, genre_id)
);

create or replace function public.limit_band_genres()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.band_genres where band_id = new.band_id) >= 3 then
    raise exception 'A band can have at most 3 genres';
  end if;
  return new;
end $$;
create trigger band_genres_limit before insert on public.band_genres
  for each row execute function public.limit_band_genres();

create table public.band_members (
  id         uuid primary key default gen_random_uuid(),
  band_id    uuid not null references public.bands (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  role       text,
  profile_id uuid references public.profiles (id) on delete set null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index band_members_band_idx on public.band_members (band_id);

create table public.band_photos (
  id         uuid primary key default gen_random_uuid(),
  band_id    uuid not null references public.bands (id) on delete cascade,
  image_url  text not null,
  title      text,
  tag        text,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index band_photos_band_idx on public.band_photos (band_id);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  band_id     uuid not null references public.bands (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, band_id)
);
create index follows_band_idx on public.follows (band_id);

create table public.band_reviews (
  id         uuid primary key default gen_random_uuid(),
  band_id    uuid not null references public.bands (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  message    text not null check (char_length(message) between 1 and 1000),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (band_id, author_id)
);

-- ---------------------------------------------------------------------
-- 6. MUSIC: tracks (max 3 per band), playlists
-- ---------------------------------------------------------------------
create table public.tracks (
  id             uuid primary key default gen_random_uuid(),
  band_id        uuid not null references public.bands (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 120),
  audio_path     text not null,          -- path inside the "tracks" storage bucket
  cover_url      text,
  duration_sec   integer check (duration_sec > 0),
  file_size      bigint,
  format         text check (format in ('mp3', 'wav')),
  genre_id       smallint references public.genres (id),
  lyrics_snippet text,
  allow_download boolean not null default false,  -- artist's choice (Terms §3)
  play_count     integer not null default 0,      -- system-controlled
  is_hidden      boolean not null default false,  -- moderator-controlled
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tracks_band_idx on public.tracks (band_id);
create trigger tracks_updated_at before update on public.tracks
  for each row execute function public.set_updated_at();

create or replace function public.tracks_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.tracks where band_id = new.band_id) >= 3 then
    raise exception 'Upload limit reached: a band can upload at most 3 tracks for now';
  end if;
  if not public.is_moderator() then
    if tg_op = 'INSERT' then
      new.play_count := 0; new.is_hidden := false;
    else
      new.play_count := old.play_count; new.is_hidden := old.is_hidden;
    end if;
  end if;
  return new;
end $$;
create trigger tracks_guard before insert or update on public.tracks
  for each row execute function public.tracks_guard();

-- Call from the app when a song starts playing: select public.record_play('<track id>');
create or replace function public.record_play(p_track_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.tracks set play_count = play_count + 1 where id = p_track_id and not is_hidden;
$$;

create table public.playlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text,
  cover_url   text,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index playlists_owner_idx on public.playlists (owner_id);
create trigger playlists_updated_at before update on public.playlists
  for each row execute function public.set_updated_at();

create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  position    integer not null default 0,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

-- ---------------------------------------------------------------------
-- 7. GIGS
-- ---------------------------------------------------------------------
create table public.gigs (
  id              uuid primary key default gen_random_uuid(),
  band_id         uuid not null references public.bands (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 150),
  supporting_acts text[] not null default '{}',
  venue           text not null,
  address         text,
  district        text,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  door_charge     text,  -- e.g. '₱250 (includes 1 beer)' or 'Free admission'
  status          public.gig_status not null default 'confirmed',
  poster_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index gigs_starts_idx on public.gigs (starts_at);
create index gigs_band_idx on public.gigs (band_id);
create trigger gigs_updated_at before update on public.gigs
  for each row execute function public.set_updated_at();

create table public.gig_rsvps (
  gig_id     uuid not null references public.gigs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (gig_id, user_id)
);
create index gig_rsvps_user_idx on public.gig_rsvps (user_id);

-- RSVP totals without exposing who is going (respects "Show my gig RSVPs").
create or replace function public.gig_rsvp_counts()
returns table (gig_id uuid, rsvp_count bigint)
language sql stable security definer set search_path = '' as $$
  select r.gig_id, count(*) from public.gig_rsvps r group by r.gig_id;
$$;

-- ---------------------------------------------------------------------
-- 8. CONNECT FEED: posts, tags, comments, reactions
-- ---------------------------------------------------------------------
create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade,
  content      text not null check (char_length(content) between 1 and 2000),
  image_url    text,
  venue_tag    text,
  district_tag text,
  is_hidden    boolean not null default false,  -- set when a report is upheld
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);
create index posts_author_idx on public.posts (author_id);
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create table public.post_band_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  band_id uuid not null references public.bands (id) on delete cascade,
  primary key (post_id, band_id)
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 1000),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

create table public.post_reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  reaction   public.reaction_type not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);

-- ---------------------------------------------------------------------
-- 9. GEAR EXCHANGE: listings + photos (max 5)
-- ---------------------------------------------------------------------
create table public.listings (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid not null references public.profiles (id) on delete cascade,
  band_id        uuid references public.bands (id) on delete set null,  -- when listed as a band
  title          text not null check (char_length(title) between 3 and 150),
  category       public.gear_category not null,
  deal_type      public.deal_type not null,
  condition      public.gear_condition not null,
  price          numeric(12, 2) check (price >= 0),  -- PHP; budget for looking_to_buy; may be null for trade-only
  trade_wishlist text,
  description    text check (char_length(description) <= 2000),
  specs          text[] not null default '{}',
  district       text,
  status         public.listing_status not null default 'active',
  is_hidden      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (deal_type = 'for_trade' or price is not null),
  check (cardinality(specs) <= 6)
);
create index listings_feed_idx on public.listings (status, created_at desc);
create index listings_seller_idx on public.listings (seller_id);
-- Full-text search for the Deals search bar:
--   .textSearch('search', 'marshall amp', { type: 'websearch' })
alter table public.listings add column search tsvector
  generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(district, '') || ' ' || coalesce(trade_wishlist, ''))
  ) stored;
create index listings_search_idx on public.listings using gin (search);
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

create table public.listing_photos (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  image_path text not null,  -- path inside the "gear-photos" bucket
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);
create index listing_photos_listing_idx on public.listing_photos (listing_id);

create or replace function public.limit_listing_photos()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.listing_photos where listing_id = new.listing_id) >= 5 then
    raise exception 'A listing can have at most 5 photos';
  end if;
  return new;
end $$;
create trigger listing_photos_limit before insert on public.listing_photos
  for each row execute function public.limit_listing_photos();

-- ---------------------------------------------------------------------
-- 10. SPONSORED SPOTLIGHT (ads on Home / Deals)
-- ---------------------------------------------------------------------
create table public.sponsored_deals (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  tagline      text,
  sponsor_name text not null,
  badge        text,
  image_url    text,
  cta_text     text not null default 'Learn More',
  promo_code   text,
  details      text,
  deal_url     text,
  is_active    boolean not null default true,
  starts_at    timestamptz,
  ends_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 11. "Hidden by moderators" protection for user content
-- ---------------------------------------------------------------------
create or replace function public.protect_is_hidden()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_moderator() then
    if tg_op = 'INSERT' then new.is_hidden := false; else new.is_hidden := old.is_hidden; end if;
  end if;
  return new;
end $$;
create trigger posts_protect_hidden       before insert or update on public.posts        for each row execute function public.protect_is_hidden();
create trigger comments_protect_hidden    before insert or update on public.comments     for each row execute function public.protect_is_hidden();
create trigger listings_protect_hidden    before insert or update on public.listings     for each row execute function public.protect_is_hidden();
create trigger band_reviews_protect_hidden before insert or update on public.band_reviews for each row execute function public.protect_is_hidden();
create trigger band_photos_protect_hidden before insert or update on public.band_photos  for each row execute function public.protect_is_hidden();

-- ---------------------------------------------------------------------
-- 12. REPORTS & MODERATION (enforces the Terms of Agreement)
-- ---------------------------------------------------------------------
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  target_type     public.report_target not null,
  target_id       uuid not null,
  reason          public.report_reason not null,
  details         text check (char_length(details) <= 1000),
  status          public.report_status not null default 'open',
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)  -- one report per person per item
);
create index reports_queue_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_type, target_id);
comment on table public.reports is 'User reports (Report button). Setting status = removed hides the reported content automatically.';

create or replace function public.reports_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- reporters cannot pre-resolve their own report
    new.status := 'open'; new.reviewed_by := null; new.reviewed_at := null; new.resolution_note := null;
  elsif new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end $$;
create trigger reports_guard before insert or update on public.reports
  for each row execute function public.reports_guard();

-- When a moderator upholds a report (status → removed), hide the content.
-- When it is set back (e.g. on appeal), unhide it.
create or replace function public.apply_report_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_hide boolean;
begin
  if new.status = old.status or new.status not in ('removed', 'dismissed') then
    return new;
  end if;
  v_hide := new.status = 'removed';
  case new.target_type
    when 'post'    then update public.posts        set is_hidden = v_hide where id = new.target_id;
    when 'comment' then update public.comments     set is_hidden = v_hide where id = new.target_id;
    when 'listing' then update public.listings     set is_hidden = v_hide where id = new.target_id;
    when 'track'   then update public.tracks       set is_hidden = v_hide where id = new.target_id;
    when 'band'    then update public.bands        set is_hidden = v_hide where id = new.target_id;
    when 'review'  then update public.band_reviews set is_hidden = v_hide where id = new.target_id;
    when 'profile' then update public.profiles     set is_suspended = v_hide where id = new.target_id;
  end case;
  return new;
end $$;
create trigger reports_apply_decision after update of status on public.reports
  for each row execute function public.apply_report_decision();

-- ---------------------------------------------------------------------
-- 13. HANDY VIEWS (run with the caller's permissions)
-- ---------------------------------------------------------------------
create view public.post_reaction_counts with (security_invoker = on) as
  select post_id,
         count(*) filter (where reaction = 'rock')   as rock,
         count(*) filter (where reaction = 'fire')   as fire,
         count(*) filter (where reaction = 'orchid') as orchid,
         count(*) filter (where reaction = 'durian') as durian,
         count(*)                                    as total
  from public.post_reactions group by post_id;

create view public.band_follower_counts with (security_invoker = on) as
  select band_id, count(*) as followers from public.follows group by band_id;

-- ---------------------------------------------------------------------
-- 14. ROW LEVEL SECURITY
--   Public content is readable by everyone; hidden content only by its
--   owner and moderators. You can only change your own rows. Creating
--   content requires an active account that accepted the current Terms.
-- ---------------------------------------------------------------------
alter table public.moderators        enable row level security;
alter table public.profiles          enable row level security;
alter table public.terms_versions    enable row level security;
alter table public.terms_acceptances enable row level security;
alter table public.genres            enable row level security;
alter table public.bands             enable row level security;
alter table public.band_genres       enable row level security;
alter table public.band_members      enable row level security;
alter table public.band_photos       enable row level security;
alter table public.follows           enable row level security;
alter table public.band_reviews      enable row level security;
alter table public.tracks            enable row level security;
alter table public.playlists         enable row level security;
alter table public.playlist_tracks   enable row level security;
alter table public.gigs              enable row level security;
alter table public.gig_rsvps         enable row level security;
alter table public.posts             enable row level security;
alter table public.post_band_tags    enable row level security;
alter table public.comments          enable row level security;
alter table public.post_reactions    enable row level security;
alter table public.listings          enable row level security;
alter table public.listing_photos    enable row level security;
alter table public.sponsored_deals   enable row level security;
alter table public.reports           enable row level security;

-- moderators
create policy "moderators: moderators can see list" on public.moderators
  for select to authenticated using (public.is_moderator());

-- profiles
create policy "profiles: visible unless suspended" on public.profiles
  for select using (not is_suspended or id = (select auth.uid()) or public.is_moderator());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid()) or public.is_moderator())
  with check (id = (select auth.uid()) or public.is_moderator());

-- terms
create policy "terms_versions: readable by all" on public.terms_versions for select using (true);
create policy "terms_acceptances: read own" on public.terms_acceptances
  for select to authenticated using (user_id = (select auth.uid()) or public.is_moderator());
create policy "terms_acceptances: accept for yourself" on public.terms_acceptances
  for insert to authenticated with check (user_id = (select auth.uid()));

-- genres
create policy "genres: readable by all" on public.genres for select using (true);
create policy "genres: moderators manage" on public.genres for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- bands
create policy "bands: visible unless hidden" on public.bands
  for select using (not is_hidden or owner_id = (select auth.uid()) or public.is_moderator());
create policy "bands: artist creates own" on public.bands
  for insert to authenticated with check (owner_id = (select auth.uid()) and public.can_post());
create policy "bands: owner updates" on public.bands
  for update to authenticated using (owner_id = (select auth.uid()) or public.is_moderator())
  with check (owner_id = (select auth.uid()) or public.is_moderator());
create policy "bands: owner deletes" on public.bands
  for delete to authenticated using (owner_id = (select auth.uid()));

-- band children (genres, members, photos): readable by all, managed by band owner
create policy "band_genres: readable by all" on public.band_genres for select using (true);
create policy "band_genres: owner manages" on public.band_genres for all to authenticated
  using (public.owns_band(band_id)) with check (public.owns_band(band_id));

create policy "band_members: readable by all" on public.band_members for select using (true);
create policy "band_members: owner manages" on public.band_members for all to authenticated
  using (public.owns_band(band_id)) with check (public.owns_band(band_id));

create policy "band_photos: visible unless hidden" on public.band_photos
  for select using (not is_hidden or public.owns_band(band_id) or public.is_moderator());
create policy "band_photos: owner adds" on public.band_photos
  for insert to authenticated with check (public.owns_band(band_id) and public.can_post());
create policy "band_photos: owner edits" on public.band_photos
  for update to authenticated using (public.owns_band(band_id) or public.is_moderator())
  with check (public.owns_band(band_id) or public.is_moderator());
create policy "band_photos: owner deletes" on public.band_photos
  for delete to authenticated using (public.owns_band(band_id));

-- follows
create policy "follows: readable by all" on public.follows for select using (true);
create policy "follows: follow as yourself" on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "follows: unfollow as yourself" on public.follows
  for delete to authenticated using (follower_id = (select auth.uid()));

-- band reviews (fan testimonials)
create policy "band_reviews: visible unless hidden" on public.band_reviews
  for select using (not is_hidden or author_id = (select auth.uid()) or public.is_moderator());
create policy "band_reviews: write own" on public.band_reviews
  for insert to authenticated with check (author_id = (select auth.uid()) and public.can_post());
create policy "band_reviews: edit own" on public.band_reviews
  for update to authenticated using (author_id = (select auth.uid()) or public.is_moderator())
  with check (author_id = (select auth.uid()) or public.is_moderator());
create policy "band_reviews: delete own" on public.band_reviews
  for delete to authenticated using (author_id = (select auth.uid()) or public.is_moderator());

-- tracks
create policy "tracks: visible unless hidden" on public.tracks
  for select using (not is_hidden or public.owns_band(band_id) or public.is_moderator());
create policy "tracks: band owner uploads" on public.tracks
  for insert to authenticated with check (public.owns_band(band_id) and public.can_post());
create policy "tracks: band owner edits" on public.tracks
  for update to authenticated using (public.owns_band(band_id) or public.is_moderator())
  with check (public.owns_band(band_id) or public.is_moderator());
create policy "tracks: band owner deletes" on public.tracks
  for delete to authenticated using (public.owns_band(band_id));

-- playlists
create policy "playlists: public or own" on public.playlists
  for select using (
    owner_id = (select auth.uid())
    or (is_public and exists (select 1 from public.profiles p where p.id = owner_id and p.show_playlists))
  );
create policy "playlists: manage own" on public.playlists for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "playlist_tracks: follow playlist visibility" on public.playlist_tracks
  for select using (exists (select 1 from public.playlists pl where pl.id = playlist_id));  -- inherits playlists RLS
create policy "playlist_tracks: owner manages" on public.playlist_tracks for all to authenticated
  using (exists (select 1 from public.playlists pl where pl.id = playlist_id and pl.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.playlists pl where pl.id = playlist_id and pl.owner_id = (select auth.uid())));

-- gigs
create policy "gigs: readable by all" on public.gigs for select using (true);
create policy "gigs: band owner manages" on public.gigs for all to authenticated
  using (public.owns_band(band_id)) with check (public.owns_band(band_id) and public.is_active_user());

-- gig RSVPs (individual RSVPs only visible to yourself, or if you chose to show them)
create policy "gig_rsvps: own or shown" on public.gig_rsvps
  for select using (
    user_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = user_id and p.show_rsvps)
  );
create policy "gig_rsvps: rsvp as yourself" on public.gig_rsvps
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_active_user());
create policy "gig_rsvps: cancel own" on public.gig_rsvps
  for delete to authenticated using (user_id = (select auth.uid()));

-- posts
create policy "posts: visible unless hidden" on public.posts
  for select using (not is_hidden or author_id = (select auth.uid()) or public.is_moderator());
create policy "posts: create own" on public.posts
  for insert to authenticated with check (author_id = (select auth.uid()) and public.can_post());
create policy "posts: edit own" on public.posts
  for update to authenticated using (author_id = (select auth.uid()) or public.is_moderator())
  with check (author_id = (select auth.uid()) or public.is_moderator());
create policy "posts: delete own" on public.posts
  for delete to authenticated using (author_id = (select auth.uid()) or public.is_moderator());

create policy "post_band_tags: readable by all" on public.post_band_tags for select using (true);
create policy "post_band_tags: post author manages" on public.post_band_tags for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));

-- comments
create policy "comments: visible unless hidden" on public.comments
  for select using (not is_hidden or author_id = (select auth.uid()) or public.is_moderator());
create policy "comments: create own" on public.comments
  for insert to authenticated with check (author_id = (select auth.uid()) and public.can_post());
create policy "comments: edit own" on public.comments
  for update to authenticated using (author_id = (select auth.uid()) or public.is_moderator())
  with check (author_id = (select auth.uid()) or public.is_moderator());
create policy "comments: delete own" on public.comments
  for delete to authenticated using (author_id = (select auth.uid()) or public.is_moderator());

-- reactions
create policy "post_reactions: readable by all" on public.post_reactions for select using (true);
create policy "post_reactions: react as yourself" on public.post_reactions
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_active_user());
create policy "post_reactions: remove own" on public.post_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- listings
create policy "listings: visible unless hidden" on public.listings
  for select using (not is_hidden or seller_id = (select auth.uid()) or public.is_moderator());
create policy "listings: post own deal" on public.listings
  for insert to authenticated with check (
    seller_id = (select auth.uid()) and public.can_post()
    and (band_id is null or public.owns_band(band_id))
  );
create policy "listings: edit own" on public.listings
  for update to authenticated using (seller_id = (select auth.uid()) or public.is_moderator())
  with check (seller_id = (select auth.uid()) or public.is_moderator());
create policy "listings: delete own" on public.listings
  for delete to authenticated using (seller_id = (select auth.uid()) or public.is_moderator());

create policy "listing_photos: readable with listing" on public.listing_photos
  for select using (exists (select 1 from public.listings l where l.id = listing_id));  -- inherits listings RLS
create policy "listing_photos: seller manages" on public.listing_photos for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));

-- sponsored deals
create policy "sponsored_deals: active readable by all" on public.sponsored_deals
  for select using (
    (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
    or public.is_moderator()
  );
create policy "sponsored_deals: moderators manage" on public.sponsored_deals for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- reports
create policy "reports: file a report" on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()) and public.is_active_user());
create policy "reports: see own or all if moderator" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or public.is_moderator());
create policy "reports: moderators review" on public.reports
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());
create policy "reports: withdraw own open report" on public.reports
  for delete to authenticated using (reporter_id = (select auth.uid()) and status = 'open');

-- ---------------------------------------------------------------------
-- 15. STORAGE BUCKETS + POLICIES
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',     'avatars',     true,   5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('banners',     'banners',     true,   8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('band-photos', 'band-photos', true,   8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('post-images', 'post-images', true,   8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('gear-photos', 'gear-photos', true,   8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('tracks',      'tracks',      false, 52428800, array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'])
on conflict (id) do nothing;

-- Images: anyone can view.
create policy "minaw: public images readable" on storage.objects
  for select using (bucket_id in ('avatars', 'banners', 'band-photos', 'post-images', 'gear-photos'));

-- Tracks: private bucket; the app streams/downloads them through signed URLs
-- (supabase.storage.from('tracks').createSignedUrl(path, 3600)).
-- Only show a Download button when tracks.allow_download is true.
create policy "minaw: tracks readable for streaming" on storage.objects
  for select using (bucket_id = 'tracks');

-- Uploads: only into your own folder (<user_id>/...), only if you may post.
create policy "minaw: upload to own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id in ('avatars', 'banners', 'band-photos', 'post-images', 'gear-photos', 'tracks')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (bucket_id in ('avatars', 'banners') or public.can_post())
  );
create policy "minaw: update own files" on storage.objects
  for update to authenticated using (
    bucket_id in ('avatars', 'banners', 'band-photos', 'post-images', 'gear-photos', 'tracks')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "minaw: delete own files" on storage.objects
  for delete to authenticated using (
    bucket_id in ('avatars', 'banners', 'band-photos', 'post-images', 'gear-photos', 'tracks')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
