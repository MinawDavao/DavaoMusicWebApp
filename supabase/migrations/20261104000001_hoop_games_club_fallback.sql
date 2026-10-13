-- a game created without a club goes to the first club the creator runs
create or replace function private.hoop_games_club() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.session_id is not null then
    new.club_id := (select g.club_id from public.hoop_games g where g.id = new.session_id);
  elsif tg_op = 'UPDATE' then
    new.club_id := old.club_id;
  elsif new.club_id is null then
    new.club_id := (select c.id from public.hoop_clubs c where private.is_club_admin(c.id) order by c.created_at limit 1);
  end if;
  if new.club_id is null then raise exception 'HOOP: Pick a club for this game.'; end if;
  return new;
end $$;
