-- Deleting an account removes the files in that person's storage folders. Some of those files belong to things that
-- stay after the account is gone (another person's band, a club, another player's card), so the app keeps them.
-- This lists the files of mine that are still used by rows that survive my account deletion.
create or replace function public.my_shared_files() returns setof text language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as id), v(x) as (
    select t.audio_path from public.tracks t join public.bands b on b.id = t.band_id, me where b.owner_id is distinct from me.id
    union all select t.cover_url from public.tracks t join public.bands b on b.id = t.band_id, me where b.owner_id is distinct from me.id
    union all select b.logo_url from public.bands b, me where b.owner_id is distinct from me.id
    union all select b.banner_url from public.bands b, me where b.owner_id is distinct from me.id
    union all select p.image_url from public.band_photos p join public.bands b on b.id = p.band_id, me where b.owner_id is distinct from me.id
    union all select g.poster_url from public.gigs g join public.bands b on b.id = g.band_id, me where b.owner_id is distinct from me.id
    union all select c.logo_url from public.hoop_clubs c
    union all select c.cover_url from public.hoop_clubs c
    union all select p.url from public.hoop_club_photos p
    union all select m.photo_url from public.hoop_members m, me where m.profile_id is distinct from me.id
    union all select m.card_photo_url from public.hoop_members m, me where m.profile_id is distinct from me.id
  )
  select distinct x from v, me where me.id is not null and x is not null and position(me.id::text || '/' in x) > 0;
$$;
revoke all on function public.my_shared_files() from public, anon;
grant execute on function public.my_shared_files() to authenticated;
