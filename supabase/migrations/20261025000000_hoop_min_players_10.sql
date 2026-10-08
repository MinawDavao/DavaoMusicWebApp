-- A game can only start with at least 10 players on teams (5 per side).
create or replace function private.hoop_start_guard() returns trigger
language plpgsql set search_path = '' as $$
declare a int; b int;
begin
  if new.status = 'live' and old.status = 'scheduled' then
    select count(*) filter (where team = 'A'), count(*) filter (where team = 'B') into a, b
      from public.hoop_game_players where game_id = new.id;
    if a + b < 10 or a < 5 or b < 5 then
      raise exception 'HOOP: A game needs at least 10 players — 5 on each team (now % vs %).', a, b;
    end if;
  end if;
  return new;
end $$;
