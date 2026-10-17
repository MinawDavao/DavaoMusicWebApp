-- Bug check round 4 (card packs / 1-of-1)

-- 1) A guest who gets linked to an account AFTER the 1-of-1 draw still gets their pack (ready right away).
create or replace function private.hoop_member_linked_packs() returns trigger language plpgsql security definer set search_path = '' as $$
declare s uuid;
begin
  if old.profile_id is null and new.profile_id is not null then
    for s in
      select distinct coalesce(g.session_id, g.id)
        from public.hoop_game_players gp
        join public.hoop_games g on g.id = gp.game_id and g.status = 'final'
       where gp.member_id = new.id and gp.team is not null
    loop
      perform private.hoop_make_packs(s);
    end loop;
  end if;
  return new;
end $$;
create trigger hoop_member_linked_packs after update of profile_id on public.hoop_members
  for each row execute function private.hoop_member_linked_packs();

-- 2) Re-closing a reopened schedule (before the draw): drop sealed packs of players who are no longer on a team in it.
create or replace function private.hoop_make_packs(p_schedule uuid) returns void language plpgsql security definer set search_path = '' as $$
declare drawn boolean;
begin
  if not exists (select 1 from public.hoop_games g where g.id = p_schedule and g.session_id is null and g.closed_at is not null) then return; end if;
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

-- 3) A new club card can't start out pointing at a card it doesn't own.
create or replace function private.hoop_card_choice_on_insert() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then new.card_choice := null; end if;
  return new;
end $$;
create trigger hoop_card_choice_on_insert before insert on public.hoop_members
  for each row execute function private.hoop_card_choice_on_insert();

-- 4) Fixed search_path on two small helpers (Supabase advisor).
alter function private.hoop_main_admin() set search_path = '';
alter function private.hoop_random_cards() set search_path = '';
