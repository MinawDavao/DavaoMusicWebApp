-- Card 4 · Prism: after a player's 4th finished schedule (keep in step with CARD_LEVELS in src/hoop/ClubCard.tsx)
create or replace function private.hoop_member_level(p_member uuid) returns integer
 language sql stable security definer set search_path to '' as $function$
  select case when coalesce(s.schedules, 0) >= 4 then 4 when coalesce(s.schedules, 0) >= 3 then 3 when coalesce(s.schedules, 0) >= 2 then 2 else 1 end
    from (select (select schedules from public.hoop_member_schedules where member_id = p_member) as schedules) s
$function$;

create or replace function private.hoop_member_cards(p_member uuid) returns text[]
 language plpgsql set search_path to '' as $function$
declare v_club uuid; picks text[]; out text[] := '{}'; i int;
begin
  select club_id into v_club from public.hoop_members where id = p_member;
  select array_agg(x.card) into picks from (
    select (case private.hoop_member_level(m.id) when 4 then 'prism' when 3 then 'starlight' when 2 then 'royal' else 'glow' end) || ':' || m.id as card
      from public.hoop_members m
     where m.club_id = v_club and m.status = 'active' and m.id <> p_member
     order by random()
     limit 5
  ) x;
  if coalesce(array_length(picks, 1), 0) = 0 then
    picks := array[(case private.hoop_member_level(p_member) when 4 then 'prism' when 3 then 'starlight' when 2 then 'royal' else 'glow' end) || ':' || p_member];
  end if;
  out := picks;
  for i in coalesce(array_length(out, 1), 0) + 1 .. 5 loop
    out := out || picks[1 + floor(random() * array_length(picks, 1))::int];
  end loop;
  return out;
end $function$;
