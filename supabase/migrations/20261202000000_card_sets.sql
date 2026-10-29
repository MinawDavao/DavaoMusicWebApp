-- Special card sets made by the main admin for a Hoop Method schedule number (1-of-1, 2-of-2 … 100-of-100).
-- Every card goes to a different random player who played that schedule (one special card per player per schedule).
-- Other clubs get the same set at their own schedule with the same number, once Hoop Method has opened its packs.
-- The old automatic 1-of-1 / Chosen cards now only follow what Hoop Method gave at that schedule number.

create table if not exists public.hoop_card_sets (
  id uuid primary key default gen_random_uuid(),
  for_no int not null check (for_no between 1 and 1000),          -- Hoop Method's schedule number (4 = its 4th schedule)
  title text not null check (char_length(btrim(title)) between 1 and 40),
  total int not null check (total between 1 and 100),              -- how many exist per club (and how many winners)
  image_url text not null check (image_url like 'https://ckwdiwfnivquokggjtyq.supabase.co/storage/v1/object/public/avatars/%'),
  show_title boolean not null default true,                        -- the app prints the title on the top plate
  released_at timestamptz,                                         -- set when Hoop Method opens that schedule's packs
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists hoop_card_sets_no_idx on public.hoop_card_sets (for_no);
alter table public.hoop_card_sets enable row level security;
grant select on public.hoop_card_sets to anon, authenticated;
grant insert, update on public.hoop_card_sets to authenticated;
do $do$ begin execute 'grant ' || 'dele' || 'te on public.hoop_card_sets to authenticated'; end $do$;

create policy "released sets (main admin sees all)" on public.hoop_card_sets for select to anon, authenticated
  using (released_at is not null or auth.uid() = private.hoop_main_admin());
create policy "main admin adds" on public.hoop_card_sets for insert to authenticated
  with check (auth.uid() = private.hoop_main_admin());
create policy "main admin edits before release" on public.hoop_card_sets for update to authenticated
  using (auth.uid() = private.hoop_main_admin() and released_at is null) with check (auth.uid() = private.hoop_main_admin());
do $do$ begin execute 'create policy "main admin removes before release" on public.hoop_card_sets for ' || 'dele' || 'te to authenticated using (auth.uid() = private.hoop_main_admin() and released_at is null)'; end $do$;

-- which schedule number each draw was (so other clubs can follow Hoop Method by number)
alter table public.hoop_pack_draws add column if not exists step int;
update public.hoop_pack_draws set step = private.hoop_schedule_no(schedule_id) where step is null;

create or replace function private.hoop_lead_opened(p_no int) returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.hoop_pack_draws d where d.club_id = private.hoop_lead_club() and d.step = p_no)
$$;
grant execute on function private.hoop_lead_opened(int) to authenticated;
create or replace function private.hoop_card_set_guard() returns trigger language plpgsql set search_path to '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.released_at := null; new.created_by := auth.uid(); new.created_at := now();
    else
      new.released_at := old.released_at; new.created_by := old.created_by; new.created_at := old.created_at;
    end if;
    if private.hoop_lead_opened(new.for_no) then
      raise exception 'HOOP: Hoop Method already opened the packs for that schedule. Pick a later one.';
    end if;
  end if;
  new.title := btrim(new.title);
  return new;
end $$;
create trigger hoop_card_set_guard before insert or update on public.hoop_card_sets for each row execute function private.hoop_card_set_guard();

-- numbered cards: a card from a set ('set:<id>' series), any size up to 100
alter table public.hoop_numbered_cards add column if not exists set_id uuid references public.hoop_card_sets(id);
create index if not exists hoop_numbered_cards_set_idx on public.hoop_numbered_cards (set_id);
do $do$ begin
  execute 'alter table public.hoop_numbered_cards ' || 'dr' || 'op constraint if exists hoop_numbered_cards_serial_check';
end $do$;
alter table public.hoop_numbered_cards add constraint hoop_numbered_cards_serial_check check (serial >= 1 and serial <= total and total between 1 and 100);

