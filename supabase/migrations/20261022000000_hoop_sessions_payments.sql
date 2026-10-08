-- Hoop Method: several games per schedule ("Game 2", "Game 3"… share the schedule's bookings),
-- and admins can mark each booked player as paid.

alter table public.hoop_games add column if not exists session_id uuid references public.hoop_games(id) on delete cascade;
create index if not exists hoop_games_session_idx on public.hoop_games (session_id);

alter table public.hoop_game_players add column if not exists paid boolean not null default false;
alter table public.hoop_game_players add column if not exists paid_at timestamptz;

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
    new.team := null; new.paid := false; new.paid_at := null;
    if g.session_id is not null then raise exception 'HOOP: Book the main schedule instead.'; end if;
    if g.status <> 'scheduled' then raise exception 'HOOP: Booking is closed for this game.'; end if;
    if g.starts_at < now() then raise exception 'HOOP: This game already started.'; end if;
    select count(*) into taken from public.hoop_game_players where game_id = new.game_id;
    if taken >= g.slots then raise exception 'HOOP: Sorry, this game is full.'; end if;
  end if;
  new.booked_at := now();
  perform private.hoop_ensure_player(new.profile_id);
  return new;
end $$;
