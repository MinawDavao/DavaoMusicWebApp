-- The 10-10 cards: a new numbered series (only 10 per club, 1/10 … 10/10), its own maroon & silver design
-- (public/hoop-cards/ten-frame.webp). Hoop Method gives them from its 4th schedule to random players (not the 1-of-1
-- winner); other clubs from their own schedule with the same number, once Hoop Method has given them out.
-- Like the Chosen cards, a club keeps giving them out until all 10 exist.

create or replace function private.hoop_club_gets(p_club uuid, p_kind text, p_schedule uuid)
 returns boolean language plpgsql stable security definer set search_path to '' as $function$
declare st int;
begin
  if p_club = private.hoop_lead_club() then
    if p_kind = 'ten' then return private.hoop_schedule_no(p_schedule) >= 4; end if;
    return exists (select 1 from public.hoop_clubs c where c.id = p_club
                     and case p_kind when 'oneofone' then c.oneofone_url is not null when 'selected' then c.selected_url is not null else false end);
  end if;
  select r.step into st from private.hoop_card_releases r where r.kind = p_kind;
  return st is not null and private.hoop_schedule_no(p_schedule) >= st;
end $function$;

create or replace function public.hoop_draw_pack_winner(p_schedule uuid, p_member uuid)
 returns void language plpgsql security definer set search_path to '' as $function$
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

  -- the 10-10 cards (only 10 per club): Hoop Method from its 4th schedule, other clubs from the same schedule number
  if private.hoop_club_gets(s.club_id, 'ten', p_schedule) then
    select count(*) into issued from public.hoop_numbered_cards n where n.club_id = s.club_id and n.series = 'ten';
    for r in
      select p.id as pack_id, p.member_id from public.hoop_packs p join private.hoop_pack_contents c on c.pack_id = p.id
       where p.schedule_id = p_schedule and p.member_id is distinct from p_member and c.sel_card is null and c.one_slot is null
         and not exists (select 1 from public.hoop_numbered_cards n where n.club_id = s.club_id and n.series = 'ten' and n.member_id = p.member_id)
       order by random() limit greatest(0, 10 - issued)
    loop
      select x into ser from generate_series(1, 10) x
       where x not in (select n.serial from public.hoop_numbered_cards n where n.club_id = s.club_id and n.series = 'ten')
       order by random() limit 1;
      exit when ser is null;
      slot := 1 + floor(random() * 5)::int;
      insert into public.hoop_numbered_cards (club_id, series, serial, total, member_id, schedule_id, pack_id)
        values (s.club_id, 'ten', ser, 10, r.member_id, p_schedule, r.pack_id) returning id into nid;
      update private.hoop_pack_contents set cards[slot] = 'selected', sel_slot = slot, sel_card = nid where pack_id = r.pack_id;
    end loop;
  end if;

  if lead then
    if p_member is not null then
      insert into private.hoop_card_releases (kind, step, schedule_id) values ('oneofone', private.hoop_schedule_no(p_schedule), p_schedule) on conflict (kind) do nothing;
      -- the new holo 1-of-1 starts with Hoop Method's 4th schedule
      if private.hoop_schedule_no(p_schedule) >= 4 then
        insert into private.hoop_card_releases (kind, step, schedule_id) values ('oneofone_holo', private.hoop_schedule_no(p_schedule), p_schedule) on conflict (kind) do nothing;
      end if;
    end if;
    if exists (select 1 from public.hoop_numbered_cards n where n.schedule_id = p_schedule and n.series = 'ten') then
      insert into private.hoop_card_releases (kind, step, schedule_id) values ('ten', private.hoop_schedule_no(p_schedule), p_schedule) on conflict (kind) do nothing;
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

create or replace function public.hoop_schedule_unlocks(p_schedule uuid)
 returns json language sql stable security definer set search_path to '' as $function$
  select json_build_object('no', private.hoop_schedule_no(g.id),
                           'packs', private.hoop_club_gets(g.club_id, 'oneofone', g.id),
                           'chosen', private.hoop_club_gets(g.club_id, 'selected', g.id)
                                     and (select count(*) from public.hoop_numbered_cards n where n.club_id = g.club_id and n.series = 'selected') < 10,
                           'ten', private.hoop_club_gets(g.club_id, 'ten', g.id)
                                  and (select count(*) from public.hoop_numbered_cards n where n.club_id = g.club_id and n.series = 'ten') < 10,
                           'ten_left', 10 - (select count(*) from public.hoop_numbered_cards n where n.club_id = g.club_id and n.series = 'ten'),
                           'holo', g.club_id = private.hoop_lead_club() and private.hoop_schedule_no(g.id) >= 4 or private.hoop_one_design(g.id) = 'holo')
    from public.hoop_games g where g.id = p_schedule and g.session_id is null
$function$;

-- opening my pack: also which numbered series my card is
create or replace function public.hoop_open_pack(p_pack uuid)
 returns json language plpgsql security definer set search_path to '' as $function$
declare p record; c record; n record; o record;
begin
  select pk.*, m.profile_id into p from public.hoop_packs pk join public.hoop_members m on m.id = pk.member_id where pk.id = p_pack;
  if p is null or p.profile_id is distinct from auth.uid() then raise exception 'HOOP: This isn''t your pack.'; end if;
  if p.status = 'waiting' then raise exception 'HOOP: This pack isn''t ready yet.'; end if;
  select * into c from private.hoop_pack_contents where pack_id = p_pack;
  if p.status = 'ready' then
    update public.hoop_packs set status = 'opened', opened_at = now() where id = p_pack;
    if c.one_slot is not null then
      insert into public.hoop_one_of_ones (club_id, schedule_id, member_id) values (p.club_id, p.schedule_id, p.member_id)
      on conflict (schedule_id) do nothing;
    end if;
    update public.hoop_numbered_cards set revealed_at = now() where id = c.sel_card and revealed_at is null;
  end if;
  select * into n from public.hoop_numbered_cards where id = c.sel_card;
  select x.id, x.design, x.frame_url into o from public.hoop_one_of_ones x where x.schedule_id = p.schedule_id and x.member_id = p.member_id;
  return json_build_object('cards', c.cards, 'one_slot', c.one_slot, 'one_id', o.id, 'one_design', o.design, 'one_frame', o.frame_url,
    'sel_slot', case when n.id is not null then c.sel_slot end, 'sel_id', n.id, 'sel_serial', n.serial, 'sel_total', n.total, 'sel_series', n.series);
end $function$;
