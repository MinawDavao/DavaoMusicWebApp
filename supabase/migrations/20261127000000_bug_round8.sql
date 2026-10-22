-- Bug check round 8

-- MUSIC 1) a band admin can't hand their admin spot to another account (only the owner chooses admins)
CREATE OR REPLACE FUNCTION private.band_members_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    -- round 8: not even on your own admin entry — moving it to another account would make them an admin
    if owner is distinct from me and old.is_admin and new.is_admin and new.profile_id is distinct from old.profile_id then
      raise exception 'BAND_ADMIN: Only the band page owner can choose admins.';
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
end $function$;

-- MUSIC 2) the 3-song limit holds even with two uploads at the same moment
CREATE OR REPLACE FUNCTION public.tracks_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('tracks:' || new.band_id::text));
    if (select count(*) from public.tracks where band_id = new.band_id) >= 3 then
      raise exception 'Upload limit reached: a band can upload at most 3 tracks for now';
    end if;
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
end $function$;

-- MUSIC 3) "tiktok.com/@band" is a link, not a mention (same rule as the app)
CREATE OR REPLACE FUNCTION private.notify_mentions(p_text text, p_actor uuid, p_type text, p_post uuid, p_skip uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  for r in
    select distinct p.id from public.profiles p
    where p.username in (select (regexp_matches(lower(coalesce(p_text, '')), '(?:^|[^a-z0-9_@/])@([a-z0-9_]{3,30})', 'g'))[1])
  loop
    if r.id is distinct from p_skip then
      perform private.notify(r.id, p_actor, p_type, p_post, null, null, null, p_text);
    end if;
  end loop;
end $function$;

-- MUSIC 4) suspended accounts can't edit their old posts, comments or listings
alter policy "posts: edit own" on public.posts
  with check ((((author_id = (select auth.uid())) and private.is_active_user()) or private.is_moderator()) and private.can_share_playlist(playlist_id));
alter policy "comments: edit own" on public.comments
  with check (((author_id = (select auth.uid())) and private.is_active_user()) or private.is_moderator());
alter policy "track_comments: edit own" on public.track_comments
  with check (((author_id = (select auth.uid())) and private.is_active_user()) or private.is_moderator());
alter policy "listings: edit own" on public.listings
  with check (((seller_id = (select auth.uid())) and private.is_active_user()) or private.is_moderator());

-- HOOP 1) Hoop Method is pinned as the lead club
create or replace function private.hoop_lead_club() returns uuid language sql immutable set search_path = '' as
$$ select '3d8e60ee-f3f9-4540-9663-dcc09bf5a8a8'::uuid $$;

-- HOOP 2) schedule numbers count every earlier schedule that was played (closed or not), so closing them
--         out of order doesn't change the numbers; index-friendly lookup
create or replace function private.hoop_schedule_no(p_schedule uuid) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
    from public.hoop_games s
    join public.hoop_games r on r.club_id = s.club_id and r.session_id is null
     and (r.id = s.id or exists (
           select 1 from public.hoop_games x where (x.id = r.id or x.session_id = r.id) and x.status = 'final'))
     and (r.starts_at, r.created_at, r.id) <= (s.starts_at, s.created_at, s.id)
   where s.id = p_schedule
$$;
revoke all on function private.hoop_schedule_no(uuid) from public, anon, authenticated;
revoke all on function private.hoop_lead_club() from public, anon, authenticated;

-- HOOP 3) closing a schedule also makes the packs of the club's other closed, not-yet-drawn schedules
--         (closed earlier, or before packs unlocked for the club)
CREATE OR REPLACE FUNCTION private.hoop_schedule_closed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record;
begin
  if new.session_id is null and new.closed_at is not null and old.closed_at is null then
    perform private.hoop_make_packs(new.id);
    for r in
      select g.id from public.hoop_games g
       where g.club_id = new.club_id and g.session_id is null and g.closed_at is not null and g.id <> new.id
         and g.starts_at >= private.hoop_packs_start()
         and not exists (select 1 from public.hoop_pack_draws d where d.schedule_id = g.id)
    loop
      perform private.hoop_make_packs(r.id);
    end loop;
  end if;
  return new;
end $function$;

-- the same once now, for schedules other clubs closed before their packs unlocked
do $b$
declare r record;
begin
  for r in
    select g.id from public.hoop_games g
     where g.club_id <> private.hoop_lead_club() and g.session_id is null and g.closed_at is not null
       and g.starts_at >= private.hoop_packs_start()
       and not exists (select 1 from public.hoop_pack_draws d where d.schedule_id = g.id)
  loop
    perform private.hoop_make_packs(r.id);
  end loop;
end $b$;

-- HOOP 4) for the 1-of-1 draw screen: this schedule's number and what it gives out
create or replace function public.hoop_schedule_unlocks(p_schedule uuid) returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('no', private.hoop_schedule_no(g.id),
                           'packs', private.hoop_club_gets(g.club_id, 'oneofone', g.id),
                           'chosen', private.hoop_club_gets(g.club_id, 'selected', g.id))
    from public.hoop_games g where g.id = p_schedule and g.session_id is null
$$;
revoke all on function public.hoop_schedule_unlocks(uuid) from public, anon;
grant execute on function public.hoop_schedule_unlocks(uuid) to authenticated;
