-- Club chat can carry a photo (stored in our own post-images bucket); text is optional when there's a photo.
alter table public.hoop_club_chat add column if not exists image_url text
  check (image_url is null or (char_length(image_url) <= 600 and image_url like 'https://ckwdiwfnivquokggjtyq.supabase.co/storage/v1/object/public/post-images/%'));
alter table public.hoop_club_chat drop constraint hoop_club_chat_body_check,
  add constraint hoop_club_chat_body_check check (char_length(body) <= 500 and (char_length(body) >= 1 or image_url is not null));
alter table public.hoop_club_chat alter column body set default '';
