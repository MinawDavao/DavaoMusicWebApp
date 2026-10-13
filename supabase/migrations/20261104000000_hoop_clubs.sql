-- HOOP METHOD → many clubs.
--  • hoop_clubs: each basketball club (name, logo, cover, theme colours, rules). First club: HOOP METHOD SUNDAY BASKETBALL.
--  • hoop_club_admins: owner + admins of a club (run games, approve players, edit the club).
--  • hoop_club_creators: people the main admin allows to create clubs (moderators always can).
--  • hoop_members: one player card per club. Joining needs a club admin's approval. Offline players (no account) are members too.
--  • games / bookings / stats belong to a club; stats are per member (per club card).

-- ============================================================ TABLES
create table if not exists public.hoop_clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 60),
  tagline     text check (char_length(tagline) <= 120),
  description text check (char_length(description) <= 1000),
  rules       text check (char_length(rules) <= 4000),
  location    text check (char_length(location) <= 120),
  logo_url    text check (char_length(logo_url) <= 600),
  cover_url   text check (char_length(cover_url) <= 600),
  theme       jsonb not null default '{"primary":"#F28C14","accent":"#F26A2E"}',
  owner_id    uuid references public.profiles(id) on delete set null,
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index if not exists hoop_clubs_name_uniq on public.hoop_clubs (lower(btrim(name)));

create table if not exists public.hoop_club_admins (
  club_id    uuid not null references public.hoop_clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'admin' check (role in ('owner', 'admin')),
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (club_id, profile_id)
);
create index if not exists hoop_club_admins_profile_idx on public.hoop_club_admins (profile_id);

