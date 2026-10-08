-- Hoop Method: group chat for each schedule — the booked players (and admins) can chat while waiting for game day.

create table if not exists public.hoop_chat (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.hoop_games(id) on delete cascade,   -- the schedule (first game)
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists hoop_chat_game_idx on public.hoop_chat (game_id, created_at desc);
create index if not exists hoop_chat_author_idx on public.hoop_chat (author_id);
alter table public.hoop_chat enable row level security;

-- booked on this schedule (or an admin)
create or replace function private.hoop_in_schedule(p_game uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator() or exists (
    select 1 from public.hoop_game_players gp where gp.game_id = p_game and gp.profile_id = auth.uid());
$$;

create policy "hoop_chat: players read" on public.hoop_chat for select to authenticated
  using (private.hoop_in_schedule(game_id));
create policy "hoop_chat: players send" on public.hoop_chat for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_post() and private.hoop_in_schedule(game_id));
create policy "hoop_chat: own or admin removes" on public.hoop_chat for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_moderator());

create or replace function private.hoop_chat_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if exists (select 1 from public.hoop_games g where g.id = new.game_id and g.session_id is not null) then
    raise exception 'HOOP: Chat on the main schedule.';
  end if;
  new.body := btrim(new.body);
  new.created_at := now();
  if (select count(*) from public.hoop_chat c where c.author_id = new.author_id and c.created_at > now() - interval '1 minute') >= 15 then
    raise exception 'HOOP: You’re sending messages too fast. Please wait a minute.';
  end if;
  return new;
end $$;
create or replace trigger hoop_chat_guard before insert on public.hoop_chat
  for each row execute function private.hoop_chat_guard();

alter table public.hoop_chat replica identity full;
alter publication supabase_realtime add table public.hoop_chat;
