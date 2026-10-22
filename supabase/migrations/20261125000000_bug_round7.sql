-- Bug check round 7
-- 1) Chosen cards: "only 10 ever" survives a player leaving the club (the card stays, without its owner, and keeps its number)
alter table public.hoop_numbered_cards alter column member_id drop not null;
alter table public.hoop_numbered_cards drop constraint hoop_numbered_cards_member_id_fkey;
alter table public.hoop_numbered_cards add constraint hoop_numbered_cards_member_id_fkey
  foreign key (member_id) references public.hoop_members(id) on delete set null;

-- 2) a pack that is deleted before it's opened (schedule deleted) gives its unrevealed Chosen number back
create or replace function private.hoop_pack_gone() returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  delete from public.hoop_numbered_cards where pack_id = old.id and revealed_at is null;
  return old;
end $f$;
revoke all on function private.hoop_pack_gone() from public, anon, authenticated;
drop trigger if exists hoop_pack_gone on public.hoop_packs;
create trigger hoop_pack_gone before delete on public.hoop_packs for each row execute function private.hoop_pack_gone();

-- 3) draws lock their club, so two at once can't pick the same Chosen number
CREATE OR REPLACE FUNCTION public.hoop_draw_pack_winner(p_schedule uuid, p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s record; last_winner uuid; club text; issued int; r record; ser int; slot int; nid uuid;
begin
  select * into s from public.hoop_games where id = p_schedule and session_id is null;
  if s.id is null then raise exception 'HOOP: That schedule doesn''t exist.'; end if;
  if auth.uid() is distinct from private.hoop_main_admin() and not private.is_club_owner(s.club_id) then
    raise exception 'HOOP: Only the club owner can pick the 1-of-1 winner.';
  end if;
  if not exists (select 1 from public.hoop_clubs c where c.id = s.club_id and c.oneofone_url is not null) then
    raise exception 'HOOP: This club doesn''t have its 1-of-1 card design yet.';
  end if;
  if s.closed_at is null then raise exception 'HOOP: Close the schedule first.'; end if;
  -- one draw at a time per club: two schedules drawn at once would pick the same Chosen numbers
  perform 1 from public.hoop_clubs c where c.id = s.club_id for update;
  if exists (select 1 from public.hoop_pack_draws where schedule_id = p_schedule) then raise exception 'HOOP: The winner for this schedule was already picked.'; end if;
  perform private.hoop_make_packs(p_schedule);
  if p_member is not null then
    if not exists (select 1 from public.hoop_packs where schedule_id = p_schedule and member_id = p_member) then
      raise exception 'HOOP: That player didn''t play in this schedule.';
    end if;
    select d.winner_member_id into last_winner from public.hoop_pack_draws d where d.club_id = s.club_id and d.winner_member_id is not null order by d.drawn_at desc limit 1;
    if last_winner = p_member then raise exception 'HOOP: This player won the last 1-of-1 — pick someone else this time.'; end if;
  end if;

  insert into public.hoop_pack_draws (schedule_id, club_id, winner_member_id, drawn_by) values (p_schedule, s.club_id, p_member, auth.uid());
  insert into private.hoop_pack_contents (pack_id, cards, one_slot)
  select p.id, x.cards, x.slot
    from public.hoop_packs p,
         lateral (select private.hoop_member_cards(p.member_id) as cards, case when p_member is not null and p.member_id = p_member then 1 + floor(random() * 5)::int end as slot) x0,
         lateral (select case when x0.slot is null then x0.cards else x0.cards[1:x0.slot - 1] || 'oneofone'::text || x0.cards[x0.slot + 1:5] end as cards, x0.slot) x
   where p.schedule_id = p_schedule
  on conflict (pack_id) do nothing;
  if exists (select 1 from public.hoop_clubs c where c.id = s.club_id and c.selected_url is not null) then
    select count(*) into issued from public.hoop_numbered_cards n where n.club_id = s.club_id and n.series = 'selected';
    for r in
      select p.id as pack_id, p.member_id from public.hoop_packs p
       where p.schedule_id = p_schedule and p.member_id is distinct from p_member
         and not exists (select 1 from public.hoop_numbered_cards n where n.club_id = s.club_id and n.series = 'selected' and n.member_id = p.member_id)
       order by random() limit greatest(0, 10 - issued)
    loop
      select x into ser from generate_series(1, 10) x
       where x not in (select n.serial from public.hoop_numbered_cards n where n.club_id = s.club_id and n.series = 'selected')
       order by random() limit 1;
      exit when ser is null;
      slot := 1 + floor(random() * 5)::int;
      insert into public.hoop_numbered_cards (club_id, series, serial, total, member_id, schedule_id, pack_id)
        values (s.club_id, 'selected', ser, 10, r.member_id, p_schedule, r.pack_id) returning id into nid;
      update private.hoop_pack_contents set cards[slot] = 'selected', sel_slot = slot, sel_card = nid where pack_id = r.pack_id;
    end loop;
  end if;

  update public.hoop_packs set status = 'ready', ready_at = now() where schedule_id = p_schedule and status = 'waiting';

  select c.name into club from public.hoop_clubs c where c.id = s.club_id;
  insert into public.notifications (user_id, actor_id, type, hoop_club_id, snippet)
  select m.profile_id, auth.uid(), 'hoop_pack', s.club_id, left(club, 140)
    from public.hoop_packs p join public.hoop_members m on m.id = p.member_id
   where p.schedule_id = p_schedule and m.profile_id is not null and m.profile_id <> auth.uid();
end $function$;

-- 4) billing lock: scheduled -> final also checked
CREATE OR REPLACE FUNCTION private.hoop_billing_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare cid uuid; st text; sched uuid; until timestamptz; free boolean;
        is_game boolean := tg_table_name = 'hoop_games'; upd boolean := tg_op = 'UPDATE';
        new_status text; old_status text; new_started timestamptz; old_started timestamptz; started_changed boolean := false;