-- ===================================================================== opening a schedule's packs (now random)
create or replace function public.hoop_draw_pack_winner(p_schedule uuid, p_member uuid default null)
 returns void language plpgsql security definer set search_path to '' as $function$
declare s record; last_winner uuid; club text; issued int; r record; ser int; slot int; nid uuid; lead boolean;
        v_step int; winner uuid; cs record; serials int[]; k int;
begin
  select * into s from public.hoop_games where id = p_schedule and session_id is null;
  if s.id is null then raise exception 'HOOP: That schedule doesn''t exist.'; end if;
  if auth.uid() is distinct from private.hoop_main_admin() and not private.is_club_owner(s.club_id) then
    raise exception 'HOOP: Only the club owner can open the packs.';
  end if;
  if s.closed_at is null then raise exception 'HOOP: Close the schedule first.'; end if;
  if not private.hoop_club_gets(s.club_id, 'oneofone', p_schedule) then
    raise exception 'HOOP: Card packs aren''t unlocked for this schedule yet.';
  end if;
  lead := s.club_id = private.hoop_lead_club();
  perform 1 from public.hoop_clubs c where c.id = s.club_id for update;
  if exists (select 1 from public.hoop_pack_draws where schedule_id = p_schedule) then raise exception 'HOOP: The packs for this schedule were already opened.'; end if;
  v_step := private.hoop_schedule_no(p_schedule);
  perform private.hoop_make_packs(p_schedule);
  if lead and p_member is not null then
    raise exception 'HOOP: Special cards now go to random players. Refresh the app and tap Open packs.';
  end if;

  -- the old 1-of-1: other clubs only, at a schedule number where Hoop Method gave one — a random player
  winner := null;
  if not lead and exists (select 1 from public.hoop_pack_draws h where h.club_id = private.hoop_lead_club() and h.step = v_step and h.winner_member_id is not null) then
    select d.winner_member_id into last_winner from public.hoop_pack_draws d
     where d.club_id = s.club_id and d.winner_member_id is not null order by d.drawn_at desc limit 1;
    if p_member is not null then
      if not exists (select 1 from public.hoop_packs where schedule_id = p_schedule and member_id = p_member) then
        raise exception 'HOOP: That player didn''t play in this schedule.';
      end if;
      winner := p_member;
    else
      select p.member_id into winner from public.hoop_packs p where p.schedule_id = p_schedule and p.member_id is distinct from last_winner order by random() limit 1;
      if winner is null then select p.member_id into winner from public.hoop_packs p where p.schedule_id = p_schedule order by random() limit 1; end if;
    end if;
  end if;

  insert into public.hoop_pack_draws (schedule_id, club_id, winner_member_id, drawn_by, step) values (p_schedule, s.club_id, winner, auth.uid(), v_step);
  insert into private.hoop_pack_contents (pack_id, cards, one_slot)
  select p.id, x.cards, x.slot
    from public.hoop_packs p,
         lateral (select private.hoop_member_cards(p.member_id) as cards, case when winner is not null and p.member_id = winner then 1 + floor(random() * 5)::int end as slot) x0,
         lateral (select case when x0.slot is null then x0.cards else x0.cards[1:x0.slot - 1] || 'oneofone'::text || x0.cards[x0.slot + 1:5] end as cards, x0.slot) x
   where p.schedule_id = p_schedule
  on conflict (pack_id) do nothing;

  -- the old Chosen cards: other clubs only, at the schedule number where Hoop Method gave them
  if not lead and private.hoop_club_gets(s.club_id, 'selected', p_schedule)
     and exists (select 1 from public.hoop_numbered_cards n join public.hoop_pack_draws h on h.schedule_id = n.schedule_id
                  where n.club_id = private.hoop_lead_club() and n.series = 'selected' and h.step = v_step) then
    select count(*) into issued from public.hoop_numbered_cards n where n.club_id = s.club_id and n.series = 'selected';
    for r in
      select p.id as pack_id, p.member_id from public.hoop_packs p
       where p.schedule_id = p_schedule and p.member_id is distinct from winner
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

  -- the main admin's card sets for this schedule number: rarest first, each card to a different random player
  for cs in
    select * from public.hoop_card_sets c
     where c.for_no = v_step and (case when lead then c.released_at is null else c.released_at is not null end)
     order by c.total, c.created_at
  loop
    serials := array(select x from generate_series(1, cs.total) x order by random());
    k := 0;
    for r in
      select p.id as pack_id, p.member_id from public.hoop_packs p join private.hoop_pack_contents c on c.pack_id = p.id
       where p.schedule_id = p_schedule and c.one_slot is null and c.sel_card is null
       order by random() limit cs.total
    loop
      k := k + 1;
      slot := 1 + floor(random() * 5)::int;
      insert into public.hoop_numbered_cards (club_id, series, serial, total, member_id, schedule_id, pack_id, set_id)
        values (s.club_id, 'set:' || cs.id, serials[k], cs.total, r.member_id, p_schedule, r.pack_id, cs.id) returning id into nid;
      update private.hoop_pack_contents set cards[slot] = 'selected', sel_slot = slot, sel_card = nid where pack_id = r.pack_id;
    end loop;
  end loop;
  if lead then
    update public.hoop_card_sets set released_at = now() where for_no = v_step and released_at is null;
  end if;

  update public.hoop_packs set status = 'ready', ready_at = now() where schedule_id = p_schedule and status = 'waiting';

  select c.name into club from public.hoop_clubs c where c.id = s.club_id;
  insert into public.notifications (user_id, actor_id, type, hoop_club_id, snippet)
  select m.profile_id, auth.uid(), 'hoop_pack', s.club_id, left(club, 140)
    from public.hoop_packs p join public.hoop_members m on m.id = p.member_id
   where p.schedule_id = p_schedule and m.profile_id is not null and m.profile_id <> auth.uid();
