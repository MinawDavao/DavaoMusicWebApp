-- Players with an account join a club themselves (My Card → send for approval). A club admin can no longer add
-- another person's account straight into their club (that put other clubs' players into new clubs).
-- Admins still add players without the app, approve join requests, and the main admin can still help.
CREATE OR REPLACE FUNCTION private.hoop_members_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare admin boolean;
begin
  new.name := nullif(btrim(new.name), '');
  if current_user not in ('anon', 'authenticated') then return new; end if;
  admin := private.is_club_admin(coalesce(new.club_id, old.club_id));
  if new.profile_id is not null and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id)
     and not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'fan') then
    raise exception 'HOOP: Clubs are for individual (Fan) accounts only.';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    if admin and new.profile_id is not null and new.profile_id is distinct from auth.uid()
       and auth.uid() is distinct from private.hoop_main_admin() then
      raise exception 'HOOP: This player isn’t in your club yet. They can join from My Card — then approve them in Manage → Join requests.';
    end if;
    if admin then
      if new.status = 'active' then new.approved_at := now(); new.approved_by := auth.uid(); end if;
    else
      new.status := 'pending'; new.approved_at := null; new.approved_by := null; new.name := null; new.photo_url := null;
    end if;
  else
    new.club_id := old.club_id; new.created_at := old.created_at;
    if not admin then
      new.status := old.status; new.profile_id := old.profile_id; new.approved_at := old.approved_at; new.approved_by := old.approved_by;
      new.name := old.name; new.photo_url := old.photo_url;
    elsif new.status = 'active' and old.status is distinct from 'active' then
      new.approved_at := now(); new.approved_by := auth.uid();
    end if;
  end if;
  return new;
end $function$;
