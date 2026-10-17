-- The winner can sign their 1-of-1 card (finger or mouse). The signature is a transparent PNG in the public
-- avatars bucket; only the card's owner can set or change it, and nothing else on the row can be changed.
alter table public.hoop_one_of_ones add column if not exists signature_url text
  check (signature_url is null or signature_url like 'https://ckwdiwfnivquokggjtyq.supabase.co/storage/v1/object/public/avatars/%');
alter table public.hoop_one_of_ones add column if not exists signed_at timestamptz;

create policy "owner signs" on public.hoop_one_of_ones for update to authenticated
  using (exists (select 1 from public.hoop_members m where m.id = member_id and m.profile_id = auth.uid()))
  with check (exists (select 1 from public.hoop_members m where m.id = member_id and m.profile_id = auth.uid()));
grant update (signature_url) on public.hoop_one_of_ones to authenticated;

create or replace function private.hoop_one_sign_guard() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    -- the signature file must be the signer's own upload (avatars/<their id>/…)
    if new.signature_url is not null and new.signature_url not like
       'https://ckwdiwfnivquokggjtyq.supabase.co/storage/v1/object/public/avatars/' || auth.uid()::text || '/%' then
      raise exception 'HOOP: Use your own signature picture.';
    end if;
  end if;
  new.signed_at := case when new.signature_url is null then null else now() end;
  return new;
end $$;
create trigger hoop_one_sign_guard before update of signature_url on public.hoop_one_of_ones
  for each row execute function private.hoop_one_sign_guard();

-- Supabase gives tables full write access by default: packs, draws and 1-of-1s are only ever written by the
-- server functions above, and players may only change their signature.
revoke insert, update, delete, truncate on public.hoop_one_of_ones from anon, authenticated;
revoke insert, update, delete, truncate on public.hoop_packs, public.hoop_pack_draws from anon, authenticated;
grant update (signature_url) on public.hoop_one_of_ones to authenticated;
