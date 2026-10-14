-- Hoop notifications: being made a club admin, and being allowed to create clubs.
alter table public.notifications drop constraint notifications_type_check,
  add constraint notifications_type_check check (type = any (array[
  'comment','mention_post','mention_comment','reaction','follow','band_follow','review_pending','review_approved','rsvp',
  'playlist_like','playlist_copy','venue_tag','track_like','track_comment','mention_track_comment','band_member','band_admin',
  'hoop_props','hoop_props_approved','hoop_join_request','hoop_join_approved','hoop_club_admin','hoop_club_creator']));

create or replace function private.hoop_club_admins_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'admin' and new.added_by is distinct from new.profile_id then
    insert into public.notifications (user_id, actor_id, type, hoop_club_id, snippet)
    values (new.profile_id, new.added_by, 'hoop_club_admin', new.club_id, left((select c.name from public.hoop_clubs c where c.id = new.club_id), 140));
  end if;
  return new;
end $$;
create or replace trigger hoop_club_admins_notify after insert on public.hoop_club_admins
  for each row execute function private.hoop_club_admins_notify();

create or replace function private.hoop_club_creators_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.added_by is distinct from new.profile_id then
    insert into public.notifications (user_id, actor_id, type) values (new.profile_id, new.added_by, 'hoop_club_creator');
  end if;
  return new;
end $$;
create or replace trigger hoop_club_creators_notify after insert on public.hoop_club_creators
  for each row execute function private.hoop_club_creators_notify();

-- creators list: who added them is set by the server
create or replace function private.hoop_club_creators_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then new.added_by := auth.uid(); new.created_at := now(); end if;
  return new;
end $$;
create or replace trigger hoop_club_creators_guard before insert on public.hoop_club_creators
  for each row execute function private.hoop_club_creators_guard();