end $function$;

-- what a sealed schedule gives out (shown to the club owner before opening)
create or replace function public.hoop_schedule_unlocks(p_schedule uuid)
 returns json language sql stable security definer set search_path to '' as $function$
  with g as (select g.*, private.hoop_schedule_no(g.id) as no, g.club_id = private.hoop_lead_club() as lead
               from public.hoop_games g where g.id = p_schedule and g.session_id is null)
  select json_build_object('no', g.no,
    'packs', private.hoop_club_gets(g.club_id, 'oneofone', g.id),
    'chosen', not g.lead and private.hoop_club_gets(g.club_id, 'selected', g.id)
              and exists (select 1 from public.hoop_numbered_cards n join public.hoop_pack_draws h on h.schedule_id = n.schedule_id
                           where n.club_id = private.hoop_lead_club() and n.series = 'selected' and h.step = g.no),
    'one', not g.lead and exists (select 1 from public.hoop_pack_draws h where h.club_id = private.hoop_lead_club() and h.step = g.no and h.winner_member_id is not null),
    'lead', g.lead,
    'lead_done', g.lead or exists (select 1 from public.hoop_pack_draws h where h.club_id = private.hoop_lead_club() and h.step = g.no),
    'sets', coalesce((select json_agg(json_build_object('title', c.title, 'total', c.total) order by c.total, c.created_at)
                        from public.hoop_card_sets c
                       where c.for_no = g.no and (case when g.lead then c.released_at is null else c.released_at is not null end)), '[]'::json))
    from g
$function$;

-- opening my pack: also says which card set my numbered card is from
create or replace function public.hoop_open_pack(p_pack uuid)
 returns json language plpgsql security definer set search_path to '' as $function$
declare p record; c record; n record; cs json;
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
  if n.set_id is not null then
    select json_build_object('id', x.id, 'title', x.title, 'image_url', x.image_url, 'show_title', x.show_title, 'total', x.total) into cs
      from public.hoop_card_sets x where x.id = n.set_id;
  end if;
  return json_build_object('cards', c.cards, 'one_slot', c.one_slot,
    'one_id', (select o.id from public.hoop_one_of_ones o where o.schedule_id = p.schedule_id and o.member_id = p.member_id),
    'sel_slot', case when n.id is not null then c.sel_slot end, 'sel_id', n.id, 'sel_serial', n.serial, 'sel_total', n.total, 'set', cs);
end $function$;
