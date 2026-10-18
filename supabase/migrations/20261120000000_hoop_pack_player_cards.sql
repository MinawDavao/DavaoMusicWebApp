-- Card packs: every card is a DIFFERENT player of the club (not 5 copies of the opener).
-- Each card is that player's own card in the design they've earned ('glow' / 'royal' / 'starlight'), saved as
-- '<design>:<member id>'. The winner's pack still hides 'oneofone' (the winner's own 1-of-1) in one slot, so it holds
-- 4 players + the 1-of-1. Players with a card = active members of the club (with or without the app), except the opener.
-- If a club has fewer than 5 other players, players repeat.
create or replace function private.hoop_member_cards(p_member uuid) returns text[] language plpgsql volatile set search_path = '' as $$
declare v_club uuid; picks text[]; out text[] := '{}'; i int;
begin
  select club_id into v_club from public.hoop_members where id = p_member;
  select array_agg(x.card) into picks from (
    select (case private.hoop_member_level(m.id) when 3 then 'starlight' when 2 then 'royal' else 'glow' end) || ':' || m.id as card
      from public.hoop_members m
     where m.club_id = v_club and m.status = 'active' and m.id <> p_member
     order by random()
     limit 5
  ) x;
  if coalesce(array_length(picks, 1), 0) = 0 then   -- nobody else yet: the opener's own card
    picks := array[(case private.hoop_member_level(p_member) when 3 then 'starlight' when 2 then 'royal' else 'glow' end) || ':' || p_member];
  end if;
  out := picks;
  for i in coalesce(array_length(out, 1), 0) + 1 .. 5 loop
    out := out || picks[1 + floor(random() * array_length(picks, 1))::int];
  end loop;
  return out;
end $$;

-- re-deal the packs that were already dealt with the old rule (keep where the 1-of-1 sits)
update private.hoop_pack_contents c
   set cards = case when c.one_slot is null then x.cards
                    else x.cards[1:c.one_slot - 1] || 'oneofone'::text || x.cards[c.one_slot + 1:5] end
  from public.hoop_packs p, lateral (select private.hoop_member_cards(p.member_id) as cards) x
 where p.id = c.pack_id and not exists (select 1 from unnest(c.cards) k where k like '%:%');
