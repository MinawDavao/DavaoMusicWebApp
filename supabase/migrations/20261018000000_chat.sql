-- Private 1-on-1 chat (Messages).
-- (separate earlier migration: alter type public.report_target add value 'message')

-- ============================================================ TABLES
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profiles(id) on delete cascade,   -- always the smaller id
  user_b          uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message    text,
  last_sender     uuid,
  a_read_at       timestamptz,
  b_read_at       timestamptz,
  a_cleared_at    timestamptz,     -- "Delete chat" for that person only: hides older messages for them
  b_cleared_at    timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists conversations_b_idx on public.conversations (user_b, last_message_at desc);
create index if not exists conversations_a_idx on public.conversations (user_a, last_message_at desc);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text check (char_length(body) <= 2000),
  image_path      text,             -- inside the private "chat-photos" bucket: <conversation>/<sender>/<file>
  listing_id      uuid references public.listings(id) on delete set null,   -- "About this deal"
  is_hidden       boolean not null default false,                            -- removed by moderators
  created_at      timestamptz not null default now(),
  check (coalesce(btrim(body), '') <> '' or image_path is not null)
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- ============================================================ HELPERS
create or replace function private.in_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c where c.id = p_conv and auth.uid() in (c.user_a, c.user_b));
$$;

create or replace function private.conversation_other(p_conv uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when c.user_a = auth.uid() then c.user_b else c.user_a end from public.conversations c where c.id = p_conv;
$$;

-- ============================================================ POLICIES
create policy "conversations: members read" on public.conversations
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

create policy "messages: members read" on public.messages
  for select to authenticated using (
    (private.in_conversation(conversation_id) and (not is_hidden or sender_id = (select auth.uid())))
    or (private.is_moderator() and exists (select 1 from public.reports r where r.target_type = 'message' and r.target_id = messages.id))
  );
create policy "messages: send as yourself" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and private.can_post() and private.in_conversation(conversation_id)
    and not private.blocked_with(private.conversation_other(conversation_id))
  );
create policy "messages: unsend own" on public.messages
  for delete to authenticated using (sender_id = (select auth.uid()));
create policy "messages: moderators hide" on public.messages
  for update to authenticated using (private.is_moderator()) with check (private.is_moderator());

-- ============================================================ GUARDS / TRIGGERS
create or replace function private.messages_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then return new; end if;
  new.is_hidden := false;
  new.created_at := now();
  new.body := nullif(btrim(new.body), '');
  if new.image_path is not null and new.image_path not like new.conversation_id::text || '/' || new.sender_id::text || '/%' then
    raise exception 'CHAT: That photo can’t be sent.';
  end if;
  if (select count(*) from public.messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'CHAT_SPAM: You’re sending messages too fast. Please wait a minute.';
  end if;
  if (select count(*) from public.messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '1 day') >= 500 then
    raise exception 'CHAT_SPAM: Daily message limit reached. Please try again tomorrow.';
  end if;
  return new;
end $$;
create or replace trigger messages_guard before insert on public.messages
  for each row execute function private.messages_guard();

-- keep the inbox preview + "read" state up to date
create or replace function private.messages_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c uuid := coalesce(new.conversation_id, old.conversation_id); l_body text; l_img text; l_sender uuid; l_at timestamptz;
begin
  if tg_op = 'INSERT' then
    update public.conversations set
      last_message_at = new.created_at,
      last_message = left(coalesce(new.body, 'Sent a photo'), 140),
      last_sender = new.sender_id,
      a_read_at = case when user_a = new.sender_id then new.created_at else a_read_at end,
      b_read_at = case when user_b = new.sender_id then new.created_at else b_read_at end
    where id = c;
  else
    select m.body, m.image_path, m.sender_id, m.created_at into l_body, l_img, l_sender, l_at
      from public.messages m where m.conversation_id = c and not m.is_hidden order by m.created_at desc limit 1;
    update public.conversations set
      last_message = case when l_at is null then null else left(coalesce(l_body, 'Sent a photo'), 140) end,
      last_sender = l_sender
    where id = c;
  end if;
  return null;
end $$;
create or replace trigger messages_after_insert after insert on public.messages
  for each row execute function private.messages_after();
create or replace trigger messages_after_remove after delete or update of is_hidden on public.messages
  for each row execute function private.messages_after();

-- ============================================================ RPCs
/** Opens (or creates) the chat with another member. Returns the conversation id. */
create or replace function public.start_conversation(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); a uuid; b uuid; cid uuid;
begin
  if me is null then raise exception 'CHAT: Please log in to send messages.'; end if;
  if p_other is null or p_other = me then raise exception 'CHAT: You can’t message yourself.'; end if;
  if not private.can_post() then raise exception 'CHAT: Please accept the Terms (and make sure your account is active) to send messages.'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_other and not p.is_suspended) then raise exception 'CHAT: This account isn’t available.'; end if;
  if private.blocked_pair(me, p_other) then raise exception 'CHAT: You can’t message this account.'; end if;
  a := least(me, p_other); b := greatest(me, p_other);
  insert into public.conversations (user_a, user_b) values (a, b) on conflict (user_a, user_b) do nothing returning id into cid;
  if cid is null then select id into cid from public.conversations where user_a = a and user_b = b; end if;
  return cid;
