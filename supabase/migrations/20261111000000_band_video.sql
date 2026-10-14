-- Band page featured video: only a YouTube video id (+ optional start time) is stored, so nothing else can be embedded.
alter table public.bands
  add column if not exists video_id text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  add column if not exists video_start integer check (video_start between 0 and 86400);
