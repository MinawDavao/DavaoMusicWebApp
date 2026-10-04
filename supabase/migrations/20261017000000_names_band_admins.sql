-- 1) Name checks at sign-up (taken / similar names)
-- 2) Band page admins: the owner links a member to their MINAW account and can make them an admin.

-- ============================================================ 1. NAME CHECK
create extension if not exists pg_trgm with schema extensions;

-- "Pollen Band!" -> "pollenband" (case, spaces and symbols ignored)
create or replace function private.norm_name(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]', '', 'g');
$$;

-- No two band pages / venues with the same name.
create unique index if not exists bands_name_norm_uniq on public.bands (private.norm_name(name));
create unique index if not exists venues_name_norm_uniq on public.profiles (private.norm_name(display_name)) where role = 'venue';

/** Live check while typing. kind: 'name' (display / band / venue name), 'username', 'handle' (band username).
    Returns { taken: bool, matches: [{ name, username, role, exact }] }.
    'taken' = an artist / venue already uses this exact name (for 'name'), or the username/handle is in use. */
create or replace function public.name_check(p_kind text, p_value text, p_band uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v  text := lower(btrim(left(coalesce(p_value, ''), 80)));
  n  text := private.norm_name(left(coalesce(p_value, ''), 80));
  me uuid := auth.uid();
  taken boolean := false;
  m jsonb;
begin
  if char_length(n) < 2 then return jsonb_build_object('taken', false, 'matches', '[]'::jsonb); end if;

  if p_kind = 'username' then
    taken := exists (select 1 from public.profiles p where p.username = v and p.id is distinct from me);
    select coalesce(jsonb_agg(x), '[]'::jsonb) into m from (
      select p.display_name as name, p.username, p.role, (p.username = v) as exact
      from public.profiles p
      where p.id is distinct from me and not p.is_suspended
        and (p.username = v or extensions.similarity(p.username, v) > 0.4)
      order by (p.username = v) desc, extensions.similarity(p.username, v) desc limit 4) x;

  elsif p_kind = 'handle' then
    taken := exists (select 1 from public.bands b where b.handle = v and b.id is distinct from p_band and b.owner_id is distinct from me);
    select coalesce(jsonb_agg(x), '[]'::jsonb) into m from (
      select b.name, b.handle as username, 'artist' as role, (b.handle = v) as exact
      from public.bands b
      where b.id is distinct from p_band and b.owner_id is distinct from me and not b.is_hidden
        and (b.handle = v or extensions.similarity(b.handle, v) > 0.4)
      order by (b.handle = v) desc, extensions.similarity(b.handle, v) desc limit 4) x;

  else -- 'name'
    taken := exists (select 1 from public.bands b where private.norm_name(b.name) = n and b.id is distinct from p_band and b.owner_id is distinct from me)
          or exists (select 1 from public.profiles p where p.role = 'venue' and private.norm_name(p.display_name) = n and p.id is distinct from me);
    select coalesce(jsonb_agg(x), '[]'::jsonb) into m from (
      select p.display_name as name, p.username, p.role, (private.norm_name(p.display_name) = n) as exact
      from public.profiles p
      where p.id is distinct from me and not p.is_suspended
        and not exists (select 1 from public.bands b where b.id = p_band and b.owner_id = p.id)
        and (private.norm_name(p.display_name) = n
             or extensions.similarity(private.norm_name(p.display_name), n) > 0.4
             or (char_length(n) >= 4 and private.norm_name(p.display_name) like '%' || n || '%'))
      order by (private.norm_name(p.display_name) = n) desc,
               extensions.similarity(private.norm_name(p.display_name), n) desc limit 5) x;
  end if;

  return jsonb_build_object('taken', taken, 'matches', m);
end $$;

grant execute on function public.name_check(text, text, uuid) to anon, authenticated;

-- ============================================================ 2. BAND ADMINS
alter table public.band_members add column if not exists is_admin boolean not null default false;
create unique index if not exists band_members_band_profile_uniq on public.band_members (band_id, profile_id) where profile_id is not null;
create index if not exists band_members_admin_idx on public.band_members (profile_id) where is_admin;

-- strictly the owner
create or replace function private.is_band_owner(p_band_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bands b where b.id = p_band_id and b.owner_id = auth.uid());
$$;

-- owner OR an admin member: can edit the band page, songs, gigs, photos, members and testimonials
create or replace function private.owns_band(p_band_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bands b where b.id = p_band_id and b.owner_id = auth.uid())
      or exists (select 1 from public.band_members m join public.profiles p on p.id = m.profile_id
                 where m.band_id = p_band_id and m.profile_id = auth.uid() and m.is_admin and not p.is_suspended);
$$;

alter policy "bands: visible unless hidden" on public.bands
  using ((not is_hidden) or (owner_id = (select auth.uid())) or private.owns_band(id) or private.is_moderator());
alter policy "bands: owner updates" on public.bands
  using ((owner_id = (select auth.uid())) or private.owns_band(id) or private.is_moderator())
  with check ((owner_id = (select auth.uid())) or private.owns_band(id) or private.is_moderator());

-- admins can't take the page over: owner stays the owner
create or replace function public.check_band_owner_is_artist() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.is_moderator() then
    if tg_op = 'INSERT' then
      new.is_verified := false; new.is_hidden := false; new.monthly_listeners := 0;
    else
      new.owner_id := old.owner_id;
      new.is_verified := old.is_verified; new.is_hidden := old.is_hidden; new.monthly_listeners := old.monthly_listeners;
    end if;
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.owner_id and p.role = 'artist') then
    raise exception 'Only artist accounts can own a band page';
  end if;
  return new;
