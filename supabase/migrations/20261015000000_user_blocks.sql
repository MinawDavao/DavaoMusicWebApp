-- Update 13: block someone (until you unblock) or hide your account from them for 15/30 days.
-- While active: neither person sees the other's posts or comments, the blocked person can't open the blocker's
-- profile or find them in search, and neither can comment on, react to, like, review or follow the other.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz,                       -- null = until unblocked
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);
alter table public.user_blocks enable row level security;
-- only the person who blocked can see or change their blocks (the blocked person is never told)
create policy "user_blocks: see own" on public.user_blocks for select using (blocker_id = (select auth.uid()));
create policy "user_blocks: add own" on public.user_blocks for insert with check (blocker_id = (select auth.uid()));
create policy "user_blocks: change own" on public.user_blocks for update using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));
create policy "user_blocks: remove own" on public.user_blocks for delete using (blocker_id = (select auth.uid()));

-- active block in either direction between two people
create or replace function private.blocked_pair(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select a is not null and b is not null and exists (
    select 1 from public.user_blocks k
     where ((k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a))
       and (k.expires_at is null or k.expires_at > now()));
$$;
-- between me and someone else (moderators are never blocked from anything)
create or replace function private.blocked_with(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.is_moderator() and private.blocked_pair((select auth.uid()), other);
$$;
-- has this person blocked me?
create or replace function private.blocked_by(owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not private.is_moderator() and exists (
    select 1 from public.user_blocks k where k.blocker_id = owner and k.blocked_id = (select auth.uid())
       and (k.expires_at is null or k.expires_at > now()));
$$;

-- ---------------------------------------------------------------- who can see what
alter policy "posts: visible unless hidden" on public.posts
  using (((not is_hidden) and not private.blocked_with(author_id)) or author_id = (select auth.uid()) or private.is_moderator());
alter policy "comments: visible unless hidden" on public.comments
  using (((not is_hidden) and not private.blocked_with(author_id)) or author_id = (select auth.uid()) or private.is_moderator());
alter policy "track_comments: visible unless hidden" on public.track_comments
  using (((not is_hidden) and not private.blocked_with(author_id)) or author_id = (select auth.uid()) or private.is_moderator());
alter policy "profiles: visible unless suspended" on public.profiles
  using (((not is_suspended) and not private.blocked_by(id)) or id = (select auth.uid()) or private.is_moderator());

-- ---------------------------------------------------------------- who can interact
-- (a blocked person can't see the post, so look up its author with the database's own rights)
create or replace function private.post_author(p uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select author_id from public.posts where id = p;
$$;
alter policy "comments: create own" on public.comments
  with check (author_id = (select auth.uid()) and private.can_post()
              and not private.blocked_with(private.post_author(post_id)));
alter policy "post_reactions: react as yourself" on public.post_reactions
  with check (user_id = (select auth.uid()) and private.is_active_user()
              and not private.blocked_with(private.post_author(post_id)));
alter policy "track_comments: write own" on public.track_comments
  with check (author_id = (select auth.uid()) and private.can_post()
              and not private.blocked_with((select b.owner_id from public.tracks t join public.bands b on b.id = t.band_id where t.id = track_id)));
alter policy "track_likes: like as yourself" on public.track_likes
  with check (user_id = (select auth.uid()) and private.is_active_user()
              and not private.blocked_with((select b.owner_id from public.tracks t join public.bands b on b.id = t.band_id where t.id = track_id)));
alter policy "user_follows: follow as yourself" on public.user_follows
  with check (follower_id = (select auth.uid()) and private.is_active_user() and not private.blocked_with(followee_id));
alter policy "follows: follow as yourself" on public.follows
  with check (follower_id = (select auth.uid()) and not private.blocked_with((select b.owner_id from public.bands b where b.id = band_id)));
alter policy "band_reviews: write own" on public.band_reviews
  with check (author_id = (select auth.uid()) and private.can_post()
              and not private.blocked_with((select b.owner_id from public.bands b where b.id = band_id)));
alter policy "venue_reviews: write own" on public.venue_reviews
  with check (author_id = (select auth.uid()) and private.can_post() and not private.blocked_with(venue_id)
              and exists (select 1 from public.profiles v where v.id = venue_id and v.role = 'venue'));

-- follows between two blocked people are hidden while the block lasts (they come back if it expires or is removed)
alter policy "user_follows: readable by all" on public.user_follows
  using (not private.blocked_pair(follower_id, followee_id));
alter policy "follows: readable by all" on public.follows
  using (not private.blocked_pair(follower_id, (select b.owner_id from public.bands b where b.id = band_id)));

-- ---------------------------------------------------------------- no notifications between blocked people
create or replace function private.notify(
  p_user uuid, p_actor uuid, p_type text, p_post uuid default null, p_band uuid default null,
  p_gig uuid default null, p_playlist uuid default null, p_snippet text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = p_actor or private.blocked_pair(p_user, p_actor) then return; end if;
  if exists (select 1 from public.notifications n
             where n.user_id = p_user and n.actor_id is not distinct from p_actor and n.type = p_type
               and n.post_id is not distinct from p_post and n.band_id is not distinct from p_band
               and n.gig_id is not distinct from p_gig and n.playlist_id is not distinct from p_playlist
               and n.created_at > now() - interval '1 day') then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, post_id, band_id, gig_id, playlist_id, snippet)
  values (p_user, p_actor, p_type, p_post, p_band, p_gig, p_playlist, left(p_snippet, 140));
end $$;

create or replace function private.notify_track(p_user uuid, p_actor uuid, p_type text, p_track uuid, p_band uuid, p_snippet text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = p_actor or private.blocked_pair(p_user, p_actor) then return; end if;
  if exists (select 1 from public.notifications n where n.user_id = p_user and n.actor_id is not distinct from p_actor
             and n.type = p_type and n.track_id is not distinct from p_track and n.created_at > now() - interval '1 day') then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, band_id, track_id, snippet)
  values (p_user, p_actor, p_type, p_band, p_track, left(p_snippet, 140));
end $$;
