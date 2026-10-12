-- Only the main admin (moderators) can delete a Hoop game/schedule that was already played.
-- Hoop admins can still delete games that never started.
create or replace function private.hoop_delete_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then return old; end if;
  if old.status in ('live', 'final')
     or exists (select 1 from public.hoop_games c where c.session_id = old.id and c.status in ('live', 'final')) then
    raise exception 'HOOP: Only the main admin can delete a game that was already played.';
  end if;
  return old;
end $$;
create or replace trigger hoop_delete_guard before delete on public.hoop_games
  for each row execute function private.hoop_delete_guard();
