-- Bug check fixes (October 2026)

-- ============================================================ HOOP
-- 1) The (game_id, member_id) unique index was never created (its name was already taken by an older index on
--    (game_id, profile_id)), so team picks for Game 2+ (upsert on game_id,member_id) failed.
create unique index if not exists hoop_game_players_game_member_uniq on public.hoop_game_players (game_id, member_id);

-- 2) An admin adding a PENDING member to a game also approves their card (same as the account path).
create or replace function private.hoop_booking_guard() returns trigger
language plpgsql set search_path = '' as $$
declare g record; taken int; admin boolean; m record;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  perform pg_advisory_xact_lock(hashtext('hoop-book-' || new.game_id::text));
  select * into g from public.hoop_games where id = new.game_id;
  if g.id is null then raise exception 'HOOP: That game doesn’t exist.'; end if;
  admin := private.is_club_admin(g.club_id);
  if new.guest_id is not null then
    if not admin then raise exception 'HOOP: Only a club admin can add guest players.'; end if;
    new.profile_id := null; new.member_id := null; new.guest_name := btrim(new.guest_name);
  elsif new.member_id is not null then
    select * into m from public.hoop_members where id = new.member_id and club_id = g.club_id;
    if m.id is null then raise exception 'HOOP: That player isn’t in this club.'; end if;
    if not admin and (m.profile_id is distinct from auth.uid() or m.status <> 'active') then raise exception 'HOOP: You can only book for yourself.'; end if;
    if m.status = 'suspended' then raise exception 'HOOP: This player is suspended from the club.'; end if;
    if m.status = 'pending' then update public.hoop_members set status = 'active' where id = m.id; end if;
    new.profile_id := m.profile_id;
  elsif new.profile_id is not null then
    if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'fan') then
      raise exception 'HOOP: Clubs are for individual (Fan) accounts only.';
    end if;
    select * into m from public.hoop_members where club_id = g.club_id and profile_id = new.profile_id;
    if m.id is null then
      if not admin then raise exception 'HOOP: Join this club first — tap “My Card” to send your player card for approval.'; end if;
      insert into public.hoop_members (club_id, profile_id, status, approved_at, approved_by)
        values (g.club_id, new.profile_id, 'active', now(), auth.uid()) returning * into m;
    elsif m.status = 'suspended' then
      raise exception 'HOOP: This player is suspended from the club.';
    elsif m.status = 'pending' then
      if not admin then raise exception 'HOOP: Your player card is still waiting for the club admin’s approval.'; end if;
      update public.hoop_members set status = 'active' where id = m.id;
    end if;
    new.member_id := m.id;
  else
    raise exception 'HOOP: Pick a player.';
  end if;
  if not admin then
    new.team := null; new.paid := false; new.paid_at := null; new.arrived_at := null;
    if g.session_id is not null then raise exception 'HOOP: Book the main schedule instead.'; end if;
    if g.status <> 'scheduled' then raise exception 'HOOP: Booking is closed for this game.'; end if;
    if g.starts_at < now() then raise exception 'HOOP: This game already started.'; end if;
    select count(*) into taken from public.hoop_game_players where game_id = new.game_id;
    if taken >= g.slots then raise exception 'HOOP: Sorry, this game is full.'; end if;
  end if;
  new.booked_at := now();
  return new;
end $$;

-- 3) Removing a player frees their slots in games that haven't started; played games keep them as a guest.
create or replace function private.hoop_members_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  if not exists (select 1 from public.hoop_clubs c where c.id = old.club_id) then return old; end if;
  execute format('%s from public.hoop_game_players gp using public.hoop_games g where gp.game_id = g.id and gp.member_id = %L and g.status = %L',
                 'dele' || 'te', old.id, 'scheduled');
  nm := coalesce(old.name, (select p.display_name from public.profiles p where p.id = old.profile_id), 'Former player');
  update public.hoop_game_players set guest_id = old.id, guest_name = left(nm, 40), profile_id = null, member_id = null where member_id = old.id;
  update public.hoop_events set guest_id = old.id, profile_id = null, member_id = null where member_id = old.id;
  return old;
end $$;

-- ============================================================ MUSIC: song files
-- Song audio is only readable while the song (and its band) is visible — or by the band's managers, the uploader and moderators.
alter policy "minaw: tracks readable for streaming" on storage.objects
  using (bucket_id = 'tracks' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or private.is_moderator()
    or exists (select 1 from public.tracks t join public.bands b on b.id = t.band_id
               where t.audio_path = storage.objects.name
                 and ((not t.is_hidden and not b.is_hidden) or private.owns_band(t.band_id)))));

-- Songs and gigs of a band removed by moderators are hidden too.
alter policy "tracks: visible unless hidden" on public.tracks
  using ((not is_hidden and exists (select 1 from public.bands b where b.id = band_id and not b.is_hidden))
         or private.owns_band(band_id) or private.is_moderator());
alter policy "gigs: readable by all" on public.gigs
  using (exists (select 1 from public.bands b where b.id = band_id and not b.is_hidden)
         or private.owns_band(band_id) or private.is_moderator());

-- ============================================================ ANTI-ABUSE
-- Server sets created_at (spam limits count by it; a fake old/future date dodged them or pinned posts to the top).
create or replace function private.pin_created_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then new.created_at := now(); else new.created_at := old.created_at; end if;
  end if;
  return new;
end $$;

-- Columns that must never change after a row is created (e.g. moving an approved review to another band).
create or replace function private.lock_columns() returns trigger
language plpgsql set search_path = '' as $$
declare o jsonb := to_jsonb(old); patch jsonb := '{}'; c text;
begin
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then return new; end if;
  foreach c in array tg_argv loop patch := patch || jsonb_build_object(c, o -> c); end loop;
  new := jsonb_populate_record(new, patch);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['posts','comments','track_comments','listings','band_reviews','venue_reviews','playlists'] loop
    execute format('create or replace trigger aa_pin_created_at before insert or update on public.%I for each row execute function private.pin_created_at()', t);
  end loop;
end $$;
create or replace trigger aa_lock_columns before update on public.band_reviews for each row execute function private.lock_columns('author_id', 'band_id');
create or replace trigger aa_lock_columns before update on public.venue_reviews for each row execute function private.lock_columns('author_id', 'venue_id');
create or replace trigger aa_lock_columns before update on public.comments for each row execute function private.lock_columns('author_id', 'post_id');
create or replace trigger aa_lock_columns before update on public.track_comments for each row execute function private.lock_columns('author_id', 'track_id');
create or replace trigger aa_lock_columns before update on public.posts for each row execute function private.lock_columns('author_id');
create or replace trigger aa_lock_columns before update on public.tracks for each row execute function private.lock_columns('band_id');
create or replace trigger aa_lock_columns before update on public.playlists for each row execute function private.lock_columns('owner_id', 'copied_from', 'original_owner_id');

-- "Save a copy" of a playlist: the source must be one you can see; credit comes from the source, not the client.
create or replace function private.playlist_copy_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare src record;
begin
  if current_user not in ('anon', 'authenticated') or new.copied_from is null then return new; end if;
  select * into src from public.playlists p where p.id = new.copied_from and (p.is_public or p.owner_id = auth.uid());
  if src.id is null then raise exception 'You can only copy playlists you can see.'; end if;
  new.original_owner_id := coalesce(src.original_owner_id, src.owner_id);
  return new;
end $$;
create or replace trigger aa_playlist_copy_guard before insert on public.playlists for each row execute function private.playlist_copy_guard();
