-- Emails the main admin lets sign up without the emailed 6-digit code (friends, testers).
-- The account is confirmed the moment it's created, and the app logs them straight in.
create table if not exists public.signup_skip_verification (
  email      text primary key check (email = lower(btrim(email)) and email like '%_@_%._%' and char_length(email) <= 254),
  note       text check (char_length(note) <= 120),
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.signup_skip_verification enable row level security;
create policy "signup_skip_verification: main admin only" on public.signup_skip_verification for all to authenticated
  using (private.is_moderator()) with check (private.is_moderator());

create or replace function private.signup_skip_verification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is null
     and exists (select 1 from public.signup_skip_verification s where s.email = lower(btrim(new.email))) then
    new.email_confirmed_at := now();
  end if;
  return new;
end $$;
create or replace trigger signup_skip_verification before insert on auth.users
  for each row execute function private.signup_skip_verification();

insert into public.signup_skip_verification (email, note) values ('sendnukes@gmail.com', 'Friend — artist account') on conflict do nothing;
