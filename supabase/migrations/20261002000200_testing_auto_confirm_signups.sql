-- TEMPORARY (testing): accept every sign-up without email verification.
-- Applied 2026-10-02. Before launch, run in the SQL Editor:
--   drop trigger if exists auto_confirm_email on auth.users;
--   drop function if exists private.auto_confirm_email();
create or replace function private.auto_confirm_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end $$;

create trigger auto_confirm_email before insert on auth.users
  for each row execute function private.auto_confirm_email();
