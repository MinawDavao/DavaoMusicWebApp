-- One group chat per club (replaces the per-schedule chat). Active members + club admins read and send.
create table if not exists public.hoop_club_chat (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.hoop_clubs(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists hoop_club_chat_club_idx on public.hoop_club_chat (club_id, created_at desc);
alter table public.hoop_club_chat enable row level security;

create or replace function private.in_club(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_club_admin(p_club) or exists (
    select 1 from public.hoop_members m where m.club_id = p_club and m.profile_id = auth.uid() and m.status = 'active');
$$;

create policy "hoop_club_chat: members read" on public.hoop_club_chat for select to authenticated using (private.in_club(club_id));
create policy "hoop_club_chat: members send" on public.hoop_club_chat for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_post() and private.in_club(club_id));
create policy "hoop_club_chat: own or admin removes" on public.hoop_club_chat for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_club_admin(club_id));

create or replace function private.hoop_club_chat_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  new.body := btrim(new.body);
  new.created_at := now();
  if (select count(*) from public.hoop_club_chat c where c.author_id = new.author_id and c.created_at > now() - interval '1 minute') >= 15 then
    raise exception 'HOOP: You’re sending messages too fast. Please wait a minute.';
  end if;
  return new;
end $$;
create or replace trigger hoop_club_chat_guard before insert on public.hoop_club_chat
  for each row execute function private.hoop_club_chat_guard();

alter table public.hoop_club_chat replica identity full;
alter publication supabase_realtime add table public.hoop_club_chat;
