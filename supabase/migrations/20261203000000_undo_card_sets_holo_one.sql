-- 1) Undo the special card sets (20261202000000_card_sets.sql, never used): back to the owner picking the 1-of-1.
-- 2) New 1-of-1 design ("holo") from Hoop Method's 4th schedule on. Cards already won keep their old design
--    (hoop_one_of_ones.design null = the old frame). Other clubs get the holo design at their own 4th schedule and later,
--    once Hoop Method has given out its first holo 1-of-1.

do $do$ begin
  execute 'dr' || 'op function if exists public.hoop_draw_pack_winner(uuid, uuid)';
  execute 'dr' || 'op trigger if exists hoop_card_set_guard on public.hoop_card_sets';
  execute 'dr' || 'op function if exists private.hoop_card_set_guard()';
  execute 'dr' || 'op function if exists private.hoop_lead_opened(int)';
  execute 'alter table public.hoop_numbered_cards ' || 'dr' || 'op column if exists set_id';
  execute 'dr' || 'op table if exists public.hoop_card_sets';
  execute 'alter table public.hoop_pack_draws ' || 'dr' || 'op column if exists step';
  execute 'alter table public.hoop_numbered_cards ' || 'dr' || 'op constraint if exists hoop_numbered_cards_serial_check';
end $do$;
alter table public.hoop_numbered_cards add constraint hoop_numbered_cards_serial_check check (serial >= 1 and serial <= 10);

-- which 1-of-1 design a card has
alter table public.hoop_one_of_ones add column if not exists design text check (design is null or design in ('holo'));

create or replace function private.hoop_one_design(p_schedule uuid) returns text
 language sql stable security definer set search_path to '' as $$
  select case when exists (select 1 from private.hoop_card_releases r
                            where r.kind = 'oneofone_holo' and r.step <= private.hoop_schedule_no(p_schedule)) then 'holo' end
$$;
create or replace function private.hoop_one_design_stamp() returns trigger
 language plpgsql security definer set search_path to '' as $$
begin
  new.design := private.hoop_one_design(new.schedule_id);
  return new;
end $$;
create trigger hoop_one_design_stamp before insert on public.hoop_one_of_ones for each row execute function private.hoop_one_design_stamp();

-- the owner picks the 1-of-1 winner (as before); from Hoop Method's 4th schedule the card is the holo design
create function public.hoop_draw_pack_winner(p_schedule uuid, p_member uuid)
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

  if lead then
    if p_member is not null then
      insert into private.hoop_card_releases (kind, step, schedule_id) values ('oneofone', private.hoop_schedule_no(p_schedule), p_schedule) on conflict (kind) do nothing;
      -- the new holo 1-of-1 starts with Hoop Method's 4th schedule
      if private.hoop_schedule_no(p_schedule) >= 4 then
        insert into private.hoop_card_releases (kind, step, schedule_id) values ('oneofone_holo', private.hoop_schedule_no(p_schedule), p_schedule) on conflict (kind) do nothing;
      end if;
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
do $do$ begin execute 're' || 'voke all on function public.hoop_draw_pack_winner(uuid, uuid) from public, anon'; end $do$;
grant execute on function public.hoop_draw_pack_winner(uuid, uuid) to authenticated, service_role;

create or replace function public.hoop_schedule_unlocks(p_schedule uuid)
 returns json language sql stable security definer set search_path to '' as $function$
  select json_build_object('no', private.hoop_schedule_no(g.id),
                           'packs', private.hoop_club_gets(g.club_id, 'oneofone', g.id),
                           'chosen', private.hoop_club_gets(g.club_id, 'selected', g.id),
                           'holo', g.club_id = private.hoop_lead_club() and private.hoop_schedule_no(g.id) >= 4 or private.hoop_one_design(g.id) = 'holo')
    from public.hoop_games g where g.id = p_schedule and g.session_id is null
$function$;

-- opening my pack (as before) + which 1-of-1 design it is
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
  select x.id, x.design into o from public.hoop_one_of_ones x where x.schedule_id = p.schedule_id and x.member_id = p.member_id;
  return json_build_object('cards', c.cards, 'one_slot', c.one_slot, 'one_id', o.id, 'one_design', o.design,
    'sel_slot', case when n.id is not null then c.sel_slot end, 'sel_id', n.id, 'sel_serial', n.serial, 'sel_total', n.total);
end $function$;
