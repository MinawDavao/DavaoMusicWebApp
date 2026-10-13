-- Deleting a whole club: its played games and members go with it (no guest copies, no "owner only" stop mid-delete).
create or replace function private.hoop_delete_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') or private.is_club_owner(old.club_id)
     or not exists (select 1 from public.hoop_clubs c where c.id = old.club_id) then return old; end if;
  if old.status in ('live', 'final')
     or exists (select 1 from public.hoop_games c where c.session_id = old.id and c.status in ('live', 'final')) then
    raise exception 'HOOP: Only the club owner can delete a game that was already played.';
  end if;
  return old;
end $$;

create or replace function private.hoop_members_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  if not exists (select 1 from public.hoop_clubs c where c.id = old.club_id) then return old; end if;
  nm := coalesce(old.name, (select p.display_name from public.profiles p where p.id = old.profile_id), 'Former player');
  update public.hoop_game_players set guest_id = old.id, guest_name = left(nm, 40), profile_id = null where member_id = old.id;
  update public.hoop_events set guest_id = old.id, profile_id = null where member_id = old.id;
  return old;
end $$;

-- A removed player's rows are turned into guest rows first (member_id cleared), so cascading only
-- removes rows when the whole club (and its games) is being deleted.
create or replace function private.hoop_members_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  if not exists (select 1 from public.hoop_clubs c where c.id = old.club_id) then return old; end if;
  nm := coalesce(old.name, (select p.display_name from public.profiles p where p.id = old.profile_id), 'Former player');
  update public.hoop_game_players set guest_id = old.id, guest_name = left(nm, 40), profile_id = null, member_id = null where member_id = old.id;
  update public.hoop_events set guest_id = old.id, profile_id = null, member_id = null where member_id = old.id;
  return old;
end $$;
alter table public.hoop_game_players drop constraint hoop_game_players_member_id_fkey,
  add constraint hoop_game_players_member_id_fkey foreign key (member_id) references public.hoop_members(id) on delete cascade;
alter table public.hoop_events drop constraint hoop_events_member_id_fkey,
  add constraint hoop_events_member_id_fkey foreign key (member_id) references public.hoop_members(id) on delete cascade;
