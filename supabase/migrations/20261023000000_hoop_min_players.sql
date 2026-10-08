-- A game can only start with at least 8 players on teams (4 per side).
create or replace function private.hoop_start_guard() returns trigger
language plpgsql set search_path = '' as $$
declare a int; b int;
begin
  if new.status = 'live' and old.status = 'scheduled' then
    select count(*) filter (where team = 'A'), count(*) filter (where team = 'B') into a, b
      from public.hoop_game_players where game_id = new.id;
    if a + b < 8 or a < 4 or b < 4 then
      raise exception 'HOOP: A game needs at least 8 players — 4 on each team (now % vs %).', a, b;
    end if;
  end if;
  return new;
end $$;
create or replace trigger hoop_start_guard before update of status on public.hoop_games
  for each row execute function private.hoop_start_guard();
