-- The hoop_numbered_cards serial check capped serial at 10 (written for Chosen / 10-10).
-- The 20-20 series needs serial up to 20, so tie the serial to its series' total instead
-- (1 .. total): keeps 1-10 for Chosen / 10-10 and allows 1-20 for 20-20.
alter table public.hoop_numbered_cards
  drop constraint if exists hoop_numbered_cards_serial_check;
alter table public.hoop_numbered_cards
  add constraint hoop_numbered_cards_serial_check
  check (serial >= 1 and serial <= total);
