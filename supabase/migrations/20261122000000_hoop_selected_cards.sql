-- =====================================================================================================
-- HOOP METHOD · "SELECTED" NUMBERED CARDS (a limited series: only 10 ever, numbered 1/10 … 10/10)
-- When the main admin / club owner picks a schedule's 1-of-1 winner, up to 10 OTHER players who played get a
-- "Selected" card hidden in their pack (random players, random numbers, until all 10 exist). Opening the pack
-- reveals it; the player can use it on their card and sign it — like the 1-of-1.
-- Only clubs with a Selected design (hoop_clubs.selected_url) give them out: for now Hoop Method.
-- =====================================================================================================
alter table public.hoop_clubs add column if not exists selected_url text;
update public.hoop_clubs set selected_url = '/hoop-cards/selected-frame.webp' where owner_id = private.hoop_main_admin();

-- only the main admin sets a club's Selected design (same rule as the 1-of-1 design)
create or replace function private.hoop_clubs_selected_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and auth.uid() is distinct from private.hoop_main_admin() then
    new.selected_url := case when tg_op = 'INSERT' then null else old.selected_url end;
  end if;
  return new;
end $$;
create trigger hoop_clubs_selected_guard before insert or update on public.hoop_clubs
  for each row execute function private.hoop_clubs_selected_guard();

create table if not exists public.hoop_numbered_cards (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.hoop_clubs(id) on delete cascade,
  series        text not null default 'selected',
  serial        int  not null check (serial between 1 and 10),
  total         int  not null default 10,
  member_id     uuid not null references public.hoop_members(id) on delete cascade,
  schedule_id   uuid references public.hoop_games(id) on delete set null,
  pack_id       uuid references public.hoop_packs(id) on delete set null,
  revealed_at   timestamptz,                 -- set when the player opens the pack (hidden until then)
  signature_url text check (signature_url is null or signature_url like 'https://ckwdiwfnivquokggjtyq.supabase.co/storage/v1/object/public/avatars/%'),
  signed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (club_id, series, serial),
  unique (club_id, series, member_id)
);
create index if not exists hoop_numbered_cards_member_idx on public.hoop_numbered_cards(member_id);
alter table public.hoop_numbered_cards enable row level security;
create policy "revealed cards (main admin sees all)" on public.hoop_numbered_cards for select to authenticated
  using (revealed_at is not null or auth.uid() = private.hoop_main_admin());
create policy "owner signs" on public.hoop_numbered_cards for update to authenticated
  using (revealed_at is not null and exists (select 1 from public.hoop_members m where m.id = member_id and m.profile_id = auth.uid()))
  with check (exists (select 1 from public.hoop_members m where m.id = member_id and m.profile_id = auth.uid()));
grant select on public.hoop_numbered_cards to authenticated;
revoke insert, update, delete, truncate on public.hoop_numbered_cards from anon, authenticated;
grant update (signature_url) on public.hoop_numbered_cards to authenticated;
create trigger hoop_numbered_sign_guard before update of signature_url on public.hoop_numbered_cards
  for each row execute function private.hoop_one_sign_guard();

alter table private.hoop_pack_contents add column if not exists sel_slot int check (sel_slot between 1 and 5);
alter table private.hoop_pack_contents add column if not exists sel_card uuid;

-- players can show their Selected card ('sel:<id>') like their 1-of-1
create or replace function private.hoop_card_choice_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
declare lvl int;
begin
  if new.card_choice is not distinct from old.card_choice or new.card_choice is null then return new; end if;
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.profile_id is distinct from auth.uid() then raise exception 'HOOP: Only the player can choose their card.'; end if;
  if new.card_choice ~ '^level[1-9]$' then
    lvl := private.hoop_member_level(new.id);
    if substr(new.card_choice, 6)::int > lvl then raise exception 'HOOP: That card isn''t unlocked yet.'; end if;
  elsif new.card_choice ~ '^one:[0-9a-f-]{36}$' then
    if not exists (select 1 from public.hoop_one_of_ones o where o.id = substr(new.card_choice, 5)::uuid and o.member_id = new.id) then
      raise exception 'HOOP: That 1-of-1 card isn''t yours.';
    end if;
  elsif new.card_choice ~ '^sel:[0-9a-f-]{36}$' then
    if not exists (select 1 from public.hoop_numbered_cards n where n.id = substr(new.card_choice, 5)::uuid and n.member_id = new.id and n.revealed_at is not null) then
      raise exception 'HOOP: That Selected card isn''t yours.';
    end if;
  else
    raise exception 'HOOP: Unknown card.';
  end if;
  return new;
end $$;

create or replace function public.hoop_draw_pack_winner(p_schedule uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
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
  -- SELECTED (numbered 1/10 … 10/10, only 10 ever): hidden in random players' packs until all 10 are given out.
  -- Never in the 1-of-1 winner's pack, never twice to the same player; numbers are random.
  if exists (select 1 from public.hoop_clubs c where c.id = s.club_id and c.selected_url is not null) then
    select count(*) into issued from public.hoop_numbered_cards n where n.club_id = s.club_id and n.series = 'selected';
    for r in
      select p.id as pack_id, p.member_id from public.hoop_packs p
       where p.schedule_id = p_schedule and p.member_id <> p_member
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
end $$;

create or replace function public.hoop_open_pack(p_pack uuid) returns json language plpgsql security definer set search_path = '' as $$
declare p record; c record; n record;
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
  return json_build_object('cards', c.cards, 'one_slot', c.one_slot,
    'one_id', (select o.id from public.hoop_one_of_ones o where o.schedule_id = p.schedule_id and o.member_id = p.member_id),
    'sel_slot', case when n.id is not null then c.sel_slot end, 'sel_id', n.id, 'sel_serial', n.serial, 'sel_total', n.total);
end $$;
