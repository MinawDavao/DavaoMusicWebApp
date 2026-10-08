-- Bug-test fixes (October 2026)

-- 1) Chat: after an unsend / moderator removal, the inbox time + unread state follow the newest remaining message.
create or replace function private.messages_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c uuid := coalesce(new.conversation_id, old.conversation_id); l_body text; l_img text; l_sender uuid; l_at timestamptz;
begin
  if tg_op = 'INSERT' then
    update public.conversations set
      last_message_at = new.created_at,
      last_message = left(coalesce(new.body, 'Sent a photo'), 140),
      last_sender = new.sender_id,
      a_read_at = case when user_a = new.sender_id then new.created_at else a_read_at end,
      b_read_at = case when user_b = new.sender_id then new.created_at else b_read_at end
    where id = c;
  else
    select m.body, m.image_path, m.sender_id, m.created_at into l_body, l_img, l_sender, l_at
      from public.messages m where m.conversation_id = c and not m.is_hidden order by m.created_at desc limit 1;
    update public.conversations set
      last_message = case when l_at is null then null else left(coalesce(l_body, 'Sent a photo'), 140) end,
      last_sender = l_sender,
      last_message_at = coalesce(l_at, created_at)
    where id = c;
  end if;
  return null;
end $$;

-- 2) Chat: "Delete chat" no longer pretends the other person's messages were read ("Seen").
create or replace function public.chat_clear(p_conv uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversations set
    a_cleared_at = case when user_a = auth.uid() then now() else a_cleared_at end,
    b_cleared_at = case when user_b = auth.uid() then now() else b_cleared_at end
  where id = p_conv and auth.uid() in (user_a, user_b);
$$;

-- 3) Band pages: the owner's own member row can only be changed by the owner.
create or replace function private.band_members_guard() returns trigger
language plpgsql set search_path = '' as $$
declare me uuid := auth.uid(); owner uuid;
begin
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then
    return coalesce(new, old);
  end if;
  select b.owner_id into owner from public.bands b where b.id = coalesce(new.band_id, old.band_id);

  if tg_op in ('UPDATE', 'DELETE') and old.profile_id = owner and owner is distinct from me
     and (tg_op = 'DELETE' or new.profile_id is distinct from old.profile_id) then
    raise exception 'BAND_ADMIN: Only the owner can change the owner’s own member entry.';
  end if;

  if tg_op = 'DELETE' then
    if old.is_admin and owner is distinct from me and old.profile_id is distinct from me then
      raise exception 'BAND_ADMIN: Only the band page owner can remove an admin.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    new.band_id := old.band_id;
    if owner is distinct from me and old.is_admin and old.profile_id is distinct from me
       and (new.is_admin is distinct from old.is_admin or new.profile_id is distinct from old.profile_id) then
      raise exception 'BAND_ADMIN: Only the band page owner can change an admin.';
    end if;
  end if;

  if new.profile_id is null then new.is_admin := false; end if;

  if new.is_admin and (tg_op = 'INSERT' or not old.is_admin) and owner is distinct from me then
    raise exception 'BAND_ADMIN: Only the band page owner can choose admins.';
  end if;

  if new.profile_id is not null and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id) then
    if private.blocked_pair(owner, new.profile_id) or private.blocked_pair(me, new.profile_id) then
      raise exception 'BAND_ADMIN: You can’t link this account.';
    end if;
  end if;
  return new;
end $$;

-- 4) Band pages: the "owner must be an artist" check reads the owner's profile even if that owner blocked the editor.
alter function public.check_band_owner_is_artist() security definer;

-- 5) Hoop: two people can't both grab the last slot at the same moment.
create or replace function private.hoop_booking_guard() returns trigger
language plpgsql set search_path = '' as $$
declare g record; taken int;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  perform pg_advisory_xact_lock(hashtext('hoop-book-' || new.game_id::text));
  select * into g from public.hoop_games where id = new.game_id;
  if g.id is null then raise exception 'HOOP: That game doesn’t exist.'; end if;
  if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'fan') then
    raise exception 'HOOP: Sunday Hoop Method is for individual (Fan) accounts only.';
  end if;
  if not private.is_moderator() then
    new.team := null; new.paid := false; new.paid_at := null;
    if g.session_id is not null then raise exception 'HOOP: Book the main schedule instead.'; end if;
    if g.status <> 'scheduled' then raise exception 'HOOP: Booking is closed for this game.'; end if;
    if g.starts_at < now() then raise exception 'HOOP: This game already started.'; end if;
    select count(*) into taken from public.hoop_game_players where game_id = new.game_id;
    if taken >= g.slots then raise exception 'HOOP: Sorry, this game is full.'; end if;
  end if;
  new.booked_at := now();
  perform private.hoop_ensure_player(new.profile_id);
  return new;
end $$;

-- 6) Hoop: the game clock starts on the server's time (not the admin phone's), so every phone shows the same time.
create or replace function private.hoop_clock_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.clock_running and (not old.clock_running or new.clock_started_at is distinct from old.clock_started_at) then
    new.clock_started_at := now();
  end if;
  return new;
end $$;
create or replace trigger hoop_clock_guard before update of clock_running, clock_started_at on public.hoop_games
  for each row execute function private.hoop_clock_guard();

create or replace function public.hoop_now() returns timestamptz
language sql stable set search_path = '' as $$ select now(); $$;
grant execute on function public.hoop_now() to authenticated;

-- 7) Hoop: full rows in live updates (so reopening / deleting games refreshes screens correctly).
alter table public.hoop_games replica identity full;

-- 8) Indexes for faster deletes / lookups.
create index if not exists notifications_post_idx on public.notifications (post_id);
create index if not exists notifications_band_idx on public.notifications (band_id);
create index if not exists notifications_track_idx on public.notifications (track_id);
create index if not exists hoop_props_author_idx on public.hoop_props (author_id);

-- 9) Names with no letters/numbers (only symbols or non-Latin script) don't collide with each other.
create unique index if not exists bands_name_norm_uniq2 on public.bands (private.norm_name(name)) where private.norm_name(name) <> '';
create unique index if not exists venues_name_norm_uniq2 on public.profiles (private.norm_name(display_name)) where role = 'venue' and private.norm_name(display_name) <> '';
drop index if exists public.bands_name_norm_uniq;
drop index if exists public.venues_name_norm_uniq;
alter index public.bands_name_norm_uniq2 rename to bands_name_norm_uniq;
alter index public.venues_name_norm_uniq2 rename to venues_name_norm_uniq;
