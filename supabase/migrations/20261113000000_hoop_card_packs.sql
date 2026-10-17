-- =====================================================================================================
-- HOOP METHOD · CARD PACKS + 1-of-1 CARDS  (replaces the club chat)
--
-- After a schedule is closed, every player (with an account) who played in it gets a pack of 5 face-down cards.
-- Packs stay "waiting" until the MAIN ADMIN picks that schedule's 1-of-1 winner. Then all packs become "ready":
-- 5 random designs each, and the winner's pack hides the 1-of-1 at a random spot (1st…5th).
-- Opening the winning pack adds the 1-of-1 to that player's card list. The same player can't win twice in a row
-- in the same club. Nobody but the main admin can see the winner before the pack is opened.
-- Players pick which of their cards to show on their own My Card (hoop_members.card_choice).
-- =====================================================================================================

-- ---------------------------------------------------------------- the main admin (robertvtemployee@gmail.com)
create or replace function private.hoop_main_admin() returns uuid language sql immutable as
$$ select '6a06f84b-ef85-4c61-9734-1948af7e2c83'::uuid $$;

-- ---------------------------------------------------------------- remove the club chat (and the old per-game chat)
drop table if exists public.hoop_club_chat cascade;
drop table if exists public.hoop_chat cascade;
drop function if exists private.hoop_club_chat_guard() cascade;
drop function if exists private.hoop_chat_guard() cascade;

-- ---------------------------------------------------------------- tables
create table public.hoop_packs (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.hoop_clubs(id) on delete cascade,
  schedule_id uuid not null references public.hoop_games(id) on delete cascade,
  member_id   uuid not null references public.hoop_members(id) on delete cascade,
  status      text not null default 'waiting' check (status in ('waiting', 'ready', 'opened')),
  ready_at    timestamptz,
  opened_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (schedule_id, member_id)
);
create index hoop_packs_member_idx on public.hoop_packs(member_id);
create index hoop_packs_club_idx on public.hoop_packs(club_id, schedule_id);

-- what's inside a pack: hidden from everyone (only the open/draw functions read it)
create table private.hoop_pack_contents (
  pack_id  uuid primary key references public.hoop_packs(id) on delete cascade,
  cards    text[] not null,
  one_slot int check (one_slot between 1 and 5)
);

-- who the main admin picked (only the main admin can read this)
create table public.hoop_pack_draws (
  schedule_id      uuid primary key references public.hoop_games(id) on delete cascade,
  club_id          uuid not null references public.hoop_clubs(id) on delete cascade,
  winner_member_id uuid references public.hoop_members(id) on delete set null,
  drawn_by         uuid,
  drawn_at         timestamptz not null default now()
);

