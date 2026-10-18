-- =====================================================================================================
-- HOOP METHOD · CLUB SUBSCRIPTIONS (₱400 / month after a 30-day free trial) + each club's own 1-of-1 card
--
-- • A new club gets 30 free days (paid_until = created + 30 days). The main admin's own clubs are free (billing_free).
-- • When paid_until passes, the club is LOCKED: no new schedules/games, no new bookings, no starting a game.
--   Everything stays visible (cards, stats, history). Games already running can still be finished.
-- • Owners pay by GCash and send the screenshot to the main admin in Messages; the main admin confirms it with
--   hoop_club_add_months() → +1 month per payment (logged in hoop_club_payments) and the owner gets a notification.
-- • Card packs + the 1-of-1 only run in clubs that have a 1-of-1 design (oneofone_url). Hoop Method uses the built-in
--   one; the main admin uploads every other club's design. In those clubs the club OWNER picks the 1-of-1 winner.
-- Only the main admin can change paid_until / billing_free / oneofone_url.
-- =====================================================================================================

alter table public.hoop_clubs
  add column if not exists paid_until   timestamptz,
  add column if not exists billing_free boolean not null default false,
  add column if not exists oneofone_url text;

update public.hoop_clubs set billing_free = true, oneofone_url = '/hoop-cards/oneofone-frame.webp'
 where owner_id = private.hoop_main_admin();
update public.hoop_clubs set paid_until = created_at + interval '30 days' where paid_until is null and not billing_free;

-- ---------------------------------------------------------------- who may change the billing fields
create or replace function private.hoop_clubs_billing_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if auth.uid() = private.hoop_main_admin() then
    if tg_op = 'INSERT' and new.paid_until is null and not new.billing_free then new.billing_free := true; end if;   -- my own clubs are free
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.billing_free := false; new.oneofone_url := null; new.paid_until := now() + interval '30 days';   -- 1-month free trial
  else
    new.billing_free := old.billing_free; new.oneofone_url := old.oneofone_url; new.paid_until := old.paid_until;
  end if;
  return new;
end $$;
create trigger hoop_clubs_billing_guard before insert or update on public.hoop_clubs
  for each row execute function private.hoop_clubs_billing_guard();

create or replace function private.hoop_club_active(p_club uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select c.billing_free or c.paid_until is null or c.paid_until > now() from public.hoop_clubs c where c.id = p_club), true);
$$;

-- ---------------------------------------------------------------- the lock
create or replace function private.hoop_billing_lock() returns trigger language plpgsql security invoker set search_path = '' as $$
declare cid uuid; st text;
begin
  if current_user not in ('anon', 'authenticated') or auth.uid() = private.hoop_main_admin() then return new; end if;
  if tg_table_name = 'hoop_games' then
    if tg_op = 'UPDATE' and not (new.status = 'live' and old.status = 'scheduled') then return new; end if;
    cid := new.club_id;
  else
    select g.club_id, g.status into cid, st from public.hoop_games g where g.id = new.game_id;
    if st is distinct from 'scheduled' then return new; end if;   -- a game already running can still be filled in
  end if;
  if cid is not null and not private.hoop_club_active(cid) then
    raise exception 'HOOP: This club’s subscription has ended — new games and bookings are paused until the club owner renews (₱400/month).';
  end if;
  return new;
end $$;
-- (named hoop_z… so they run after the triggers that fill in club_id / check the booking)
create trigger hoop_z_billing_lock before insert or update of status on public.hoop_games
  for each row execute function private.hoop_billing_lock();
create trigger hoop_z_billing_lock before insert on public.hoop_game_players
  for each row execute function private.hoop_billing_lock();

-- ---------------------------------------------------------------- payments (confirmed by the main admin)
create table if not exists public.hoop_club_payments (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.hoop_clubs(id) on delete cascade,
  months      int not null check (months between 1 and 12),
  amount      int not null check (amount >= 0),
  reference   text,
  paid_until  timestamptz not null,
  approved_by uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists hoop_club_payments_club_idx on public.hoop_club_payments(club_id, created_at desc);
alter table public.hoop_club_payments enable row level security;
create policy "main admin or club admins read" on public.hoop_club_payments for select to authenticated
  using (auth.uid() = private.hoop_main_admin() or private.is_club_admin(club_id));
grant select on public.hoop_club_payments to authenticated;
revoke insert, update, delete, truncate on public.hoop_club_payments from anon, authenticated;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'comment', 'mention_post', 'mention_comment', 'reaction', 'follow', 'band_follow', 'review_pending', 'review_approved', 'rsvp',
  'playlist_like', 'playlist_copy', 'venue_tag', 'track_like', 'track_comment', 'mention_track_comment', 'band_member', 'band_admin',
  'hoop_props', 'hoop_props_approved', 'hoop_join_request', 'hoop_join_approved', 'hoop_club_admin', 'hoop_club_creator', 'hoop_pack',
  'hoop_billing', 'hoop_club_new']::text[]));

