-- Pack cards only use designs the player has already unlocked (their level when the packs open):
-- Level 1 → Glow only · Level 2 → Glow / Royal Crest · Level 3 → Glow / Royal Crest / Starlight. New designs stay a surprise.
-- (plpgsql + a loop so every pack really gets its own shuffle)
create or replace function private.hoop_member_cards(p_member uuid) returns text[] language plpgsql volatile set search_path = '' as $$
declare lvl int := least(3, greatest(1, private.hoop_member_level(p_member))); out text[] := '{}'; i int;
begin
  for i in 1..5 loop
    out := out || (array['glow', 'royal', 'starlight'])[1 + floor(random() * lvl)::int];
  end loop;
  return out;
end $$;

create or replace function private.hoop_make_packs(p_schedule uuid) returns void language plpgsql security definer set search_path = '' as $$
declare drawn boolean;
begin
  if not exists (select 1 from public.hoop_games g where g.id = p_schedule and g.session_id is null and g.closed_at is not null
                   and g.starts_at >= private.hoop_packs_start()) then return; end if;
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
  if auth.uid() is distinct from private.hoop_main_admin() then raise exception 'HOOP: Only the main admin can pick the 1-of-1 winner.'; end if;
  select * into s from public.hoop_games where id = p_schedule and session_id is null;
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
