-- Fix: play counts never increased. record_play() runs as the function owner,
-- but tracks_guard reset play_count because the listener isn't a moderator.
-- Only protect play_count / is_hidden from direct client writes.
create or replace function public.tracks_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.tracks where band_id = new.band_id) >= 3 then
    raise exception 'Upload limit reached: a band can upload at most 3 tracks for now';
  end if;
  if current_user in ('anon', 'authenticated') and not private.is_moderator() then
    if tg_op = 'INSERT' then
      new.play_count := 0; new.is_hidden := false;
    else
      new.play_count := old.play_count; new.is_hidden := old.is_hidden;
    end if;
  end if;
  return new;
end $$;
