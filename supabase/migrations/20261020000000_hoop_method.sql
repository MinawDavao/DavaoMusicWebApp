-- SUNDAY HOOP METHOD — the hidden basketball club inside MINAW DVO.
-- Admins (= moderators, e.g. robertvtemployee@gmail.com) schedule games, pick teams, run the live score console.
-- Members book a slot, and their player card shows games played + career averages from finished games.

-- ============================================================ TABLES
create table if not exists public.hoop_players (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  jersey_number smallint check (jersey_number between 0 and 99),
  position      text check (char_length(position) <= 30),
  height        text check (char_length(height) <= 12),
  created_at    timestamptz not null default now()
);

create table if not exists public.hoop_games (
  id              uuid primary key default gen_random_uuid(),
  title           text not null default 'Sunday Run' check (char_length(title) between 1 and 80),
  venue           text check (char_length(venue) <= 120),
  starts_at       timestamptz not null,
  slots           smallint not null default 15 check (slots between 2 and 60),
  notes           text check (char_length(notes) <= 500),
  status          text not null default 'scheduled' check (status in ('scheduled', 'live', 'final', 'cancelled')),
  team_a          text not null default 'Team Orange' check (char_length(team_a) between 1 and 30),
  team_b          text not null default 'Team Gray' check (char_length(team_b) between 1 and 30),
  period          smallint not null default 1 check (period between 1 and 9),
  period_seconds  integer not null default 600 check (period_seconds between 60 and 3600),
  clock_running   boolean not null default false,
  clock_started_at timestamptz,
  clock_elapsed_ms integer not null default 0,       -- time used in this period before the current run
  started_at      timestamptz,
  ended_at        timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists hoop_games_starts_idx on public.hoop_games (starts_at);

-- booked slot (team null) or assigned to a team ('A' / 'B') by an admin
create table if not exists public.hoop_game_players (
  game_id    uuid not null references public.hoop_games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team       text check (team in ('A', 'B')),
  booked_at  timestamptz not null default now(),
  primary key (game_id, profile_id)
);
create index if not exists hoop_game_players_profile_idx on public.hoop_game_players (profile_id);

-- every tap on the live console is one event, so it can be undone and the box score is always exact
create table if not exists public.hoop_events (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.hoop_games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team       text not null check (team in ('A', 'B')),
  kind       text not null check (kind in ('p1', 'p2', 'p3', 'miss', 'reb', 'ast', 'stl', 'blk', 'tov', 'foul')),
  period     smallint not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists hoop_events_game_idx on public.hoop_events (game_id, created_at);
create index if not exists hoop_events_player_idx on public.hoop_events (profile_id);

-- "Props" = basketball testimonials; the player approves them before they show
create table if not exists public.hoop_props (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.profiles(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  message    text not null check (char_length(btrim(message)) between 2 and 500),
  status     text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, author_id),
  check (player_id <> author_id)
);

alter table public.hoop_players      enable row level security;
alter table public.hoop_games        enable row level security;
alter table public.hoop_game_players enable row level security;
alter table public.hoop_events       enable row level security;
alter table public.hoop_props        enable row level security;

-- ============================================================ POLICIES (members only — it's a hidden club)
create policy "hoop_players: members read" on public.hoop_players for select to authenticated using (true);
create policy "hoop_players: own card" on public.hoop_players for insert to authenticated
  with check (profile_id = (select auth.uid()) and private.is_active_user());
create policy "hoop_players: edit own card" on public.hoop_players for update to authenticated
  using (profile_id = (select auth.uid()) or private.is_moderator()) with check (profile_id = (select auth.uid()) or private.is_moderator());

create policy "hoop_games: members read" on public.hoop_games for select to authenticated using (true);
create policy "hoop_games: admins manage" on public.hoop_games for all to authenticated
  using (private.is_moderator()) with check (private.is_moderator());

create policy "hoop_game_players: members read" on public.hoop_game_players for select to authenticated using (true);
create policy "hoop_game_players: book a slot" on public.hoop_game_players for insert to authenticated
  with check ((profile_id = (select auth.uid()) and team is null and private.can_post()) or private.is_moderator());
create policy "hoop_game_players: admins assign teams" on public.hoop_game_players for update to authenticated
  using (private.is_moderator()) with check (private.is_moderator());
create policy "hoop_game_players: cancel own or admin removes" on public.hoop_game_players for delete to authenticated
  using ((profile_id = (select auth.uid()) and exists (select 1 from public.hoop_games g where g.id = game_id and g.status = 'scheduled'))
         or private.is_moderator());

create policy "hoop_events: members read" on public.hoop_events for select to authenticated using (true);
create policy "hoop_events: admins record" on public.hoop_events for insert to authenticated with check (private.is_moderator());
create policy "hoop_events: admins undo" on public.hoop_events for delete to authenticated using (private.is_moderator());

create policy "hoop_props: visible" on public.hoop_props for select to authenticated
  using (status = 'approved' or author_id = (select auth.uid()) or player_id = (select auth.uid()) or private.is_moderator());
create policy "hoop_props: write own" on public.hoop_props for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_post() and not private.blocked_with(player_id));
create policy "hoop_props: author edits / player approves" on public.hoop_props for update to authenticated
  using (author_id = (select auth.uid()) or player_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) or player_id = (select auth.uid()));
create policy "hoop_props: author or player removes" on public.hoop_props for delete to authenticated
  using (author_id = (select auth.uid()) or player_id = (select auth.uid()) or private.is_moderator());

-- ============================================================ GUARDS
-- booking: only upcoming scheduled games, only while slots are left; makes your player card automatically
create or replace function private.hoop_ensure_player(p uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.hoop_players (profile_id) values (p) on conflict do nothing;
$$;
create or replace function private.hoop_booking_guard() returns trigger
language plpgsql set search_path = '' as $$
declare g record; taken int;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  select * into g from public.hoop_games where id = new.game_id;
  if g.id is null then raise exception 'HOOP: That game doesn’t exist.'; end if;
  if not private.is_moderator() then
    new.team := null;
    if g.status <> 'scheduled' then raise exception 'HOOP: Booking is closed for this game.'; end if;
    if g.starts_at < now() then raise exception 'HOOP: This game already started.'; end if;
    select count(*) into taken from public.hoop_game_players where game_id = new.game_id;
    if taken >= g.slots then raise exception 'HOOP: Sorry, this game is full.'; end if;
  end if;
  new.booked_at := now();
  perform private.hoop_ensure_player(new.profile_id);
  return new;
end $$;
create or replace trigger hoop_booking_guard before insert on public.hoop_game_players
  for each row execute function private.hoop_booking_guard();

-- live events: player must be on a team in that game, game must be live; team + period filled in automatically
create or replace function private.hoop_event_guard() returns trigger
language plpgsql set search_path = '' as $$
declare t text; g record;
begin
  select * into g from public.hoop_games where id = new.game_id;
  if g.status <> 'live' then raise exception 'HOOP: Start the game first.'; end if;
  select gp.team into t from public.hoop_game_players gp where gp.game_id = new.game_id and gp.profile_id = new.profile_id;
  if t is null then raise exception 'HOOP: Put this player on a team first.'; end if;
  new.team := t; new.period := g.period; new.created_by := auth.uid(); new.created_at := now();
  return new;
end $$;
create or replace trigger hoop_event_guard before insert on public.hoop_events
  for each row execute function private.hoop_event_guard();

-- props: a new / edited note waits for the player's approval; the player can only approve
create or replace function private.hoop_props_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.created_at := now(); new.updated_at := now();
    if not exists (select 1 from public.hoop_players hp where hp.profile_id = new.player_id) then
      raise exception 'HOOP: This member hasn’t joined Hoop Method yet.';
    end if;
  else
    new.player_id := old.player_id; new.author_id := old.author_id; new.created_at := old.created_at;
    if auth.uid() = old.player_id and auth.uid() <> old.author_id then
      new.message := old.message;                       -- the player can only approve
      new.updated_at := old.updated_at;
    else
      new.status := case when new.message is distinct from old.message then 'pending' else old.status end;
      new.updated_at := now();
    end if;
  end if;
  return new;
end $$;
create or replace trigger hoop_props_guard before insert or update on public.hoop_props
  for each row execute function private.hoop_props_guard();

-- ============================================================ STATS (finished games only)
create or replace view public.hoop_game_scores with (security_invoker = true) as
select g.id as game_id,
       coalesce(sum(case when e.team = 'A' then case e.kind when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 0 end end), 0)::int as score_a,
       coalesce(sum(case when e.team = 'B' then case e.kind when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 0 end end), 0)::int as score_b
from public.hoop_games g left join public.hoop_events e on e.game_id = g.id
group by g.id;

create or replace view public.hoop_player_stats with (security_invoker = true) as
with played as (
  select gp.profile_id, gp.game_id, gp.team, s.score_a, s.score_b
  from public.hoop_game_players gp
  join public.hoop_games g on g.id = gp.game_id and g.status = 'final'
  join public.hoop_game_scores s on s.game_id = gp.game_id
  where gp.team is not null
), per as (
  select p.profile_id, p.game_id,
         (p.team = 'A' and p.score_a > p.score_b) or (p.team = 'B' and p.score_b > p.score_a) as won,
         (p.score_a = p.score_b) as tied,
         coalesce(sum(case e.kind when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 0 end), 0) as pts,
         count(*) filter (where e.kind = 'p3') as threes,
         count(*) filter (where e.kind = 'reb') as reb,
         count(*) filter (where e.kind = 'ast') as ast,
         count(*) filter (where e.kind = 'stl') as stl,
         count(*) filter (where e.kind = 'blk') as blk,
         count(*) filter (where e.kind = 'tov') as tov,
         count(*) filter (where e.kind = 'foul') as fouls
  from played p left join public.hoop_events e on e.game_id = p.game_id and e.profile_id = p.profile_id
  group by p.profile_id, p.game_id, p.team, p.score_a, p.score_b
)
select profile_id,
       count(*)::int as games,
       count(*) filter (where won)::int as wins,
       count(*) filter (where not won and not tied)::int as losses,
       sum(pts)::int as pts, sum(threes)::int as threes, sum(reb)::int as reb, sum(ast)::int as ast,
       sum(stl)::int as stl, sum(blk)::int as blk, sum(tov)::int as tov, sum(fouls)::int as fouls,
       round(avg(pts), 1)::float as ppg, round(avg(reb), 1)::float as rpg, round(avg(ast), 1)::float as apg,
       round(avg(stl), 1)::float as spg, round(avg(blk), 1)::float as bpg, round(avg(threes), 1)::float as tpg,
       round(avg(tov), 1)::float as topg, round(avg(fouls), 1)::float as fpg,
       max(pts)::int as best_pts
from per group by profile_id;

grant select on public.hoop_game_scores, public.hoop_player_stats to authenticated;

-- ============================================================ NOTIFICATIONS: props waiting for approval
alter table public.notifications drop constraint notifications_type_check,
  add constraint notifications_type_check check (type = any (array[
  'comment','mention_post','mention_comment','reaction','follow','band_follow','review_pending','review_approved','rsvp',
  'playlist_like','playlist_copy','venue_tag','track_like','track_comment','mention_track_comment','band_member','band_admin',
  'hoop_props','hoop_props_approved']));

create or replace function private.notify_hoop_props() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (new.status = 'pending' and old.status = 'approved') then
    perform private.notify(new.player_id, new.author_id, 'hoop_props', null, null, null, null, new.message);
  elsif new.status = 'approved' and old.status = 'pending' then
    perform private.notify(new.author_id, new.player_id, 'hoop_props_approved', null, null, null, null, null);
  end if;
  return new;
end $$;
create or replace trigger hoop_props_notify after insert or update of status, message on public.hoop_props
  for each row execute function private.notify_hoop_props();

-- ============================================================ LIVE
alter table public.hoop_events replica identity full;
alter table public.hoop_game_players replica identity full;
alter publication supabase_realtime add table public.hoop_games;
alter publication supabase_realtime add table public.hoop_events;
alter publication supabase_realtime add table public.hoop_game_players;
