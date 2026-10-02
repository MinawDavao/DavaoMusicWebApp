-- OPTIONAL (not yet applied). Run in Supabase → SQL Editor if you want to clear
-- the remaining advisor warnings. Changes no data.

-- 1) Trigger-only functions should not be callable through the API.
revoke execute on function public.handle_new_user()       from public, anon, authenticated;
revoke execute on function public.apply_report_decision() from public, anon, authenticated;

-- 2) Split overlapping "for all" policies (performance warning only).
drop policy "genres: moderators manage" on public.genres;
create policy "genres: moderators insert" on public.genres for insert to authenticated with check (private.is_moderator());
create policy "genres: moderators update" on public.genres for update to authenticated using (private.is_moderator()) with check (private.is_moderator());
create policy "genres: moderators delete" on public.genres for delete to authenticated using (private.is_moderator());

drop policy "band_genres: owner manages" on public.band_genres;
create policy "band_genres: owner inserts" on public.band_genres for insert to authenticated with check (private.owns_band(band_id));
create policy "band_genres: owner deletes" on public.band_genres for delete to authenticated using (private.owns_band(band_id));

drop policy "band_members: owner manages" on public.band_members;
create policy "band_members: owner inserts" on public.band_members for insert to authenticated with check (private.owns_band(band_id));
create policy "band_members: owner updates" on public.band_members for update to authenticated using (private.owns_band(band_id)) with check (private.owns_band(band_id));
create policy "band_members: owner deletes" on public.band_members for delete to authenticated using (private.owns_band(band_id));

drop policy "gigs: band owner manages" on public.gigs;
create policy "gigs: band owner inserts" on public.gigs for insert to authenticated with check (private.owns_band(band_id) and private.is_active_user());
create policy "gigs: band owner updates" on public.gigs for update to authenticated using (private.owns_band(band_id)) with check (private.owns_band(band_id));
create policy "gigs: band owner deletes" on public.gigs for delete to authenticated using (private.owns_band(band_id));

drop policy "playlists: manage own" on public.playlists;
create policy "playlists: create own" on public.playlists for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "playlists: update own" on public.playlists for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "playlists: delete own" on public.playlists for delete to authenticated using (owner_id = (select auth.uid()));

drop policy "playlist_tracks: owner manages" on public.playlist_tracks;
create policy "playlist_tracks: owner inserts" on public.playlist_tracks for insert to authenticated
  with check (exists (select 1 from public.playlists pl where pl.id = playlist_id and pl.owner_id = (select auth.uid())));
create policy "playlist_tracks: owner updates" on public.playlist_tracks for update to authenticated
  using (exists (select 1 from public.playlists pl where pl.id = playlist_id and pl.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.playlists pl where pl.id = playlist_id and pl.owner_id = (select auth.uid())));
create policy "playlist_tracks: owner deletes" on public.playlist_tracks for delete to authenticated
  using (exists (select 1 from public.playlists pl where pl.id = playlist_id and pl.owner_id = (select auth.uid())));

drop policy "post_band_tags: post author manages" on public.post_band_tags;
create policy "post_band_tags: author inserts" on public.post_band_tags for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
create policy "post_band_tags: author deletes" on public.post_band_tags for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));

drop policy "listing_photos: seller manages" on public.listing_photos;
create policy "listing_photos: seller inserts" on public.listing_photos for insert to authenticated
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));
create policy "listing_photos: seller updates" on public.listing_photos for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));
create policy "listing_photos: seller deletes" on public.listing_photos for delete to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));

drop policy "sponsored_deals: moderators manage" on public.sponsored_deals;
create policy "sponsored_deals: moderators insert" on public.sponsored_deals for insert to authenticated with check (private.is_moderator());
create policy "sponsored_deals: moderators update" on public.sponsored_deals for update to authenticated using (private.is_moderator()) with check (private.is_moderator());
create policy "sponsored_deals: moderators delete" on public.sponsored_deals for delete to authenticated using (private.is_moderator());
