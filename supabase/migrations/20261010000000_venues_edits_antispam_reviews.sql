-- Update 6: Venue accounts, post/comment editing, anti-spam, testimonial approval, profile card background.
-- (Run 20261010000000 after: alter type public.user_role add value if not exists 'venue';)

-- ---------------------------------------------------------------- profiles: venue details + card background
alter table public.profiles
  add column if not exists card_bg_url    text,
  add column if not exists venue_type     text check (char_length(venue_type) <= 40),
  add column if not exists venue_address  text check (char_length(venue_address) <= 200),
  add column if not exists venue_capacity int  check (venue_capacity between 1 and 100000),
  add column if not exists venue_contact  text check (char_length(venue_contact) <= 60),
  add column if not exists venue_map_url  text check (char_length(venue_map_url) <= 500);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
  v_name text;
  v_base text;
begin
  v_role := case new.raw_user_meta_data ->> 'role'
              when 'artist' then 'artist'::public.user_role
              when 'venue'  then 'venue'::public.user_role
              else 'fan'::public.user_role end;
  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1), 'New user');
  v_base := left(regexp_replace(lower(coalesce(split_part(new.email, '@', 1), '')), '[^a-z0-9_]', '', 'g'), 20);
  if char_length(v_base) < 3 then v_base := 'user' || v_base; end if;
  insert into public.profiles (id, role, display_name, username)
  values (new.id, v_role, left(v_name, 80), v_base || '_' || substr(md5(random()::text), 1, 5));
  return new;
end $$;

-- ---------------------------------------------------------------- posts: tag a venue account, "edited" marker
alter table public.posts add column if not exists venue_id uuid references public.profiles(id) on delete set null;
alter table public.posts add column if not exists edited_at timestamptz;
alter table public.comments add column if not exists edited_at timestamptz;
create index if not exists posts_venue_id_idx on public.posts (venue_id);
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists comments_post_created_idx on public.comments (post_id, created_at desc);
create index if not exists comments_author_created_idx on public.comments (author_id, created_at desc);

create or replace function public.mark_edited()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.content is distinct from old.content then new.edited_at := now(); end if;
  return new;
end $$;
create or replace trigger posts_mark_edited before update on public.posts for each row execute function public.mark_edited();
create or replace trigger comments_mark_edited before update on public.comments for each row execute function public.mark_edited();

-- ---------------------------------------------------------------- anti-spam
create or replace function public.posts_spam_guard()
returns trigger language plpgsql set search_path = '' as $$
declare n int;
begin
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then return new; end if;
  select count(*) into n from public.posts where author_id = new.author_id and created_at > now() - interval '10 minutes';
  if n >= 3 then raise exception 'Slow down: you can post up to 3 times every 10 minutes. Please try again in a few minutes.'; end if;
  select count(*) into n from public.posts where author_id = new.author_id and created_at > now() - interval '24 hours';
  if n >= 20 then raise exception 'Daily limit reached: you can post up to 20 times a day. Please try again tomorrow.'; end if;
  if exists (select 1 from public.posts where author_id = new.author_id and created_at > now() - interval '24 hours'
             and lower(btrim(content)) = lower(btrim(new.content))) then
    raise exception 'You already posted this. Please don’t post the same thing twice.';
  end if;
  return new;
end $$;
create or replace trigger posts_spam_guard before insert on public.posts for each row execute function public.posts_spam_guard();

