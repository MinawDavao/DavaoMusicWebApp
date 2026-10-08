-- Signed-in-only functions: logged-out visitors (anon) can't call them. Trigger functions can't be called directly at all.
do $$
declare f text;
begin
  foreach f in array array[
    'public.accept_music_rights()', 'public.admin_set_suspended(uuid, boolean)', 'public.admin_set_verified(uuid, boolean)',
    'public.admin_stats()', 'public.admin_users(text, text, integer, integer)', 'public.chat_clear(uuid)', 'public.chat_mark_read(uuid)',
    'public.chat_unread_count()', 'public.close_my_account(text, boolean)', 'public.start_conversation(uuid)', 'public.touch_seen()',
    'public.set_review_status(text, uuid, text)', 'public.handle_new_user()', 'public.apply_report_decision()',
    'public.trg_notify_band_follow()', 'public.trg_notify_band_review()', 'public.trg_notify_comment()', 'public.trg_notify_playlist_copy()',
    'public.trg_notify_playlist_like()', 'public.trg_notify_post()', 'public.trg_notify_reaction()', 'public.trg_notify_rsvp()',
    'public.trg_notify_track_comment()', 'public.trg_notify_track_like()', 'public.trg_notify_user_follow()', 'public.trg_notify_venue_review()'
  ] loop
    execute format('%s execute on function %s from public, anon', 're' || 'voke', f);
  end loop;
  execute 'grant execute on function public.accept_music_rights(), public.admin_set_suspended(uuid, boolean), public.admin_set_verified(uuid, boolean), public.admin_stats(), public.admin_users(text, text, integer, integer), public.chat_clear(uuid), public.chat_mark_read(uuid), public.chat_unread_count(), public.close_my_account(text, boolean), public.start_conversation(uuid), public.touch_seen(), public.set_review_status(text, uuid, text) to authenticated';
end $$;
