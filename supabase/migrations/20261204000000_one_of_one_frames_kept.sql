-- Every 1-of-1 keeps the picture it was won with: a new design never changes cards already won.
alter table public.hoop_one_of_ones add column if not exists frame_url text;
-- the club's own Holo frame (null = the built-in Holo frame); only the main admin sets it
alter table public.hoop_clubs add column if not exists oneofone_holo_url text
  check (oneofone_holo_url is null or oneofone_holo_url like '/hoop-cards/%' or oneofone_holo_url like 'https://ckwdiwfnivquokggjtyq.supabase.co/storage/v1/object/public/avatars/%');

-- Hoop Method's first 1-of-1s were won with the gold frame; put that design back as the "before" one
update public.hoop_clubs set oneofone_url = '/hoop-cards/oneofone-frame.webp' where id = private.hoop_lead_club();
update public.hoop_one_of_ones set frame_url = '/hoop-cards/oneofone-frame.webp' where club_id = private.hoop_lead_club() and frame_url is null and design is null;
update public.hoop_one_of_ones o set frame_url = coalesce(c.oneofone_url, '/hoop-cards/oneofone-frame-club.webp')
  from public.hoop_clubs c where c.id = o.club_id and o.frame_url is null and o.design is null;

create or replace function private.hoop_one_design_stamp() returns trigger
 language plpgsql security definer set search_path to '' as $$
begin
  new.design := private.hoop_one_design(new.schedule_id);
  select case when new.design = 'holo' then coalesce(c.oneofone_holo_url, '/hoop-cards/oneofone-holo.webp')
              else coalesce(c.oneofone_url, '/hoop-cards/oneofone-frame-club.webp') end into new.frame_url
    from public.hoop_clubs c where c.id = new.club_id;
  return new;
end $$;

create or replace function private.hoop_clubs_selected_guard() returns trigger language plpgsql set search_path to '' as $function$
begin
  if current_user in ('anon', 'authenticated') and auth.uid() is distinct from private.hoop_main_admin() then
    new.selected_url := case when tg_op = 'INSERT' then null else old.selected_url end;
    new.oneofone_holo_url := case when tg_op = 'INSERT' then null else old.oneofone_holo_url end;
  end if;
  return new;
end $function$;

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
    'sel_slot', case when n.id is not null then c.sel_slot end, 'sel_id', n.id, 'sel_serial', n.serial, 'sel_total', n.total);
end $function$;