create or replace function public.comments_spam_guard()
returns trigger language plpgsql set search_path = '' as $$
declare n int;
begin
  if current_user not in ('anon', 'authenticated') or private.is_moderator() then return new; end if;
  -- 3 replies in a row on the same post: wait for someone else to reply, or 10 minutes
  select count(*) into n from (
    select c.author_id from public.comments c where c.post_id = new.post_id order by c.created_at desc limit 3
  ) last3 where last3.author_id = new.author_id;
  if n >= 3 and exists (select 1 from public.comments where post_id = new.post_id and author_id = new.author_id
                        and created_at > now() - interval '10 minutes') then
    raise exception 'You’ve replied 3 times in a row. Wait for someone else to reply, or try again in 10 minutes.';
  end if;
  select count(*) into n from public.comments where author_id = new.author_id and created_at > now() - interval '5 minutes';
  if n >= 10 then raise exception 'Slow down: you can reply up to 10 times every 5 minutes.'; end if;
  if exists (select 1 from public.comments where author_id = new.author_id and post_id = new.post_id
             and created_at > now() - interval '24 hours' and lower(btrim(content)) = lower(btrim(new.content))) then
    raise exception 'You already replied with this. Please don’t post the same reply twice.';
  end if;
  return new;
end $$;
create or replace trigger comments_spam_guard before insert on public.comments for each row execute function public.comments_spam_guard();

-- ---------------------------------------------------------------- testimonials need approval
alter table public.band_reviews add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'declined'));
alter table public.band_reviews alter column status set default 'pending';  -- existing reviews stay approved

create table if not exists public.venue_reviews (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.profiles(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  message    text not null check (char_length(message) between 1 and 1000),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (venue_id, author_id),
  check (venue_id <> author_id)
);
create index if not exists venue_reviews_author_idx on public.venue_reviews (author_id);
alter table public.venue_reviews enable row level security;

create or replace function public.review_status_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Only the page owner (through set_review_status) or a moderator can change status.
  if current_user in ('anon', 'authenticated') and not private.is_moderator() then
    if tg_op = 'INSERT' then
      new.status := 'pending';
    else
      new.status := old.status;
      if new.message is distinct from old.message or new.rating is distinct from old.rating then
        new.status := 'pending';  -- edited testimonials are checked again
      end if;
    end if;
  end if;
  return new;
end $$;
create or replace trigger band_reviews_status_guard before insert or update on public.band_reviews for each row execute function public.review_status_guard();
create or replace trigger venue_reviews_status_guard before insert or update on public.venue_reviews for each row execute function public.review_status_guard();
create or replace trigger venue_reviews_protect_hidden before insert or update on public.venue_reviews for each row execute function public.protect_is_hidden();

alter policy "band_reviews: visible unless hidden" on public.band_reviews
  using (((not is_hidden) and status = 'approved') or author_id = (select auth.uid())
         or ((not is_hidden) and private.owns_band(band_id)) or private.is_moderator());

create policy "venue_reviews: approved are public" on public.venue_reviews for select
  using (((not is_hidden) and status = 'approved') or author_id = (select auth.uid())
         or ((not is_hidden) and venue_id = (select auth.uid())) or private.is_moderator());
create policy "venue_reviews: write own" on public.venue_reviews for insert
  with check (author_id = (select auth.uid()) and private.can_post()
              and exists (select 1 from public.profiles v where v.id = venue_id and v.role = 'venue'));
create policy "venue_reviews: edit own" on public.venue_reviews for update
  using (author_id = (select auth.uid()) or private.is_moderator())
  with check (author_id = (select auth.uid()) or private.is_moderator());
create policy "venue_reviews: remove own" on public.venue_reviews for delete
  using (author_id = (select auth.uid()) or private.is_moderator());

create or replace function public.set_review_status(p_kind text, p_review_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('pending', 'approved', 'declined') then raise exception 'Invalid status'; end if;
  if p_kind = 'band' then
    update public.band_reviews r set status = p_status
     where r.id = p_review_id and (private.owns_band(r.band_id) or private.is_moderator());
  elsif p_kind = 'venue' then
    update public.venue_reviews r set status = p_status
     where r.id = p_review_id and (r.venue_id = (select auth.uid()) or private.is_moderator());
  else
    raise exception 'Invalid kind';
  end if;
  if not found then raise exception 'You can only approve testimonials on your own page.'; end if;
end $$;