create table if not exists public.hoop_club_creators (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.hoop_club_photos (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.hoop_clubs(id) on delete cascade,
  url        text not null check (char_length(url) <= 600),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists hoop_club_photos_club_idx on public.hoop_club_photos (club_id, created_at desc);

create table if not exists public.hoop_members (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.hoop_clubs(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete cascade,      -- null = offline player (added by an admin)
  name            text check (char_length(btrim(name)) between 1 and 60),     -- offline players only
  photo_url       text check (char_length(photo_url) <= 600),                 -- offline players only
  jersey_number   smallint check (jersey_number between 0 and 99),
  position        text check (char_length(position) <= 30),
  height          text check (char_length(height) <= 12),
  card_photo_url  text check (char_length(card_photo_url) <= 600),
  card_photo_crop jsonb,
  status          text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  note            text check (char_length(note) <= 300),                      -- message with the join request
  created_at      timestamptz not null default now(),
  approved_at     timestamptz,
  approved_by     uuid references public.profiles(id) on delete set null,
  check (profile_id is not null or name is not null)
);
create unique index if not exists hoop_members_club_profile_uniq on public.hoop_members (club_id, profile_id);
create index if not exists hoop_members_profile_idx on public.hoop_members (profile_id);
create index if not exists hoop_members_club_idx on public.hoop_members (club_id, status);

alter table public.hoop_clubs enable row level security;
alter table public.hoop_club_admins enable row level security;
alter table public.hoop_club_creators enable row level security;
alter table public.hoop_club_photos enable row level security;
alter table public.hoop_members enable row level security;

-- games, bookings and stat taps belong to a club / member
alter table public.hoop_games add column if not exists club_id uuid references public.hoop_clubs(id) on delete cascade;
create index if not exists hoop_games_club_idx on public.hoop_games (club_id, starts_at);
alter table public.hoop_game_players add column if not exists member_id uuid references public.hoop_members(id) on delete set null;
create unique index if not exists hoop_game_players_member_uniq on public.hoop_game_players (game_id, member_id);
create index if not exists hoop_game_players_member_idx on public.hoop_game_players (member_id);
alter table public.hoop_events add column if not exists member_id uuid references public.hoop_members(id) on delete set null;
create index if not exists hoop_events_member_idx on public.hoop_events (member_id);

-- an offline member's booking / stat has no profile and no guest id
alter table public.hoop_game_players drop constraint hoop_game_players_who,
  add constraint hoop_game_players_who check ((profile_id is not null or guest_id is not null or member_id is not null) and not (profile_id is not null and guest_id is not null));
alter table public.hoop_events drop constraint hoop_events_who,
  add constraint hoop_events_who check ((profile_id is not null or guest_id is not null or member_id is not null) and not (profile_id is not null and guest_id is not null));

-- notifications can point at a club (join requests / approvals)
alter table public.notifications add column if not exists hoop_club_id uuid references public.hoop_clubs(id) on delete cascade;
alter table public.notifications drop constraint notifications_type_check,
  add constraint notifications_type_check check (type = any (array[
  'comment','mention_post','mention_comment','reaction','follow','band_follow','review_pending','review_approved','rsvp',
  'playlist_like','playlist_copy','venue_tag','track_like','track_comment','mention_track_comment','band_member','band_admin',
  'hoop_props','hoop_props_approved','hoop_join_request','hoop_join_approved']));

-- ============================================================ HELPERS
create or replace function private.is_club_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator() or exists (select 1 from public.hoop_club_admins a where a.club_id = p_club and a.profile_id = auth.uid());
$$;
create or replace function private.is_club_owner(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator() or exists (select 1 from public.hoop_club_admins a where a.club_id = p_club and a.profile_id = auth.uid() and a.role = 'owner');
$$;
create or replace function private.can_create_club() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator() or exists (select 1 from public.hoop_club_creators c where c.profile_id = auth.uid());
$$;
create or replace function private.club_of_game(p_game uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select g.club_id from public.hoop_games g where g.id = p_game;
$$;

-- ============================================================ POLICIES
create policy "hoop_clubs: members read" on public.hoop_clubs for select to authenticated using (not is_hidden or private.is_club_admin(id));
create policy "hoop_clubs: allowed people create" on public.hoop_clubs for insert to authenticated with check (private.can_create_club() and owner_id = (select auth.uid()));
create policy "hoop_clubs: admins edit" on public.hoop_clubs for update to authenticated using (private.is_club_admin(id)) with check (private.is_club_admin(id));
create policy "hoop_clubs: owner deletes" on public.hoop_clubs for delete to authenticated using (private.is_club_owner(id));

create policy "hoop_club_admins: read" on public.hoop_club_admins for select to authenticated using (true);
create policy "hoop_club_admins: owner adds" on public.hoop_club_admins for insert to authenticated with check (private.is_club_owner(club_id) and role = 'admin');
create policy "hoop_club_admins: owner removes" on public.hoop_club_admins for delete to authenticated using (private.is_club_owner(club_id) and (role = 'admin' or private.is_moderator()));

create policy "hoop_club_creators: read" on public.hoop_club_creators for select to authenticated using (true);
create policy "hoop_club_creators: main admin adds" on public.hoop_club_creators for insert to authenticated with check (private.is_moderator());
create policy "hoop_club_creators: main admin removes" on public.hoop_club_creators for delete to authenticated using (private.is_moderator());

create policy "hoop_club_photos: read" on public.hoop_club_photos for select to authenticated using (true);
create policy "hoop_club_photos: admins add" on public.hoop_club_photos for insert to authenticated with check (private.is_club_admin(club_id));
create policy "hoop_club_photos: admins remove" on public.hoop_club_photos for delete to authenticated using (private.is_club_admin(club_id));

create policy "hoop_members: read" on public.hoop_members for select to authenticated
  using (status = 'active' or profile_id = (select auth.uid()) or private.is_club_admin(club_id));
create policy "hoop_members: request to join / admin adds" on public.hoop_members for insert to authenticated
  with check ((profile_id = (select auth.uid()) and private.can_post()) or private.is_club_admin(club_id));
create policy "hoop_members: edit own card / admin edits" on public.hoop_members for update to authenticated
  using (profile_id = (select auth.uid()) or private.is_club_admin(club_id))
  with check (profile_id = (select auth.uid()) or private.is_club_admin(club_id));
create policy "hoop_members: leave / admin removes" on public.hoop_members for delete to authenticated
  using (profile_id = (select auth.uid()) or private.is_club_admin(club_id));

-- games / bookings / stats / chat: per-club admins instead of one global Hoop admin list
alter policy "hoop_games: admins manage" on public.hoop_games using (private.is_club_admin(club_id)) with check (private.is_club_admin(club_id));
alter policy "hoop_events: admins record" on public.hoop_events with check (private.is_club_admin(private.club_of_game(game_id)));
alter policy "hoop_events: admins undo" on public.hoop_events using (private.is_club_admin(private.club_of_game(game_id)));
alter policy "hoop_game_players: admins assign teams" on public.hoop_game_players
  using (private.is_club_admin(private.club_of_game(game_id))) with check (private.is_club_admin(private.club_of_game(game_id)));
alter policy "hoop_game_players: book a slot" on public.hoop_game_players
  with check (((profile_id = (select auth.uid())) and (team is null) and private.can_post()) or private.is_club_admin(private.club_of_game(game_id)));
alter policy "hoop_game_players: cancel own or admin removes" on public.hoop_game_players
  using (((profile_id = (select auth.uid())) and exists (select 1 from public.hoop_games g where g.id = hoop_game_players.game_id and g.status = 'scheduled'))
         or private.is_club_admin(private.club_of_game(game_id)));
alter policy "hoop_chat: own or admin removes" on public.hoop_chat
  using ((author_id = (select auth.uid())) or private.is_club_admin(private.club_of_game(game_id)));

create or replace function private.hoop_in_schedule(p_game uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_club_admin(private.club_of_game(p_game)) or exists (
    select 1 from public.hoop_game_players gp where gp.game_id = p_game and gp.profile_id = auth.uid());
$$;

-- ============================================================ GUARDS
-- clubs: the creator becomes the owner; only the main admin can hide a club or change its owner
create or replace function private.hoop_clubs_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := btrim(new.name);
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid(); new.is_hidden := false; new.created_at := now();
  else
    new.owner_id := old.owner_id; new.is_hidden := old.is_hidden; new.created_at := old.created_at;
  end if;
  return new;
end $$;
create or replace trigger hoop_clubs_guard before insert or update on public.hoop_clubs
  for each row execute function private.hoop_clubs_guard();

create or replace function private.hoop_clubs_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null then
    insert into public.hoop_club_admins (club_id, profile_id, role, added_by) values (new.id, new.owner_id, 'owner', new.owner_id)
    on conflict (club_id, profile_id) do update set role = 'owner';
  end if;
  return new;
end $$;
create or replace trigger hoop_clubs_after after insert on public.hoop_clubs
  for each row execute function private.hoop_clubs_after();

create or replace function private.hoop_club_admins_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then new.added_by := auth.uid(); new.created_at := now(); end if;
  if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'fan' and not p.is_suspended) then
    raise exception 'HOOP: Club admins must be active Fan accounts.';
  end if;
  return new;
end $$;
create or replace trigger hoop_club_admins_guard before insert on public.hoop_club_admins
  for each row execute function private.hoop_club_admins_guard();

-- members: requests start as pending; only club admins approve / suspend / add offline players
create or replace function private.hoop_members_guard() returns trigger
language plpgsql set search_path = '' as $$
declare admin boolean;
begin
  new.name := nullif(btrim(new.name), '');
  if current_user not in ('anon', 'authenticated') then return new; end if;
  admin := private.is_club_admin(coalesce(new.club_id, old.club_id));
  if new.profile_id is not null and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id)
     and not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'fan') then
    raise exception 'HOOP: Clubs are for individual (Fan) accounts only.';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    if admin then
      if new.status = 'active' then new.approved_at := now(); new.approved_by := auth.uid(); end if;
    else
      new.status := 'pending'; new.approved_at := null; new.approved_by := null; new.name := null; new.photo_url := null;
    end if;
  else
    new.club_id := old.club_id; new.created_at := old.created_at;
    if not admin then
      new.status := old.status; new.profile_id := old.profile_id; new.approved_at := old.approved_at; new.approved_by := old.approved_by;
      new.name := old.name; new.photo_url := old.photo_url;
    elsif new.status = 'active' and old.status is distinct from 'active' then
      new.approved_at := now(); new.approved_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
create or replace trigger hoop_members_guard before insert or update on public.hoop_members
  for each row execute function private.hoop_members_guard();

-- a removed member's past games stay in the box score as a guest (their stats no longer count anywhere)
create or replace function private.hoop_members_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  nm := coalesce(old.name, (select p.display_name from public.profiles p where p.id = old.profile_id), 'Former player');
  update public.hoop_game_players set guest_id = old.id, guest_name = left(nm, 40), profile_id = null where member_id = old.id;
  update public.hoop_events set guest_id = old.id, profile_id = null where member_id = old.id;
  return old;
end $$;
create or replace trigger hoop_members_before_delete before delete on public.hoop_members
  for each row execute function private.hoop_members_before_delete();

-- notifications: join request → club admins, approval → the player
create or replace function private.hoop_members_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare club text;
begin
  if new.profile_id is null then return new; end if;
  select c.name into club from public.hoop_clubs c where c.id = new.club_id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.notifications (user_id, actor_id, type, hoop_club_id, snippet)
    select a.profile_id, new.profile_id, 'hoop_join_request', new.club_id, left(club, 140)
      from public.hoop_club_admins a where a.club_id = new.club_id and a.profile_id <> new.profile_id;
  elsif tg_op = 'UPDATE' and new.status = 'active' and old.status = 'pending' and new.approved_by is distinct from new.profile_id then
    insert into public.notifications (user_id, actor_id, type, hoop_club_id, snippet)
    values (new.profile_id, new.approved_by, 'hoop_join_approved', new.club_id, left(club, 140));
  end if;
  return new;
end $$;
create or replace trigger hoop_members_notify after insert or update of status on public.hoop_members
  for each row execute function private.hoop_members_notify();

-- the card photo becomes the profile photo when there is none (moved from hoop_players)
create or replace function private.hoop_member_photo_to_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.profile_id is not null and new.card_photo_url is not null and (tg_op = 'INSERT' or new.card_photo_url is distinct from old.card_photo_url) then
    update public.profiles set avatar_url = new.card_photo_url where id = new.profile_id and avatar_url is null;
  end if;
  return new;
end $$;
create or replace trigger hoop_member_photo_to_avatar after insert or update of card_photo_url on public.hoop_members
  for each row execute function private.hoop_member_photo_to_avatar();

-- extra games of a schedule belong to the same club
create or replace function private.hoop_games_club() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.session_id is not null then
    new.club_id := (select g.club_id from public.hoop_games g where g.id = new.session_id);
  elsif tg_op = 'UPDATE' then
    new.club_id := old.club_id;
  end if;
  if new.club_id is null then raise exception 'HOOP: Pick a club for this game.'; end if;
  return new;
end $$;
create or replace trigger hoop_games_club before insert or update of club_id, session_id on public.hoop_games
  for each row execute function private.hoop_games_club();

-- bookings: only active members of the club (club admins can add anyone; that also approves them)
create or replace function private.hoop_booking_guard() returns trigger
language plpgsql set search_path = '' as $$
declare g record; taken int; admin boolean; m record;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  perform pg_advisory_xact_lock(hashtext('hoop-book-' || new.game_id::text));
  select * into g from public.hoop_games where id = new.game_id;
  if g.id is null then raise exception 'HOOP: That game doesn’t exist.'; end if;
  admin := private.is_club_admin(g.club_id);
  if new.guest_id is not null then
    if not admin then raise exception 'HOOP: Only a club admin can add guest players.'; end if;
    new.profile_id := null; new.member_id := null; new.guest_name := btrim(new.guest_name);
  elsif new.member_id is not null then
    select * into m from public.hoop_members where id = new.member_id and club_id = g.club_id;
    if m.id is null then raise exception 'HOOP: That player isn’t in this club.'; end if;
    if not admin and (m.profile_id is distinct from auth.uid() or m.status <> 'active') then raise exception 'HOOP: You can only book for yourself.'; end if;
    if m.status = 'suspended' then raise exception 'HOOP: This player is suspended from the club.'; end if;
    new.profile_id := m.profile_id;
  elsif new.profile_id is not null then
    if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'fan') then
      raise exception 'HOOP: Clubs are for individual (Fan) accounts only.';
    end if;
    select * into m from public.hoop_members where club_id = g.club_id and profile_id = new.profile_id;
    if m.id is null then
      if not admin then raise exception 'HOOP: Join this club first — tap “My Card” to send your player card for approval.'; end if;
      insert into public.hoop_members (club_id, profile_id, status, approved_at, approved_by)
        values (g.club_id, new.profile_id, 'active', now(), auth.uid()) returning * into m;
    elsif m.status = 'suspended' then
      raise exception 'HOOP: This player is suspended from the club.';
    elsif m.status = 'pending' then
      if not admin then raise exception 'HOOP: Your player card is still waiting for the club admin’s approval.'; end if;
      update public.hoop_members set status = 'active' where id = m.id;
    end if;
    new.member_id := m.id;
  else
    raise exception 'HOOP: Pick a player.';
  end if;
  if not admin then
    new.team := null; new.paid := false; new.paid_at := null; new.arrived_at := null;
    if g.session_id is not null then raise exception 'HOOP: Book the main schedule instead.'; end if;
    if g.status <> 'scheduled' then raise exception 'HOOP: Booking is closed for this game.'; end if;
    if g.starts_at < now() then raise exception 'HOOP: This game already started.'; end if;
    select count(*) into taken from public.hoop_game_players where game_id = new.game_id;
    if taken >= g.slots then raise exception 'HOOP: Sorry, this game is full.'; end if;
  end if;
  new.booked_at := now();
  return new;
end $$;

-- stat taps: find the player's team (member, account or guest) and fill in the rest
create or replace function private.hoop_event_guard() returns trigger
language plpgsql set search_path = '' as $$
declare gp record; g record;
begin
  select * into g from public.hoop_games where id = new.game_id;
  if g.status <> 'live' then raise exception 'HOOP: Start the game first.'; end if;
  select * into gp from public.hoop_game_players x
   where x.game_id = new.game_id
     and ((new.member_id is not null and x.member_id = new.member_id)
       or (new.member_id is null and new.guest_id is not null and x.guest_id = new.guest_id)
       or (new.member_id is null and new.guest_id is null and new.profile_id is not null and x.profile_id = new.profile_id))
   limit 1;
  if gp.team is null then raise exception 'HOOP: Put this player on a team first.'; end if;
  new.member_id := gp.member_id; new.profile_id := gp.profile_id; new.guest_id := gp.guest_id;
  new.team := gp.team; new.period := g.period; new.created_by := auth.uid(); new.created_at := now();
  return new;
end $$;

-- deleting a played game: club owner or main admin only
create or replace function private.hoop_delete_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') or private.is_club_owner(old.club_id) then return old; end if;
  if old.status in ('live', 'final')
     or exists (select 1 from public.hoop_games c where c.session_id = old.id and c.status in ('live', 'final')) then
    raise exception 'HOOP: Only the club owner can delete a game that was already played.';
  end if;
  return old;
end $$;

-- props: the player must be an active member of some club
create or replace function private.hoop_props_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.created_at := now(); new.updated_at := now();
    if not exists (select 1 from public.hoop_members m where m.profile_id = new.player_id and m.status = 'active') then
      raise exception 'HOOP: This member hasn’t joined a club yet.';
    end if;
  else
    new.player_id := old.player_id; new.author_id := old.author_id; new.created_at := old.created_at;
    if auth.uid() = old.player_id and auth.uid() <> old.author_id then
      new.message := old.message;
      new.updated_at := old.updated_at;
    else
      new.status := case when new.message is distinct from old.message then 'pending' else old.status end;
      new.updated_at := now();
    end if;
  end if;
  return new;
end $$;

-- ============================================================ STATS per member (per club card), finished games only
create or replace view public.hoop_member_stats with (security_invoker = true) as
with played as (
  select gp.member_id, gp.game_id, gp.team, s.score_a, s.score_b
  from public.hoop_game_players gp
  join public.hoop_games g on g.id = gp.game_id and g.status = 'final'
  join public.hoop_game_scores s on s.game_id = gp.game_id
  where gp.team is not null and gp.member_id is not null
), per as (
  select p.member_id, p.game_id,
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
  from played p left join public.hoop_events e on e.game_id = p.game_id and e.member_id = p.member_id
  group by p.member_id, p.game_id, p.team, p.score_a, p.score_b
)
select member_id,
       count(*)::int as games,
       count(*) filter (where won)::int as wins,
       count(*) filter (where not won and not tied)::int as losses,
       sum(pts)::int as pts, sum(threes)::int as threes, sum(reb)::int as reb, sum(ast)::int as ast,
       sum(stl)::int as stl, sum(blk)::int as blk, sum(tov)::int as tov, sum(fouls)::int as fouls,
       round(avg(pts), 1)::float as ppg, round(avg(reb), 1)::float as rpg, round(avg(ast), 1)::float as apg,
       round(avg(stl), 1)::float as spg, round(avg(blk), 1)::float as bpg, round(avg(threes), 1)::float as tpg,
       round(avg(tov), 1)::float as topg, round(avg(fouls), 1)::float as fpg,
       max(pts)::int as best_pts
from per group by member_id;
grant select on public.hoop_member_stats to authenticated;

alter table public.hoop_members replica identity full;
alter table public.hoop_clubs replica identity full;
alter publication supabase_realtime add table public.hoop_members;
alter publication supabase_realtime add table public.hoop_clubs;

-- ============================================================ MOVE EVERYTHING INTO THE FIRST CLUB
do $$
declare club uuid; owner uuid;
begin
  select m.user_id into owner from public.moderators m order by m.user_id limit 1;
  insert into public.hoop_clubs (name, tagline, rules, logo_url, cover_url, theme, owner_id, location)
  values ('HOOP METHOD SUNDAY BASKETBALL', 'Sunday pickup runs in Davao',
    'Book ahead — Slots are limited, so book your slot before game day.' || E'\n' ||
    'Pay ahead — Pay before the schedule. If your slot is still unpaid a day before the game, it may be given to someone else or removed.' || E'\n' ||
    'Proper attire — Wear proper basketball shoes and clothes. No slippers, no improper attire, no jewelry.' || E'\n' ||
    'Play at your own risk — This is a friendly game, so take care of yourself and each other. The club has no budget for injuries and can’t pay for medicine or hospital bills.' || E'\n' ||
    'The app can have bugs — If something looks wrong with slots, schedules or stats, let the admin know.' || E'\n' ||
    'We’re still growing — Concerns or suggestions? Message the admin anytime.',
    '/hoop-method-logo.jpg', '/hoop-method-logo.jpg', '{"primary":"#F28C14","accent":"#F26A2E"}', owner, 'Davao City')
  returning id into club;

  insert into public.hoop_club_admins (club_id, profile_id, role, added_by)
    select club, a.profile_id, 'admin', a.added_by from public.hoop_admins a on conflict do nothing;

  insert into public.hoop_members (club_id, profile_id, jersey_number, position, height, card_photo_url, card_photo_crop, status, created_at, approved_at, approved_by)
    select club, h.profile_id, h.jersey_number, h.position, h.height, h.card_photo_url, h.card_photo_crop, 'active', h.created_at, h.created_at, owner
    from public.hoop_players h on conflict do nothing;

  update public.hoop_games set club_id = club where club_id is null;
  update public.hoop_game_players gp set member_id = m.id
    from public.hoop_members m where m.club_id = club and m.profile_id = gp.profile_id and gp.member_id is null;
  update public.hoop_events e set member_id = m.id
    from public.hoop_members m where m.club_id = club and m.profile_id = e.profile_id and e.member_id is null;
end $$;

alter table public.hoop_games alter column club_id set not null;