end $$;

-- keep the owner's artist profile (name + picture) in sync, also when an admin edits the page
create or replace function private.sync_band_owner_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name or new.logo_url is distinct from old.logo_url then
    update public.profiles set display_name = new.name, avatar_url = new.logo_url where id = new.owner_id;
  end if;
  return new;
end $$;
create or replace trigger bands_sync_owner_profile after update of name, logo_url on public.bands
  for each row execute function private.sync_band_owner_profile();

-- only the owner picks admins; an admin can step down themselves
-- (not security definer: current_user tells client writes apart from internal ones)
create or replace function private.band_members_guard() returns trigger
language plpgsql set search_path = '' as $$
declare me uuid := auth.uid(); owner uuid;
begin
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then
    return coalesce(new, old);
  end if;
  select b.owner_id into owner from public.bands b where b.id = coalesce(new.band_id, old.band_id);

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
create or replace trigger band_members_guard before insert or update or delete on public.band_members
  for each row execute function private.band_members_guard();

-- notifications: "added you as a member" / "made you an admin"
alter table public.notifications drop constraint notifications_type_check,
  add constraint notifications_type_check check (type = any (array[
  'comment','mention_post','mention_comment','reaction','follow','band_follow','review_pending','review_approved','rsvp',
  'playlist_like','playlist_copy','venue_tag','track_like','track_comment','mention_track_comment','band_member','band_admin']));

create or replace function private.notify_band_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid; bname text;
begin
  if new.profile_id is null then return new; end if;
  select coalesce(auth.uid(), b.owner_id), b.name into actor, bname from public.bands b where b.id = new.band_id;
  if new.is_admin and (tg_op = 'INSERT' or not old.is_admin or new.profile_id is distinct from old.profile_id) then
    perform private.notify(new.profile_id, actor, 'band_admin', null, new.band_id, null, null, bname);
  elsif tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id then
    perform private.notify(new.profile_id, actor, 'band_member', null, new.band_id, null, null, bname);
  end if;
  return new;
end $$;
create or replace trigger band_members_notify after insert or update of profile_id, is_admin on public.band_members
  for each row execute function private.notify_band_member();

-- an admin who uploads a song can confirm the music rights themselves
create or replace function public.tracks_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.tracks where band_id = new.band_id) >= 3 then
    raise exception 'Upload limit reached: a band can upload at most 3 tracks for now';
  end if;
  if tg_op = 'INSERT' and current_user in ('anon', 'authenticated') and not private.is_moderator()
     and not exists (select 1 from public.terms_acceptances t
                     where t.accepted_music_rights
                       and (t.user_id = auth.uid() or t.user_id = (select b.owner_id from public.bands b where b.id = new.band_id))) then
    raise exception 'MUSIC_RIGHTS: Please confirm you own or have permission to share your music before uploading.';
  end if;
  if current_user in ('anon', 'authenticated') and not private.is_moderator() then
    if tg_op = 'INSERT' then
      new.play_count := 0; new.is_hidden := false;
    else
      new.play_count := old.play_count; new.is_hidden := old.is_hidden;
    end if;
  end if;
  return new;
end $$;
