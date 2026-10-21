-- Subs during a live game: a player can go to the bench (on_court = false) and keep their team and stats,
-- so their numbers and "games played" still count. Another player takes their place on the court.
alter table public.hoop_game_players add column if not exists on_court boolean not null default true;