-- 1-of-1 cards that have been found (public: it's a trophy)
create table public.hoop_one_of_ones (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.hoop_clubs(id) on delete cascade,
  schedule_id uuid not null references public.hoop_games(id) on delete cascade,
  member_id   uuid not null references public.hoop_members(id) on delete cascade,
  won_at      timestamptz not null default now(),
  unique (schedule_id)
);
create index hoop_one_of_ones_member_idx on public.hoop_one_of_ones(member_id);

alter table public.hoop_members add column if not exists card_choice text;

-- ---------------------------------------------------------------- security
alter table public.hoop_packs enable row level security;
alter table public.hoop_pack_draws enable row level security;
alter table public.hoop_one_of_ones enable row level security;
alter table private.hoop_pack_contents enable row level security;

create policy "own packs or main admin" on public.hoop_packs for select to authenticated using (
  auth.uid() = private.hoop_main_admin()
  or exists (select 1 from public.hoop_members m where m.id = member_id and m.profile_id = auth.uid()));
create policy "main admin only" on public.hoop_pack_draws for select to authenticated using (auth.uid() = private.hoop_main_admin());
create policy "anyone signed in" on public.hoop_one_of_ones for select to authenticated using (true);
grant select on public.hoop_packs, public.hoop_pack_draws, public.hoop_one_of_ones to authenticated;
-- (hoop_member_level is granted below, after it's created)

-- ---------------------------------------------------------------- level from finished schedules (same rule as the app)
create or replace function private.hoop_member_level(p_member uuid) returns int language sql stable security definer set search_path = '' as $$
  select case when coalesce(s.schedules, 0) >= 3 then 3 when coalesce(s.schedules, 0) >= 2 then 2 else 1 end
    from (select (select schedules from public.hoop_member_schedules where member_id = p_member) as schedules) s
$$;

-- card_choice: only cards the player owns ('level1'…'level3' up to their level, or 'one:<1-of-1 id>')
-- (security INVOKER on purpose: it must see the real player as current_user)
create or replace function private.hoop_card_choice_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
declare lvl int;
begin
  if new.card_choice is not distinct from old.card_choice or new.card_choice is null then return new; end if;
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.profile_id is distinct from auth.uid() then raise exception 'HOOP: Only the player can choose their card.'; end if;
  if new.card_choice ~ '^level[1-9]$' then
    lvl := private.hoop_member_level(new.id);
    if substr(new.card_choice, 6)::int > lvl then raise exception 'HOOP: That card isn''t unlocked yet.'; end if;
  elsif new.card_choice ~ '^one:[0-9a-f-]{36}$' then
    if not exists (select 1 from public.hoop_one_of_ones o where o.id = substr(new.card_choice, 5)::uuid and o.member_id = new.id) then
      raise exception 'HOOP: That 1-of-1 card isn''t yours.';
    end if;
  else
    raise exception 'HOOP: Unknown card.';
  end if;
  return new;
end $$;
grant execute on function private.hoop_member_level(uuid) to authenticated;
create trigger hoop_card_choice_guard before update of card_choice on public.hoop_members
  for each row execute function private.hoop_card_choice_guard();

-- ---------------------------------------------------------------- packs
-- 5 random card designs (the 1-of-1 slot is filled in by the draw)
create or replace function private.hoop_random_cards() returns text[] language sql volatile as $$
  select array_agg((array['glow', 'royal', 'starlight'])[1 + floor(random() * 3)::int]) from generate_series(1, 5)
$$;

-- a pack for every player with an account who played in this (closed) schedule
create or replace function private.hoop_make_packs(p_schedule uuid) returns void language plpgsql security definer set search_path = '' as $$
declare drawn boolean;
begin
  if not exists (select 1 from public.hoop_games g where g.id = p_schedule and g.session_id is null and g.closed_at is not null) then return; end if;
  drawn := exists (select 1 from public.hoop_pack_draws d where d.schedule_id = p_schedule);
  with played as (
    select distinct gp.member_id
      from public.hoop_game_players gp
      join public.hoop_games g on g.id = gp.game_id and g.status = 'final' and coalesce(g.session_id, g.id) = p_schedule
      join public.hoop_members m on m.id = gp.member_id and m.profile_id is not null
     where gp.team is not null
  ), made as (
    insert into public.hoop_packs (club_id, schedule_id, member_id, status, ready_at)
    select (select club_id from public.hoop_games where id = p_schedule), p_schedule, p.member_id,
           case when drawn then 'ready' else 'waiting' end, case when drawn then now() end
      from played p
    on conflict (schedule_id, member_id) do nothing
    returning id
  )
  -- after the draw, late packs (e.g. a guest linked to an account) are ready right away, without the 1-of-1
  insert into private.hoop_pack_contents (pack_id, cards)
  select id, private.hoop_random_cards() from made where drawn;
end $$;

create or replace function private.hoop_schedule_closed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.session_id is null and new.closed_at is not null and old.closed_at is null then
    perform private.hoop_make_packs(new.id);
  end if;
  return new;
end $$;
create trigger hoop_schedule_packs after update of closed_at on public.hoop_games
  for each row execute function private.hoop_schedule_closed();

-- MAIN ADMIN: pick this schedule's 1-of-1 winner → every pack becomes ready
create or replace function public.hoop_draw_pack_winner(p_schedule uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s record; last_winner uuid; club text;
begin
  if auth.uid() is distinct from private.hoop_main_admin() then raise exception 'HOOP: Only the main admin can pick the 1-of-1 winner.'; end if;
  select * into s from public.hoop_games where id = p_schedule and session_id is null;
  if s is null or s.closed_at is null then raise exception 'HOOP: Close the schedule first.'; end if;
  if exists (select 1 from public.hoop_pack_draws where schedule_id = p_schedule) then raise exception 'HOOP: The winner for this schedule was already picked.'; end if;
  perform private.hoop_make_packs(p_schedule);
  if not exists (select 1 from public.hoop_packs where schedule_id = p_schedule and member_id = p_member) then
    raise exception 'HOOP: That player didn''t play in this schedule.';
  end if;
  select d.winner_member_id into last_winner from public.hoop_pack_draws d where d.club_id = s.club_id order by d.drawn_at desc limit 1;
  if last_winner = p_member then raise exception 'HOOP: This player won the last 1-of-1 — pick someone else this time.'; end if;

  insert into public.hoop_pack_draws (schedule_id, club_id, winner_member_id, drawn_by) values (p_schedule, s.club_id, p_member, auth.uid());
  insert into private.hoop_pack_contents (pack_id, cards, one_slot)
  select p.id, x.cards, x.slot
    from public.hoop_packs p,
         lateral (select private.hoop_random_cards() as cards, case when p.member_id = p_member then 1 + floor(random() * 5)::int end as slot) x0,
         lateral (select case when x0.slot is null then x0.cards else x0.cards[1:x0.slot - 1] || 'oneofone'::text || x0.cards[x0.slot + 1:5] end as cards, x0.slot) x
   where p.schedule_id = p_schedule
  on conflict (pack_id) do nothing;
  update public.hoop_packs set status = 'ready', ready_at = now() where schedule_id = p_schedule and status = 'waiting';

  select c.name into club from public.hoop_clubs c where c.id = s.club_id;
  insert into public.notifications (user_id, actor_id, type, hoop_club_id, snippet)
  select m.profile_id, auth.uid(), 'hoop_pack', s.club_id, left(club, 140)
    from public.hoop_packs p join public.hoop_members m on m.id = p.member_id
   where p.schedule_id = p_schedule and m.profile_id is not null and m.profile_id <> auth.uid();
end $$;

-- PLAYER: open my pack → its 5 cards (and where the 1-of-1 is, if it's in this pack)
create or replace function public.hoop_open_pack(p_pack uuid) returns json
language plpgsql security definer set search_path = '' as $$
declare p record; c record;
begin
  select pk.*, m.profile_id into p from public.hoop_packs pk join public.hoop_members m on m.id = pk.member_id where pk.id = p_pack;
  if p is null or p.profile_id is distinct from auth.uid() then raise exception 'HOOP: This isn''t your pack.'; end if;
  if p.status = 'waiting' then raise exception 'HOOP: This pack isn''t ready yet.'; end if;
  select * into c from private.hoop_pack_contents where pack_id = p_pack;
  if p.status = 'ready' then
    update public.hoop_packs set status = 'opened', opened_at = now() where id = p_pack;
    if c.one_slot is not null then
      insert into public.hoop_one_of_ones (club_id, schedule_id, member_id) values (p.club_id, p.schedule_id, p.member_id)
      on conflict (schedule_id) do nothing;
    end if;
  end if;
  return json_build_object('cards', c.cards, 'one_slot', c.one_slot,
    'one_id', (select o.id from public.hoop_one_of_ones o where o.schedule_id = p.schedule_id and o.member_id = p.member_id));
end $$;

revoke all on function public.hoop_draw_pack_winner(uuid, uuid), public.hoop_open_pack(uuid) from public, anon;
grant execute on function public.hoop_draw_pack_winner(uuid, uuid), public.hoop_open_pack(uuid) to authenticated;

-- ---------------------------------------------------------------- notifications: "your card pack is ready"
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'comment', 'mention_post', 'mention_comment', 'reaction', 'follow', 'band_follow', 'review_pending', 'review_approved',
  'rsvp', 'playlist_like', 'playlist_copy', 'venue_tag', 'track_like', 'track_comment', 'mention_track_comment',
  'band_member', 'band_admin', 'hoop_props', 'hoop_props_approved', 'hoop_join_request', 'hoop_join_approved',
  'hoop_club_admin', 'hoop_club_creator', 'hoop_pack']));

-- ---------------------------------------------------------------- packs for schedules already closed
select private.hoop_make_packs(g.id) from public.hoop_games g where g.session_id is null and g.closed_at is not null;
