-- Hoop Method admins: the main admin (moderators) can give a member Hoop-only admin powers,
-- so games can be run when the main admin isn't at the court.
-- Hoop admins can: create/edit schedules, set teams, mark arrivals & payments, add guests, run the live console,
-- finish games, remove chat messages. They can't add other Hoop admins and get no powers outside Hoop Method.

create table if not exists public.hoop_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.hoop_admins enable row level security;

create or replace function private.is_hoop_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator() or exists (select 1 from public.hoop_admins a where a.profile_id = auth.uid());
$$;

create policy "hoop_admins: members read" on public.hoop_admins for select to authenticated using (true);
create policy "hoop_admins: main admin adds" on public.hoop_admins for insert to authenticated
  with check (private.is_moderator() and exists (select 1 from public.profiles p where p.id = profile_id and p.role = 'fan' and not p.is_suspended));
create policy "hoop_admins: main admin removes" on public.hoop_admins for delete to authenticated using (private.is_moderator());

create or replace function private.hoop_admins_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then new.added_by := auth.uid(); new.created_at := now(); end if;
  return new;
end $$;
create or replace trigger hoop_admins_guard before insert on public.hoop_admins
  for each row execute function private.hoop_admins_guard();

-- Hoop powers: moderators OR Hoop admins
alter policy "hoop_games: admins manage" on public.hoop_games using (private.is_hoop_admin()) with check (private.is_hoop_admin());
alter policy "hoop_events: admins record" on public.hoop_events with check (private.is_hoop_admin());
alter policy "hoop_events: admins undo" on public.hoop_events using (private.is_hoop_admin());
alter policy "hoop_game_players: admins assign teams" on public.hoop_game_players using (private.is_hoop_admin()) with check (private.is_hoop_admin());
alter policy "hoop_game_players: book a slot" on public.hoop_game_players
  with check (((profile_id = (select auth.uid())) and (team is null) and private.can_post()) or private.is_hoop_admin());
alter policy "hoop_game_players: cancel own or admin removes" on public.hoop_game_players
  using (((profile_id = (select auth.uid())) and exists (select 1 from public.hoop_games g where g.id = hoop_game_players.game_id and g.status = 'scheduled')) or private.is_hoop_admin());
alter policy "hoop_chat: own or admin removes" on public.hoop_chat
  using ((author_id = (select auth.uid())) or private.is_hoop_admin());

create or replace function private.hoop_in_schedule(p_game uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_hoop_admin() or exists (
    select 1 from public.hoop_game_players gp where gp.game_id = p_game and gp.profile_id = auth.uid());
$$;

create or replace function private.hoop_booking_guard() returns trigger
language plpgsql set search_path = '' as $$
declare g record; taken int;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  perform pg_advisory_xact_lock(hashtext('hoop-book-' || new.game_id::text));
  select * into g from public.hoop_games where id = new.game_id;
  if g.id is null then raise exception 'HOOP: That game doesn’t exist.'; end if;
  if new.guest_id is not null or new.profile_id is null then
    if not private.is_hoop_admin() then raise exception 'HOOP: Only a Hoop admin can add guest players.'; end if;
    if new.guest_id is null then raise exception 'HOOP: Pick a player.'; end if;
    new.profile_id := null;
    new.guest_name := btrim(new.guest_name);
  elsif not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'fan') then
    raise exception 'HOOP: Sunday Hoop Method is for individual (Fan) accounts only.';
  end if;
  if not private.is_hoop_admin() then
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

alter publication supabase_realtime add table public.hoop_admins;
