-- Admin can end a schedule (no more games that day)
alter table public.hoop_games add column if not exists closed_at timestamptz;
