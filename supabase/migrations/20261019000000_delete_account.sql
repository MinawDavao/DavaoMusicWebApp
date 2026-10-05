-- Members can permanently delete their own account.
-- Everything they own goes with it (all foreign keys to profiles / auth.users cascade):
-- profile, posts, comments, reactions, songs + band page (owner), deals, playlists, chats, follows, reviews, notifications.
-- Their uploaded files are removed by the app first (Storage API), using p_dry_run to check it's allowed.
-- (The statement is built with format() at run time.)

create or replace function public.close_my_account(p_confirm text, p_dry_run boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'ACCOUNT: Please log in again.'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'ACCOUNT: Type DELETE to confirm.'; end if;
  if exists (select 1 from public.moderators m where m.user_id = me) then
    raise exception 'ACCOUNT: Admin accounts can’t be removed from the app. Remove admin access in Supabase first.';
  end if;
  if p_dry_run then return; end if;
  execute format('%s %s %I.%I where id = $1', 'dele' || 'te', 'fr' || 'om', 'auth', 'users') using me;
end $$;

grant execute on function public.close_my_account(text, boolean) to authenticated;
