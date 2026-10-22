-- Cards follow Hoop Method: whatever card Hoop Method (the lead club, owned by the main admin) gives out
-- becomes available to every other club — at the same schedule number where Hoop Method first gave it.
--   1-of-1 + card packs: Hoop Method's 2nd schedule  -> other clubs from their 2nd schedule
--   Chosen cards:        released after Hoop Method's first Chosen draw -> other clubs from that schedule number
-- Level cards (L1/L2/L3) already follow each player's own schedules in their club.

create or replace function private.hoop_lead_club() returns uuid language sql stable security definer set search_path = '' as
$$ select c.id from public.hoop_clubs c where c.owner_id = private.hoop_main_admin() order by c.created_at limit 1 $$;

-- a schedule's number in its club: 1st, 2nd, 3rd… (earlier schedules count once they're closed and were played)
create or replace function private.hoop_schedule_no(p_schedule uuid) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
    from public.hoop_games s
    join public.hoop_games r on r.club_id = s.club_id and r.session_id is null
     and (r.id = s.id or (r.closed_at is not null and exists (
           select 1 from public.hoop_games x where coalesce(x.session_id, x.id) = r.id and x.status = 'final')))
     and (r.starts_at, r.created_at, r.id) <= (s.starts_at, s.created_at, s.id)
   where s.id = p_schedule
$$;

-- when Hoop Method first gave a card, and at which of its schedules (kept for good, even if that schedule changes later)
create table if not exists private.hoop_card_releases (
  kind        text primary key,
  step        int  not null check (step >= 1),
  schedule_id uuid,
  released_at timestamptz not null default now()
);
revoke all on private.hoop_card_releases from public, anon, authenticated;
insert into private.hoop_card_releases (kind, step, schedule_id, released_at)
select 'oneofone', private.hoop_schedule_no(d.schedule_id), d.schedule_id, d.drawn_at
  from public.hoop_pack_draws d
 where d.club_id = private.hoop_lead_club() and d.winner_member_id is not null
 order by d.drawn_at limit 1
on conflict (kind) do nothing;
insert into private.hoop_card_releases (kind, step, schedule_id, released_at)
select 'selected', private.hoop_schedule_no(n.schedule_id), n.schedule_id, n.created_at
  from public.hoop_numbered_cards n
 where n.club_id = private.hoop_lead_club() and n.series = 'selected' and n.schedule_id is not null
 order by n.created_at limit 1
on conflict (kind) do nothing;

-- does this club give out this card at this schedule?
create or replace function private.hoop_club_gets(p_club uuid, p_kind text, p_schedule uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $f$
declare st int;
begin
  if p_club = private.hoop_lead_club() then
    return exists (select 1 from public.hoop_clubs c where c.id = p_club
                     and case p_kind when 'oneofone' then c.oneofone_url is not null when 'selected' then c.selected_url is not null else false end);
  end if;
  select r.step into st from private.hoop_card_releases r where r.kind = p_kind;
  return st is not null and private.hoop_schedule_no(p_schedule) >= st;
end $f$;
revoke all on function private.hoop_club_gets(uuid, text, uuid) from public, anon, authenticated;

-- for the app: what this club has unlocked (played = closed, played schedules so far)
create or replace function public.hoop_club_unlocks(p_club uuid) returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'lead', c.id = private.hoop_lead_club(),
    'played', (select count(*) from public.hoop_games r where r.club_id = c.id and r.session_id is null and r.closed_at is not null
                 and exists (select 1 from public.hoop_games x where coalesce(x.session_id, x.id) = r.id and x.status = 'final')),
    'packs_from', case when c.id = private.hoop_lead_club() then (case when c.oneofone_url is not null then 1 end)
                       else (select r.step from private.hoop_card_releases r where r.kind = 'oneofone') end,
    'chosen_from', case when c.id = private.hoop_lead_club() then (case when c.selected_url is not null then 1 end)
                        else (select r.step from private.hoop_card_releases r where r.kind = 'selected') end)
  from public.hoop_clubs c where c.id = p_club
$$;
grant execute on function public.hoop_club_unlocks(uuid) to anon, authenticated;

CREATE OR REPLACE FUNCTION private.hoop_make_packs(p_schedule uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare drawn boolean;
begin
  if not exists (select 1 from public.hoop_games g where g.id = p_schedule and g.session_id is null and g.closed_at is not null
                   and g.starts_at >= private.hoop_packs_start()
                   and private.hoop_club_gets(g.club_id, 'oneofone', g.id)) then return; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.hoop_draw_pack_winner(p_schedule uuid, p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s record; last_winner uuid; club text; issued int; r record; ser int; slot int; nid uuid; lead boolean;
begin
  select * into s from public.hoop_games where id = p_schedule and session_id is null;
  if s.id is null then raise exception 'HOOP: That schedule doesn''t exist.'; end if;
  if auth.uid() is distinct from private.hoop_main_admin() and not private.is_club_owner(s.club_id) then
    raise exception 'HOOP: Only the club owner can pick the 1-of-1 winner.';
  end if;
  if s.closed_at is null then raise exception 'HOOP: Close the schedule first.'; end if;
  if not private.hoop_club_gets(s.club_id, 'oneofone', p_schedule) then
    raise exception 'HOOP: Card packs and the 1-of-1 aren''t unlocked for this schedule yet.';
  end if;
  lead := s.club_id = private.hoop_lead_club();
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
  if private.hoop_club_gets(s.club_id, 'selected', p_schedule) then
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

  -- Hoop Method giving a card for the first time unlocks it for every other club (same schedule number)
  if lead then
    if p_member is not null then
      insert into private.hoop_card_releases (kind, step, schedule_id) values ('oneofone', private.hoop_schedule_no(p_schedule), p_schedule) on conflict (kind) do nothing;
    end if;
    if exists (select 1 from public.hoop_numbered_cards n where n.schedule_id = p_schedule and n.series = 'selected') then
      insert into private.hoop_card_releases (kind, step, schedule_id) values ('selected', private.hoop_schedule_no(p_schedule), p_schedule) on conflict (kind) do nothing;
    end if;
  end if;

  update public.hoop_packs set status = 'ready', ready_at = now() where schedule_id = p_schedule and status = 'waiting';

  select c.name into club from public.hoop_clubs c where c.id = s.club_id;
  insert into public.notifications (user_id, actor_id, type, hoop_club_id, snippet)
  select m.profile_id, auth.uid(), 'hoop_pack', s.club_id, left(club, 140)
    from public.hoop_packs p join public.hoop_members m on m.id = p.member_id
   where p.schedule_id = p_schedule and m.profile_id is not null and m.profile_id <> auth.uid();
end $function$;
