-- Reposting a gig poster to the Connect feed: a post can point at a gig (like playlist_id points at a playlist).
-- The gig's poster + details render inside the post. Nullable, so every existing post is unaffected.
alter table public.posts add column if not exists gig_id uuid references public.gigs(id) on delete cascade;
create index if not exists posts_gig_id_idx on public.posts(gig_id) where gig_id is not null;
