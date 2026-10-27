-- a booked player who left the court during the schedule (emergency etc.): kept for stats/payment, skipped for next games
alter table public.hoop_game_players add column if not exists left_at timestamptz;
