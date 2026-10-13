-- An offline player linked to an account (or unlinked): their bookings and stat taps follow, so team chat + profile links work.
create or replace function private.hoop_member_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.profile_id is distinct from old.profile_id then
    update public.hoop_game_players set profile_id = new.profile_id where member_id = new.id;
    update public.hoop_events set profile_id = new.profile_id where member_id = new.id;
  end if;
  return new;
end $$;
create or replace trigger hoop_member_link after update of profile_id on public.hoop_members
  for each row execute function private.hoop_member_link();

alter table public.hoop_club_admins replica identity full;
alter publication supabase_realtime add table public.hoop_club_admins;