create or replace function public.hoop_club_add_months(p_club uuid, p_months int default 1, p_amount int default 400, p_reference text default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare c record; v_until timestamptz;
begin
  if auth.uid() is distinct from private.hoop_main_admin() then raise exception 'HOOP: Only the main admin can confirm payments.'; end if;
  if p_months is null or p_months < 1 or p_months > 12 then raise exception 'HOOP: Pick 1 to 12 months.'; end if;
  select * into c from public.hoop_clubs where id = p_club for update;
  if c.id is null then raise exception 'HOOP: That club doesn’t exist.'; end if;
  -- paid early → add on top of the time left; paid late → a new month starts today
  v_until := greatest(coalesce(c.paid_until, now()), now()) + make_interval(months => p_months);
  update public.hoop_clubs set paid_until = v_until where id = p_club;
  insert into public.hoop_club_payments (club_id, months, amount, reference, paid_until)
    values (p_club, p_months, greatest(0, coalesce(p_amount, 0)), nullif(btrim(coalesce(p_reference, '')), ''), v_until);
  insert into public.notifications (user_id, actor_id, type, hoop_club_id, snippet)
  select a.profile_id, auth.uid(), 'hoop_billing', p_club, left(c.name || ' · active until ' || to_char(v_until at time zone 'Asia/Manila', 'Mon FMDD, YYYY'), 140)
    from public.hoop_club_admins a where a.club_id = p_club and a.role = 'owner' and a.profile_id <> auth.uid();
  return v_until;
end $$;
revoke all on function public.hoop_club_add_months(uuid, int, int, text) from public, anon;
grant execute on function public.hoop_club_add_months(uuid, int, int, text) to authenticated;

-- the main admin hears about every new club (its trial started)
create or replace function private.hoop_club_new_notify() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is distinct from private.hoop_main_admin() then
    insert into public.notifications (user_id, actor_id, type, hoop_club_id, snippet)
    values (private.hoop_main_admin(), new.owner_id, 'hoop_club_new', new.id, left(new.name, 140));
  end if;
  return new;
end $$;
create trigger hoop_club_new_notify after insert on public.hoop_clubs for each row execute function private.hoop_club_new_notify();

-- ---------------------------------------------------------------- card packs: only clubs with a 1-of-1 design; their owner picks
create or replace function private.hoop_make_packs(p_schedule uuid) returns void language plpgsql security definer set search_path = '' as $$
declare drawn boolean;
begin
  if not exists (select 1 from public.hoop_games g where g.id = p_schedule and g.session_id is null and g.closed_at is not null
                   and g.starts_at >= private.hoop_packs_start()
                   and exists (select 1 from public.hoop_clubs c where c.id = g.club_id and c.oneofone_url is not null)) then return; end if;   -- packs only in clubs with a 1-of-1 design
  drawn := exists (select 1 from public.hoop_pack_draws d where d.schedule_id = p_schedule);
  if not drawn then
    delete from public.hoop_packs p
     where p.schedule_id = p_schedule and p.status = 'waiting'
       and not exists (
         select 1 from public.hoop_game_players gp
           join public.hoop_games g on g.id = gp.game_id and g.status = 'final' and coalesce(g.session_id, g.id) = p_schedule
          where gp.member_id = p.member_id and gp.team is not null);
  end if;
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
    returning id, member_id
  )
  insert into private.hoop_pack_contents (pack_id, cards)
  select id, private.hoop_member_cards(member_id) from made where drawn;
end $$;

create or replace function public.hoop_draw_pack_winner(p_schedule uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s record; last_winner uuid; club text;
begin
  select * into s from public.hoop_games where id = p_schedule and session_id is null;
  if s.id is null then raise exception 'HOOP: That schedule doesn''t exist.'; end if;
  if auth.uid() is distinct from private.hoop_main_admin() and not private.is_club_owner(s.club_id) then
    raise exception 'HOOP: Only the club owner can pick the 1-of-1 winner.';
  end if;
  if not exists (select 1 from public.hoop_clubs c where c.id = s.club_id and c.oneofone_url is not null) then
    raise exception 'HOOP: This club doesn''t have its 1-of-1 card design yet.';
  end if;
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
         lateral (select private.hoop_member_cards(p.member_id) as cards, case when p.member_id = p_member then 1 + floor(random() * 5)::int end as slot) x0,
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

drop policy if exists "own packs or main admin" on public.hoop_packs;
create policy "own packs, club owner or main admin" on public.hoop_packs for select to authenticated using (
  auth.uid() = private.hoop_main_admin() or private.is_club_owner(club_id)
  or exists (select 1 from public.hoop_members m where m.id = member_id and m.profile_id = auth.uid()));
drop policy if exists "main admin only" on public.hoop_pack_draws;
create policy "club owner or main admin" on public.hoop_pack_draws for select to authenticated
  using (auth.uid() = private.hoop_main_admin() or private.is_club_owner(club_id));
