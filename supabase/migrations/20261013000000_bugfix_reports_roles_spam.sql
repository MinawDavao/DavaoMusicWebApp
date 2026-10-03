-- Update 11 bug fixes: report decisions, role switching, music rights, duplicate posts, play/click throttling.

-- 1) Report decisions: "Dismiss" only restores an item if this report had removed it and no other report still keeps
--    it removed. Removing a profile report suspends AND blocks login (like the admin Suspend button), never for admins.
create or replace function public.apply_report_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_hide boolean;
  v_other_removed boolean;
begin
  if new.status = old.status or new.status not in ('removed', 'dismissed') then return new; end if;
  if new.status = 'dismissed' then
    if old.status is distinct from 'removed' then return new; end if;  -- dismissing an open report changes nothing
    select exists (select 1 from public.reports r where r.target_type = new.target_type and r.target_id = new.target_id
                   and r.id <> new.id and r.status = 'removed') into v_other_removed;
    if v_other_removed then return new; end if;
    v_hide := false;
  else
    v_hide := true;
  end if;
  case new.target_type
    when 'post'    then update public.posts        set is_hidden = v_hide where id = new.target_id;
    when 'comment' then update public.comments     set is_hidden = v_hide where id = new.target_id;
    when 'listing' then update public.listings     set is_hidden = v_hide where id = new.target_id;
    when 'track'   then update public.tracks       set is_hidden = v_hide where id = new.target_id;
    when 'band'    then update public.bands        set is_hidden = v_hide where id = new.target_id;
    when 'review'  then update public.band_reviews set is_hidden = v_hide where id = new.target_id;
    when 'profile' then
      if not exists (select 1 from public.moderators m where m.user_id = new.target_id) then
        update public.profiles set is_suspended = v_hide where id = new.target_id;
        update auth.users set banned_until = case when v_hide then '2999-12-31'::timestamptz else null end where id = new.target_id;
      end if;
  end case;
  return new;
end $$;

-- 2) Role changes: an account that owns a band page can't stop being an Artist (switching would break the band page).
create or replace function public.protect_profile_flags()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.is_moderator() then
    if tg_op = 'INSERT' then
      new.is_verified := false; new.is_suspended := false;
    else
      new.is_verified := old.is_verified; new.is_suspended := old.is_suspended;
      if new.role is distinct from old.role and current_user in ('anon', 'authenticated')
         and exists (select 1 from public.bands b where b.owner_id = old.id) then
        raise exception 'Accounts with a band page stay Artist accounts.';
      end if;
    end if;
  end if;
  return new;
end $$;

-- 3) Music rights: uploading songs needs the "I own or have permission to share my music" agreement,
--    even for accounts that switched to Artist after the Terms step.
create or replace function public.accept_music_rights()
returns void language sql security definer set search_path = '' as $$
  update public.terms_acceptances set accepted_music_rights = true where user_id = (select auth.uid());
$$;

create or replace function public.tracks_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.tracks where band_id = new.band_id) >= 3 then
    raise exception 'Upload limit reached: a band can upload at most 3 tracks for now';
  end if;
  if tg_op = 'INSERT' and current_user in ('anon', 'authenticated') and not private.is_moderator()
     and not exists (select 1 from public.terms_acceptances t join public.bands b on b.owner_id = t.user_id
                     where b.id = new.band_id and t.accepted_music_rights) then
    raise exception 'MUSIC_RIGHTS: Please confirm you own or have permission to share your music before uploading.';
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

-- 4) Duplicate-post check only counts truly identical posts (same text, same shared playlist, no photo).
create or replace function public.posts_spam_guard()
returns trigger language plpgsql set search_path = '' as $$
declare n int;
begin
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then return new; end if;
  select count(*) into n from public.posts where author_id = new.author_id and created_at > now() - interval '10 minutes';
  if n >= 3 then raise exception 'Slow down: you can post up to 3 times every 10 minutes. Please try again in a few minutes.'; end if;
  select count(*) into n from public.posts where author_id = new.author_id and created_at > now() - interval '24 hours';
  if n >= 20 then raise exception 'Daily limit reached: you can post up to 20 times a day. Please try again tomorrow.'; end if;
  if new.image_url is null and exists (
       select 1 from public.posts where author_id = new.author_id and created_at > now() - interval '24 hours'
         and lower(btrim(content)) = lower(btrim(new.content))
         and playlist_id is not distinct from new.playlist_id and image_url is null) then
    raise exception 'You already posted this. Please don’t post the same thing twice.';
  end if;
  return new;
end $$;

-- 5) Plays and sponsor clicks can't be inflated by repeat calls.
alter table public.play_log add column if not exists user_id uuid references public.profiles(id) on delete set null;
create index if not exists play_log_track_played_idx on public.play_log (track_id, played_at desc);

create or replace function public.record_play(p_track_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is not null then
    -- the same listener counts once per song every 30 seconds
    if exists (select 1 from public.play_log where track_id = p_track_id and user_id = v_uid and played_at > now() - interval '30 seconds') then return; end if;
  else
    -- logged-out listeners: at most one counted play per song every 5 seconds overall
    if exists (select 1 from public.play_log where track_id = p_track_id and user_id is null and played_at > now() - interval '5 seconds') then return; end if;
  end if;
  update public.tracks set play_count = play_count + 1 where id = p_track_id and not is_hidden;
  if found then insert into public.play_log (track_id, user_id) values (p_track_id, v_uid); end if;
end $$;

create table if not exists public.sponsor_clicks (
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  clicked_at timestamptz not null default now()
);
create index if not exists sponsor_clicks_idx on public.sponsor_clicks (sponsor_id, user_id, clicked_at desc);
alter table public.sponsor_clicks enable row level security;  -- only the function below writes here

create or replace function public.record_sponsor_click(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  -- one click per person per sponsor per hour (logged-out visitors: one per sponsor per 10 seconds overall)
  if exists (select 1 from public.sponsor_clicks where sponsor_id = p_id and user_id is not distinct from v_uid
             and clicked_at > now() - case when v_uid is null then interval '10 seconds' else interval '1 hour' end) then
    return;
  end if;
  update public.sponsors set clicks = clicks + 1 where id = p_id and is_active;
  if found then insert into public.sponsor_clicks (sponsor_id, user_id) values (p_id, v_uid); end if;
end $$;