end $$;

create or replace function public.chat_mark_read(p_conv uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversations set
    a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
    b_read_at = case when user_b = auth.uid() then now() else b_read_at end
  where id = p_conv and auth.uid() in (user_a, user_b);
$$;

/** "Delete chat" — only for me; the other person keeps their copy. */
create or replace function public.chat_clear(p_conv uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversations set
    a_cleared_at = case when user_a = auth.uid() then now() else a_cleared_at end,
    b_cleared_at = case when user_b = auth.uid() then now() else b_cleared_at end,
    a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
    b_read_at = case when user_b = auth.uid() then now() else b_read_at end
  where id = p_conv and auth.uid() in (user_a, user_b);
$$;

/** Number of chats with a message I haven't read. */
create or replace function public.chat_unread_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.conversations c
  where auth.uid() in (c.user_a, c.user_b) and c.last_sender is not null and c.last_sender <> auth.uid()
    and c.last_message_at > coalesce(case when c.user_a = auth.uid() then c.a_read_at else c.b_read_at end, '-infinity')
    and c.last_message_at > coalesce(case when c.user_a = auth.uid() then c.a_cleared_at else c.b_cleared_at end, '-infinity')
    and not private.blocked_pair(c.user_a, c.user_b);
$$;

grant execute on function public.start_conversation(uuid), public.chat_mark_read(uuid), public.chat_clear(uuid), public.chat_unread_count() to authenticated;

-- ============================================================ REPORTS: "Remove" hides a reported message
create or replace function public.apply_report_decision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_hide boolean;
  v_other_removed boolean;
begin
  if new.status = old.status or new.status not in ('removed', 'dismissed') then return new; end if;
  if new.status = 'dismissed' then
    if old.status is distinct from 'removed' then return new; end if;
    select exists (select 1 from public.reports r where r.target_type = new.target_type and r.target_id = new.target_id
                   and r.id <> new.id and r.status = 'removed') into v_other_removed;
    if v_other_removed then return new; end if;
    v_hide := false;
  else
    v_hide := true;
  end if;
  case new.target_type
    when 'post'          then update public.posts          set is_hidden = v_hide where id = new.target_id;
    when 'comment'       then update public.comments       set is_hidden = v_hide where id = new.target_id;
    when 'track_comment' then update public.track_comments set is_hidden = v_hide where id = new.target_id;
    when 'listing'       then update public.listings       set is_hidden = v_hide where id = new.target_id;
    when 'track'         then update public.tracks         set is_hidden = v_hide where id = new.target_id;
    when 'band'          then update public.bands          set is_hidden = v_hide where id = new.target_id;
    when 'review'        then update public.band_reviews   set is_hidden = v_hide where id = new.target_id;
    when 'message'       then update public.messages       set is_hidden = v_hide where id = new.target_id;
    when 'profile' then
      if not exists (select 1 from public.moderators m where m.user_id = new.target_id) then
        update public.profiles set is_suspended = v_hide where id = new.target_id;
        update auth.users set banned_until = case when v_hide then '2999-12-31'::timestamptz else null end where id = new.target_id;
      end if;
  end case;
  return new;
end $$;

-- ============================================================ PRIVATE PHOTO BUCKET
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "minaw: chat photos for the two members" on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-photos' and (
      private.in_conversation(((storage.foldername(name))[1])::uuid)
      or (private.is_moderator() and exists (select 1 from public.messages m join public.reports r on r.target_type = 'message' and r.target_id = m.id
                                             where m.image_path = storage.objects.name))
    )
  );
create policy "minaw: chat photos upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.in_conversation(((storage.foldername(name))[1])::uuid)
    and private.can_post()
  );
create policy "minaw: chat photos remove own" on storage.objects
  for delete to authenticated using (bucket_id = 'chat-photos' and (storage.foldername(name))[2] = (select auth.uid())::text);

-- ============================================================ LIVE UPDATES
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

-- ============================================================ DEALS: price is required for every listing
alter table public.listings drop constraint listings_check,
  add constraint listings_price_required check (price is not null);

-- so "Unsend" also disappears live on the other phone
alter table public.messages replica identity full;