begin
  if current_user not in ('anon', 'authenticated') or auth.uid() = private.hoop_main_admin() then return new; end if;
  if is_game then
    new_status := new.status; new_started := new.started_at; cid := new.club_id; sched := coalesce(new.session_id, new.id);
    if upd then
      old_status := old.status; old_started := old.started_at;
      started_changed := new_started is distinct from old_started;
      -- round 7: a game that never went live can't jump straight to final while the club is locked
      if not started_changed and new_status is distinct from 'live' and not (old_status = 'scheduled' and new_status = 'final') then return new; end if;
      if not started_changed and old_status = 'live' then return new; end if;
    end if;
  else
    select g.club_id, g.status, coalesce(g.session_id, g.id) into cid, st, sched from public.hoop_games g where g.id = new.game_id;
    if st is distinct from 'scheduled' then return new; end if;
  end if;
  if cid is null then return new; end if;
  select c.billing_free, c.paid_until into free, until from public.hoop_clubs c where c.id = cid;
  if free or until is null or until > now() then return new; end if;
  if is_game and upd and old_status = 'final' and old_started is not null and old_started < until and not started_changed then return new; end if;
  if (not started_changed or (old_started is null and new_status = 'live')) and exists (
       select 1 from public.hoop_games r
        where r.id = sched and r.closed_at is null and r.started_at is not null
          and r.started_at < until and r.started_at > now() - interval '18 hours') then
    return new;
  end if;
  raise exception 'HOOP: This club’s subscription has ended — new games and bookings are paused until the club owner renews (₱400/month).';
end $function$;

-- 5) a player booking themselves always starts on the court
create or replace function private.hoop_booking_guard_on_court() returns trigger language plpgsql set search_path = '' as $f$
begin
  if current_user in ('anon', 'authenticated') and not private.is_club_admin((select g.club_id from public.hoop_games g where g.id = new.game_id)) then
    new.on_court := true;
  end if;
  return new;
end $f$;
drop trigger if exists hoop_booking_on_court on public.hoop_game_players;
create trigger hoop_booking_on_court before insert on public.hoop_game_players for each row execute function private.hoop_booking_guard_on_court();
