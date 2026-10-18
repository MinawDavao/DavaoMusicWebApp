-- Card packs start with the schedules after 11 Oct 2026 ("Sunday Run 2", 18 Oct). The sealed 11 Oct packs
-- (no winner picked, never opened) are removed, and older schedules never make packs again — not even when a
-- guest from back then is linked to an account or the schedule is reopened and closed.
create or replace function private.hoop_packs_start() returns timestamptz language sql immutable set search_path = '' as
$$ select '2026-10-12 00:00:00+08'::timestamptz $$;

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
    returning id
  )
  insert into private.hoop_pack_contents (pack_id, cards)
  select id, private.hoop_random_cards() from made where drawn;
end $$;

delete from public.hoop_packs p using public.hoop_games g
 where g.id = p.schedule_id and g.starts_at < private.hoop_packs_start()
   and p.status = 'waiting' and not exists (select 1 from public.hoop_pack_draws d where d.schedule_id = p.schedule_id);
