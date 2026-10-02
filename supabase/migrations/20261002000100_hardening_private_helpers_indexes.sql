-- Applied to project ckwdiwfnivquokggjtyq on 2026-10-02.
-- Moves internal RLS helper functions out of the public API (into schema "private"),
-- re-points trigger bodies to them, and adds indexes for foreign keys.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.is_moderator()          set schema private;
alter function public.is_active_user()        set schema private;
alter function public.has_accepted_terms()    set schema private;
alter function public.can_post()              set schema private;
alter function public.owns_band(uuid)         set schema private;

create or replace function private.can_post()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and private.has_accepted_terms();
$$;

create or replace function public.protect_profile_flags()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.is_moderator() then
    if tg_op = 'INSERT' then new.is_verified := false; new.is_suspended := false;
    else new.is_verified := old.is_verified; new.is_suspended := old.is_suspended; end if;
  end if;
  return new;
end $$;

create or replace function public.check_band_owner_is_artist()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.owner_id and p.role = 'artist') then
    raise exception 'Only artist accounts can own a band page';
  end if;
  if not private.is_moderator() then
    if tg_op = 'INSERT' then new.is_verified := false; new.is_hidden := false; new.monthly_listeners := 0;
    else new.is_verified := old.is_verified; new.is_hidden := old.is_hidden; new.monthly_listeners := old.monthly_listeners; end if;
  end if;
  return new;
end $$;

create or replace function public.tracks_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.tracks where band_id = new.band_id) >= 3 then
    raise exception 'Upload limit reached: a band can upload at most 3 tracks for now';
  end if;
  if not private.is_moderator() then
    if tg_op = 'INSERT' then new.play_count := 0; new.is_hidden := false;
    else new.play_count := old.play_count; new.is_hidden := old.is_hidden; end if;
  end if;
  return new;
end $$;

create or replace function public.protect_is_hidden()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.is_moderator() then
    if tg_op = 'INSERT' then new.is_hidden := false; else new.is_hidden := old.is_hidden; end if;
  end if;
  return new;
end $$;

create index if not exists band_genres_genre_idx         on public.band_genres (genre_id);
create index if not exists band_members_profile_idx      on public.band_members (profile_id);
create index if not exists band_reviews_author_idx       on public.band_reviews (author_id);
create index if not exists comments_author_idx           on public.comments (author_id);
create index if not exists listings_band_idx             on public.listings (band_id);
create index if not exists playlist_tracks_track_idx     on public.playlist_tracks (track_id);
create index if not exists post_band_tags_band_idx       on public.post_band_tags (band_id);
create index if not exists post_reactions_user_idx       on public.post_reactions (user_id);
create index if not exists reports_reviewed_by_idx       on public.reports (reviewed_by);
create index if not exists terms_acceptances_version_idx on public.terms_acceptances (version);
create index if not exists tracks_genre_idx              on public.tracks (genre_id);
