-- Hoop Method:
--  • admin picks how many periods a game has (1–8, default 4; overtime can go past it)
--  • admin marks who ARRIVED and in what order (first come, first play)
--  • admin can add GUEST players (not on the app yet) by name — they play and score, but nothing is saved to any card
--  • (slots can already be changed by the admin; no change needed for that)

-- ============================================================ PERIODS
alter table public.hoop_games add column if not exists periods smallint not null default 4 check (periods between 1 and 8);

-- ============================================================ ARRIVALS + GUESTS on bookings / team rows
alter table public.hoop_game_players add column if not exists arrived_at timestamptz;
alter table public.hoop_game_players add column if not exists guest_id uuid;
alter table public.hoop_game_players add column if not exists guest_name text;
alter table public.hoop_game_players add column if not exists id uuid not null default gen_random_uuid();

-- new primary key (a guest has no profile), still one row per member / guest per game
alter table public.hoop_game_players drop constraint hoop_game_players_pkey, add constraint hoop_game_players_pkey primary key (id);
alter table public.hoop_game_players alter column profile_id drop not null;
create unique index if not exists hoop_game_players_member_uniq on public.hoop_game_players (game_id, profile_id);
create unique index if not exists hoop_game_players_guest_uniq on public.hoop_game_players (game_id, guest_id);
alter table public.hoop_game_players add constraint hoop_game_players_who check ((profile_id is null) <> (guest_id is null));
alter table public.hoop_game_players add constraint hoop_game_players_guest_name check (guest_id is null or char_length(btrim(guest_name)) between 1 and 40);

alter table public.hoop_events add column if not exists guest_id uuid;
alter table public.hoop_events alter column profile_id drop not null;
alter table public.hoop_events add constraint hoop_events_who check ((profile_id is null) <> (guest_id is null));

-- ============================================================ GUARDS
create or replace function private.hoop_booking_guard() returns trigger
language plpgsql set search_path = '' as $$
declare g record; taken int;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  perform pg_advisory_xact_lock(hashtext('hoop-book-' || new.game_id::text));
  select * into g from public.hoop_games where id = new.game_id;
  if g.id is null then raise exception 'HOOP: That game doesn’t exist.'; end if;
  if new.guest_id is not null or new.profile_id is null then
    if not private.is_moderator() then raise exception 'HOOP: Only the admin can add guest players.'; end if;
    if new.guest_id is null then raise exception 'HOOP: Pick a player.'; end if;
    new.profile_id := null;
    new.guest_name := btrim(new.guest_name);
  elsif not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'fan') then
    raise exception 'HOOP: Sunday Hoop Method is for individual (Fan) accounts only.';
  end if;
  if not private.is_moderator() then
    new.team := null; new.paid := false; new.paid_at := null; new.arrived_at := null;
    if g.session_id is not null then raise exception 'HOOP: Book the main schedule instead.'; end if;
    if g.status <> 'scheduled' then raise exception 'HOOP: Booking is closed for this game.'; end if;
    if g.starts_at < now() then raise exception 'HOOP: This game already started.'; end if;
    select count(*) into taken from public.hoop_game_players where game_id = new.game_id;
    if taken >= g.slots then raise exception 'HOOP: Sorry, this game is full.'; end if;
  end if;
  new.booked_at := now();
  if new.profile_id is not null then perform private.hoop_ensure_player(new.profile_id); end if;
  return new;
end $$;

create or replace function private.hoop_event_guard() returns trigger
language plpgsql set search_path = '' as $$
declare t text; g record;
begin
  select * into g from public.hoop_games where id = new.game_id;
  if g.status <> 'live' then raise exception 'HOOP: Start the game first.'; end if;
  if new.guest_id is not null then new.profile_id := null; end if;
  select gp.team into t from public.hoop_game_players gp
   where gp.game_id = new.game_id
     and ((new.profile_id is not null and gp.profile_id = new.profile_id) or (new.guest_id is not null and gp.guest_id = new.guest_id));
  if t is null then raise exception 'HOOP: Put this player on a team first.'; end if;
  new.team := t; new.period := g.period; new.created_by := auth.uid(); new.created_at := now();
  return new;
end $$;

-- ============================================================ STATS: guests never count on any card
create or replace view public.hoop_player_stats with (security_invoker = true) as
with played as (
  select gp.profile_id, gp.game_id, gp.team, s.score_a, s.score_b
  from public.hoop_game_players gp
  join public.hoop_games g on g.id = gp.game_id and g.status = 'final'
  join public.hoop_game_scores s on s.game_id = gp.game_id
  where gp.team is not null and gp.profile_id is not null
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
