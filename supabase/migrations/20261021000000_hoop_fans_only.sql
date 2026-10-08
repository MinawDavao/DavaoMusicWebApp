-- Sunday Hoop Method is for individual (Fan) accounts only — not Artist or Venue/Business accounts.
create or replace function private.hoop_booking_guard() returns trigger
language plpgsql set search_path = '' as $$
declare g record; taken int;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  select * into g from public.hoop_games where id = new.game_id;
  if g.id is null then raise exception 'HOOP: That game doesn’t exist.'; end if;
  if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'fan') then
    raise exception 'HOOP: Sunday Hoop Method is for individual (Fan) accounts only.';
  end if;
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

alter policy "hoop_players: own card" on public.hoop_players
  with check (profile_id = (select auth.uid()) and private.is_active_user()
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'fan'));
alter policy "hoop_props: write own" on public.hoop_props
  with check (author_id = (select auth.uid()) and private.can_post() and not private.blocked_with(player_id)
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'fan'));
