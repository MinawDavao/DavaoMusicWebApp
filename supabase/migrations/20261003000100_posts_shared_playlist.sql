-- Applied 2026-10-03: a post can share a playlist on the Connect feed.
alter table public.posts add column if not exists playlist_id uuid references public.playlists (id) on delete set null;
create index if not exists posts_playlist_idx on public.posts (playlist_id);

create or replace function private.can_share_playlist(p_playlist uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_playlist is null or exists (
    select 1 from public.playlists pl
    where pl.id = p_playlist and (pl.owner_id = auth.uid() or pl.is_public)
  );
$$;
grant execute on function private.can_share_playlist(uuid) to authenticated;

alter policy "posts: create own" on public.posts
  with check (author_id = (select auth.uid()) and private.can_post() and private.can_share_playlist(playlist_id));
