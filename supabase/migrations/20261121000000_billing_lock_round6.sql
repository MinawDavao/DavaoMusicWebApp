-- Bug check round 6: tighten the subscription lock, without stopping a night that already started.
--  • A locked club can't turn ANY game live (e.g. scheduled → final → "reopen"), except reopening a game that really
--    was played before the subscription ran out (to fix its stats). It also can't change started_at while locked.
--  • A schedule that already started before the subscription ran out can keep going: Game 2, 3… can be added,
--    started and filled in until the schedule is closed (same night: up to 18 hours after it started).
create or replace function private.hoop_billing_lock() returns trigger language plpgsql security invoker set search_path = '' as $$
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
      if not started_changed and new_status is distinct from 'live' then return new; end if;   -- only "going live" / start time matter
      if not started_changed and old_status = 'live' then return new; end if;
    end if;
  else
    select g.club_id, g.status, coalesce(g.session_id, g.id) into cid, st, sched from public.hoop_games g where g.id = new.game_id;
    if st is distinct from 'scheduled' then return new; end if;   -- a game already running can still be filled in
  end if;
  if cid is null then return new; end if;
  select c.billing_free, c.paid_until into free, until from public.hoop_clubs c where c.id = cid;
  if free or until is null or until > now() then return new; end if;
  -- reopening a game that was really played while the club was paid up (to fix its stats) is fine
  if is_game and upd and old_status = 'final' and old_started is not null and old_started < until and not started_changed then return new; end if;
  -- the rest of a schedule that started while the club was paid up is fine (same night, until it's closed)
  if (not started_changed or (old_started is null and new_status = 'live')) and exists (
       select 1 from public.hoop_games r
        where r.id = sched and r.closed_at is null and r.started_at is not null
          and r.started_at < until and r.started_at > now() - interval '18 hours') then
    return new;
  end if;
  raise exception 'HOOP: This club’s subscription has ended — new games and bookings are paused until the club owner renews (₱400/month).';
end $$;

drop trigger if exists hoop_z_billing_lock on public.hoop_games;
create trigger hoop_z_billing_lock before insert or update of status, started_at on public.hoop_games
  for each row execute function private.hoop_billing_lock();
