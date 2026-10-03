-- Update 7: card background position/zoom + in-app notifications.

alter table public.profiles add column if not exists card_bg_crop jsonb;  -- {"x":50,"y":30,"zoom":1.2}

-- ---------------------------------------------------------------- notifications
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,   -- who receives it
  actor_id    uuid references public.profiles(id) on delete cascade,            -- who did it
  type        text not null check (type in (
                'comment', 'mention_post', 'mention_comment', 'reaction', 'follow', 'band_follow',
                'review_pending', 'review_approved', 'rsvp', 'playlist_like', 'playlist_copy', 'venue_tag')),
  post_id     uuid references public.posts(id) on delete cascade,
  band_id     uuid references public.bands(id) on delete cascade,
  gig_id      uuid references public.gigs(id) on delete cascade,
  playlist_id uuid references public.playlists(id) on delete cascade,
  snippet     text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_actor_idx on public.notifications (actor_id);
alter table public.notifications enable row level security;

create policy "notifications: read own" on public.notifications for select using (user_id = (select auth.uid()));
create policy "notifications: mark own read" on public.notifications for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: clear own" on public.notifications for delete using (user_id = (select auth.uid()));
-- No insert policy: notifications are only created by the database triggers below.

create or replace function private.notify(
  p_user uuid, p_actor uuid, p_type text, p_post uuid default null, p_band uuid default null,
  p_gig uuid default null, p_playlist uuid default null, p_snippet text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  -- one notification per person/action/item per day (keeps repeated likes or comments from flooding)
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

-- @username tags in a post or comment
create or replace function private.notify_mentions(p_text text, p_actor uuid, p_type text, p_post uuid, p_skip uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select distinct p.id from public.profiles p
    where p.username in (select (regexp_matches(lower(coalesce(p_text, '')), '(?:^|[^a-z0-9_@])@([a-z0-9_]{3,30})', 'g'))[1])
  loop
    if r.id is distinct from p_skip then
      perform private.notify(r.id, p_actor, p_type, p_post, null, null, null, p_text);
    end if;
  end loop;
end $$;

create or replace function public.trg_notify_post()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_username text;
begin
  perform private.notify_mentions(new.content, new.author_id, 'mention_post', new.id);
  if new.venue_id is not null then
    select username into v_username from public.profiles where id = new.venue_id;
    if v_username is null or position('@' || v_username in lower(new.content)) = 0 then
      perform private.notify(new.venue_id, new.author_id, 'venue_tag', new.id, null, null, null, new.content);
    end if;
  end if;
  return null;
end $$;
create or replace trigger posts_notify after insert on public.posts for each row execute function public.trg_notify_post();

create or replace function public.trg_notify_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  perform private.notify(v_author, new.author_id, 'comment', new.post_id, null, null, null, new.content);
  perform private.notify_mentions(new.content, new.author_id, 'mention_comment', new.post_id, v_author);
  return null;
end $$;
create or replace trigger comments_notify after insert on public.comments for each row execute function public.trg_notify_comment();

create or replace function public.trg_notify_reaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid; v_text text;
begin
  select author_id, content into v_author, v_text from public.posts where id = new.post_id;
  perform private.notify(v_author, new.user_id, 'reaction', new.post_id, null, null, null, v_text);
  return null;
end $$;
create or replace trigger post_reactions_notify after insert on public.post_reactions for each row execute function public.trg_notify_reaction();

create or replace function public.trg_notify_user_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(new.followee_id, new.follower_id, 'follow');
  return null;
end $$;
create or replace trigger user_follows_notify after insert on public.user_follows for each row execute function public.trg_notify_user_follow();

create or replace function public.trg_notify_band_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_name text;
begin
  select owner_id, name into v_owner, v_name from public.bands where id = new.band_id;
  perform private.notify(v_owner, new.follower_id, 'band_follow', null, new.band_id, null, null, v_name);
  return null;
end $$;
create or replace trigger follows_notify after insert on public.follows for each row execute function public.trg_notify_band_follow();

create or replace function public.trg_notify_band_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.bands where id = new.band_id;
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending' or old.message is distinct from new.message) then
    perform private.notify(v_owner, new.author_id, 'review_pending', null, new.band_id, null, null, new.message);
  elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status is distinct from 'approved' then
    perform private.notify(new.author_id, v_owner, 'review_approved', null, new.band_id, null, null, new.message);
  end if;
  return null;
end $$;
create or replace trigger band_reviews_notify after insert or update on public.band_reviews for each row execute function public.trg_notify_band_review();

create or replace function public.trg_notify_venue_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending' or old.message is distinct from new.message) then
    perform private.notify(new.venue_id, new.author_id, 'review_pending', null, null, null, null, new.message);
  elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status is distinct from 'approved' then
    perform private.notify(new.author_id, new.venue_id, 'review_approved', null, null, null, null, new.message);
  end if;
  return null;
end $$;
create or replace trigger venue_reviews_notify after insert or update on public.venue_reviews for each row execute function public.trg_notify_venue_review();

create or replace function public.trg_notify_rsvp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_band uuid; v_title text;
begin
  select g.band_id, g.title, b.owner_id into v_band, v_title, v_owner
    from public.gigs g join public.bands b on b.id = g.band_id where g.id = new.gig_id;
  perform private.notify(v_owner, new.user_id, 'rsvp', null, v_band, new.gig_id, null, v_title);
  return null;
end $$;
create or replace trigger gig_rsvps_notify after insert on public.gig_rsvps for each row execute function public.trg_notify_rsvp();

create or replace function public.trg_notify_playlist_like()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_name text;
begin
  select owner_id, name into v_owner, v_name from public.playlists where id = new.playlist_id;
  perform private.notify(v_owner, new.user_id, 'playlist_like', null, null, null, new.playlist_id, v_name);
  return null;
end $$;
create or replace trigger playlist_likes_notify after insert on public.playlist_likes for each row execute function public.trg_notify_playlist_like();

create or replace function public.trg_notify_playlist_copy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.copied_from is not null then
    select owner_id into v_owner from public.playlists where id = new.copied_from;
    perform private.notify(v_owner, new.owner_id, 'playlist_copy', null, null, null, new.copied_from, new.name);
  end if;
  return null;
end $$;
create or replace trigger playlists_notify after insert on public.playlists for each row execute function public.trg_notify_playlist_copy();

-- live updates for the bell
alter publication supabase_realtime add table public.notifications;
