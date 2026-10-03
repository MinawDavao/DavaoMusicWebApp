-- Update 14: artists choose which part of their cover photo shows (position + zoom).
alter table public.bands add column if not exists banner_crop jsonb;  -- {"x":50,"y":30,"zoom":1.2}
