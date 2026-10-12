-- If a player has no MINAW DAVAO profile photo, the Hoop card photo they upload becomes their profile photo too.
-- (A profile photo they already have is never replaced.)
create or replace function private.hoop_card_photo_to_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.card_photo_url is not null and (tg_op = 'INSERT' or new.card_photo_url is distinct from old.card_photo_url) then
    update public.profiles set avatar_url = new.card_photo_url where id = new.profile_id and avatar_url is null;
  end if;
  return new;
end $$;
create or replace trigger hoop_card_photo_to_avatar after insert or update of card_photo_url on public.hoop_players
  for each row execute function private.hoop_card_photo_to_avatar();

-- players who already have a card photo but no profile photo
update public.profiles p set avatar_url = h.card_photo_url
  from public.hoop_players h where h.profile_id = p.id and p.avatar_url is null and h.card_photo_url is not null;
