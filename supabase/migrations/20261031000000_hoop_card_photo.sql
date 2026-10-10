-- Hoop Method "My Card": a separate photo just for the player card (not the music profile photo),
-- plus which part of it shows (focus point + zoom, same shape as other photo crops).
alter table public.hoop_players add column if not exists card_photo_url text check (card_photo_url is null or char_length(card_photo_url) <= 600);
alter table public.hoop_players add column if not exists card_photo_crop jsonb;
