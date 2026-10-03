-- Update 12: fans can like and comment on songs.
-- (Run after: alter type public.report_target add value 'track_comment'; and the notifications type list update.)

create table if not exists public.track_likes (
  track_id   uuid not null references public.tracks(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (track_id, user_id)
);
create index if not exists track_likes_user_idx on public.track_likes (user_id);
alter table public.track_likes enable row level security;
create policy "track_likes: anyone can see" on public.track_likes for select using (true);
create policy "track_likes: like as yourself" on public.track_likes for insert with check (user_id = (select auth.uid()) and private.is_active_user());
create policy "track_likes: unlike your own" on public.track_likes for delete using (user_id = (select auth.uid()));

create table if not exists public.track_comments (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references public.tracks(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 1000),
  is_hidden  boolean not null default false,
  edited_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists track_comments_track_idx on public.track_comments (track_id, created_at);
create index if not exists track_comments_author_idx on public.track_comments (author_id, created_at desc);
alter table public.track_comments enable row level security;
create policy "track_comments: visible unless hidden" on public.track_comments for select
  using ((not is_hidden) or author_id = (select auth.uid()) or private.is_moderator());
create policy "track_comments: write own" on public.track_comments for insert
  with check (author_id = (select auth.uid()) and private.can_post());
create policy "track_comments: edit own" on public.track_comments for update
  using (author_id = (select auth.uid()) or private.is_moderator())
  with check (author_id = (select auth.uid()) or private.is_moderator());
create policy "track_comments: remove own" on public.track_comments for delete
  using (author_id = (select auth.uid()) or private.is_moderator());
create or replace trigger track_comments_protect_hidden before insert or update on public.track_comments for each row execute function public.protect_is_hidden();
create or replace trigger track_comments_mark_edited before update on public.track_comments for each row execute function public.mark_edited();

-- same anti-spam rules as post comments
create or replace function public.track_comments_spam_guard()
returns trigger language plpgsql set search_path = '' as $$
declare n int;
begin
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then return new; end if;
  select count(*) into n from (
    select c.author_id from public.track_comments c where c.track_id = new.track_id order by c.created_at desc limit 3
  ) last3 where last3.author_id = new.author_id;
  if n >= 3 and exists (select 1 from public.track_comments where track_id = new.track_id and author_id = new.author_id
                        and created_at > now() - interval '10 minutes') then
    raise exception 'You’ve commented 3 times in a row. Wait for someone else to comment, or try again in 10 minutes.';
  end if;
  select count(*) into n from public.track_comments where author_id = new.author_id and created_at > now() - interval '5 minutes';
  if n >= 10 then raise exception 'Slow down: you can comment up to 10 times every 5 minutes.'; end if;
  if exists (select 1 from public.track_comments where author_id = new.author_id and track_id = new.track_id
             and created_at > now() - interval '24 hours' and lower(btrim(content)) = lower(btrim(new.content))) then
    raise exception 'You already posted this comment. Please don’t post the same comment twice.';
  end if;
  return new;
end $$;
create or replace trigger track_comments_spam_guard before insert on public.track_comments for each row execute function public.track_comments_spam_guard();

-- ---------------------------------------------------------------- notifications for the band owner (+ @tags)
alter table public.notifications add column if not exists track_id uuid references public.tracks(id) on delete cascade;

create or replace function private.notify_track(p_user uuid, p_actor uuid, p_type text, p_track uuid, p_band uuid, p_snippet text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if exists (select 1 from public.notifications n where n.user_id = p_user and n.actor_id is not distinct from p_actor
             and n.type = p_type and n.track_id is not distinct from p_track and n.created_at > now() - interval '1 day') then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, band_id, track_id, snippet)
  values (p_user, p_actor, p_type, p_band, p_track, left(p_snippet, 140));
end $$;

create or replace function public.trg_notify_track_like()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_band uuid; v_title text;
begin
  select t.band_id, t.title, b.owner_id into v_band, v_title, v_owner from public.tracks t join public.bands b on b.id = t.band_id where t.id = new.track_id;
  perform private.notify_track(v_owner, new.user_id, 'track_like', new.track_id, v_band, v_title);
  return null;
end $$;
create or replace trigger track_likes_notify after insert on public.track_likes for each row execute function public.trg_notify_track_like();

create or replace function public.trg_notify_track_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_band uuid; r record;
begin
  select t.band_id, b.owner_id into v_band, v_owner from public.tracks t join public.bands b on b.id = t.band_id where t.id = new.track_id;
  perform private.notify_track(v_owner, new.author_id, 'track_comment', new.track_id, v_band, new.content);
  for r in
    select distinct p.id from public.profiles p
    where p.username in (select (regexp_matches(lower(new.content), '(?:^|[^a-z0-9_@])@([a-z0-9_]{3,30})', 'g'))[1])
  loop
    if r.id is distinct from v_owner then
      perform private.notify_track(r.id, new.author_id, 'mention_track_comment', new.track_id, v_band, new.content);
    end if;
  end loop;
  return null;
end $$;
create or replace trigger track_comments_notify after insert on public.track_comments for each row execute function public.trg_notify_track_comment();

-- ---------------------------------------------------------------- reports on song comments
create or replace function public.apply_report_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_hide boolean;
  v_other_removed boolean;
begin
  if new.status = old.status or new.status not in ('removed', 'dismissed') then return new; end if;
  if new.status = 'dismissed' then
    if old.status is distinct from 'removed' then return new; end if;
    select exists (select 1 from public.reports r where r.target_type = new.target_type and r.target_id = new.target_id
                   and r.id <> new.id and r.status = 'removed') into v_other_removed;
    if v_other_removed then return new; end if;
    v_hide := false;
  else
    v_hide := true;
  end if;
  case new.target_type
    when 'post'          then update public.posts          set is_hidden = v_hide where id = new.target_id;
    when 'comment'       then update public.comments       set is_hidden = v_hide where id = new.target_id;
    when 'track_comment' then update public.track_comments set is_hidden = v_hide where id = new.target_id;
    when 'listing'       then update public.listings       set is_hidden = v_hide where id = new.target_id;
    when 'track'         then update public.tracks         set is_hidden = v_hide where id = new.target_id;
    when 'band'          then update public.bands          set is_hidden = v_hide where id = new.target_id;
    when 'review'        then update public.band_reviews   set is_hidden = v_hide where id = new.target_id;
    when 'profile' then
      if not exists (select 1 from public.moderators m where m.user_id = new.target_id) then
        update public.profiles set is_suspended = v_hide where id = new.target_id;
        update auth.users set banned_until = case when v_hide then '2999-12-31'::timestamptz else null end where id = new.target_id;
      end if;
  end case;
  return new;
end $$;
