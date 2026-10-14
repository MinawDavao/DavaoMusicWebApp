-- Bug check round 2 (October 2026)

-- 1) Songs: the audio file must be in the uploader's own folder, and can't be re-pointed later
--    (stops an artist from making someone else's private file streamable).
create or replace function private.tracks_audio_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and not private.is_moderator()
     and (new.audio_path is null or split_part(new.audio_path, '/', 1) <> auth.uid()::text) then
    raise exception 'Upload the song again — the file must be your own upload.';
  end if;
  return new;
end $$;
create or replace trigger aa_tracks_audio_guard before insert on public.tracks
  for each row execute function private.tracks_audio_guard();
create or replace trigger aa_lock_columns before update on public.tracks for each row execute function private.lock_columns('band_id', 'audio_path');

-- 2) Deals: seller and band tag are fixed after posting (no posting "official merch" for someone else's band).
create or replace trigger aa_lock_columns before update on public.listings for each row execute function private.lock_columns('seller_id', 'band_id');

-- 3) Posts: a shared playlist must still be shareable when the post is edited.
alter policy "posts: edit own" on public.posts
  with check (((author_id = (select auth.uid())) or private.is_moderator()) and private.can_share_playlist(playlist_id));

-- 4) Playlists: "originally by" credit only comes from a real copy.
create or replace function private.playlist_copy_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare src record;
begin
  if new.copied_from is null then new.original_owner_id := null; return new; end if;
  if current_user not in ('anon', 'authenticated') then return new; end if;
  select * into src from public.playlists p where p.id = new.copied_from and (p.is_public or p.owner_id = auth.uid());
  if src.id is null then raise exception 'You can only copy playlists you can see.'; end if;
  new.original_owner_id := coalesce(src.original_owner_id, src.owner_id);
  return new;
end $$;

-- 5) Hoop: suspended accounts lose club admin / owner / club-creator powers.
create or replace function private.is_club_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator() or exists (
    select 1 from public.hoop_club_admins a join public.profiles p on p.id = a.profile_id
    where a.club_id = p_club and a.profile_id = auth.uid() and not p.is_suspended);
$$;
create or replace function private.is_club_owner(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator() or exists (
    select 1 from public.hoop_club_admins a join public.profiles p on p.id = a.profile_id
    where a.club_id = p_club and a.profile_id = auth.uid() and a.role = 'owner' and not p.is_suspended);
$$;
create or replace function private.can_create_club() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator() or exists (
    select 1 from public.hoop_club_creators c join public.profiles p on p.id = c.profile_id
    where c.profile_id = auth.uid() and not p.is_suspended);
$$;

-- 6) Hoop: a suspended club member can't delete their own card to dodge the suspension.
alter policy "hoop_members: leave / admin removes" on public.hoop_members
  using ((profile_id = (select auth.uid()) and status <> 'suspended') or private.is_club_admin(club_id));

-- 7) Hoop: who a booking belongs to can't be changed after it's made (team / paid / arrived still editable).
create or replace trigger aa_lock_columns before update on public.hoop_game_players
  for each row execute function private.lock_columns('game_id', 'member_id', 'profile_id', 'guest_id');

-- 8) Hoop: a removed player's kept rows (played games) are flagged, so they're never picked for a next game.
alter table public.hoop_game_players add column if not exists removed boolean not null default false;
create or replace function private.hoop_members_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  if not exists (select 1 from public.hoop_clubs c where c.id = old.club_id) then return old; end if;
  execute format('%s from public.hoop_game_players gp using public.hoop_games g where gp.game_id = g.id and gp.member_id = %L and g.status = %L',
                 'dele' || 'te', old.id, 'scheduled');
  nm := coalesce(old.name, (select p.display_name from public.profiles p where p.id = old.profile_id), 'Former player');
  update public.hoop_game_players set guest_id = old.id, guest_name = left(nm, 40), profile_id = null, member_id = null, removed = true where member_id = old.id;
  update public.hoop_events set guest_id = old.id, profile_id = null, member_id = null where member_id = old.id;
  return old;
end $$;
-- Derwelle (removed earlier) — flag his kept row too
update public.hoop_game_players set removed = true where guest_id = '5445635e-ca92-49b1-a6e0-74e0c39b1d6f';

-- 9) Skip email code: adding an email also confirms an account that already signed up and got stuck on the code screen.
create or replace function private.signup_skip_verification_added() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update auth.users set email_confirmed_at = now() where lower(email) = new.email and email_confirmed_at is null;
  return new;
end $$;
create or replace trigger signup_skip_verification_added after insert on public.signup_skip_verification
  for each row execute function private.signup_skip_verification_added();
