-- How many FINISHED (closed) schedules each club member actually played in.
-- A schedule = a hoop_games row with no session_id (its extra games point to it via session_id).
-- "Played" = on a team in a final game of that schedule (same rule as hoop_member_stats).
-- Used to pick each player's card design: 1 closed schedule → card 1, 2+ → card 2, …
create or replace view public.hoop_member_schedules with (security_invoker = true) as
select gp.member_id,
       count(distinct coalesce(g.session_id, g.id))::integer as schedules
  from public.hoop_game_players gp
  join public.hoop_games g    on g.id = gp.game_id and g.status = 'final'
  join public.hoop_games root on root.id = coalesce(g.session_id, g.id) and root.closed_at is not null
 where gp.member_id is not null and gp.team is not null
 group by gp.member_id;

grant select on public.hoop_member_schedules to anon, authenticated;
