-- Bug check round 9
-- 1) only ONE prepared (scheduled) next game per schedule — double taps / two admins can't make two
create unique index if not exists hoop_games_one_next on public.hoop_games (session_id) where session_id is not null and status = 'scheduled';

-- 2) a game can't begin while another game of the same schedule is live
CREATE OR REPLACE FUNCTION private.hoop_start_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a int; b int; root uuid := coalesce(new.session_id, new.id);
begin
  if new.status = 'live' and old.status = 'scheduled' then
    select count(*) filter (where team = 'A'), count(*) filter (where team = 'B') into a, b
      from public.hoop_game_players where game_id = new.id;
    if a + b < 10 or a < 5 or b < 5 then
      raise exception 'HOOP: A game needs at least 10 players — 5 on each team (now % vs %).', a, b;
    end if;
    if exists (select 1 from public.hoop_games g where g.id <> new.id and coalesce(g.session_id, g.id) = root and g.status = 'live') then
      raise exception 'HOOP: Another game of this schedule is still live — finish it first.';
    end if;
  end if;
  return new;
end $function$;

-- 3) backup: more time, built in one pass
create or replace function public.admin_backup() returns json
language plpgsql security definer set search_path = '' set statement_timeout = '120s' as $f$
declare r record; parts jsonb[] := '{}'; rows jsonb; out jsonb;
begin
  if auth.uid() is distinct from private.hoop_main_admin() then
    raise exception 'ADMIN: Only the main admin can download a backup.';
  end if;
  for r in select table_schema s, table_name t from information_schema.tables
           where table_schema in ('public', 'private') and table_type = 'BASE TABLE' order by 1, 2 loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I.%I x', r.s, r.t) into rows;
    parts := parts || jsonb_build_object(r.s || '.' || r.t, rows);
  end loop;
  parts := parts || jsonb_build_object('auth.users', (select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'email', u.email, 'created_at', u.created_at, 'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at)), '[]') from auth.users u));
  parts := parts || jsonb_build_object('storage.objects', (select coalesce(jsonb_agg(jsonb_build_object(
           'bucket', o.bucket_id, 'name', o.name, 'size', o.metadata->>'size', 'type', o.metadata->>'mimetype', 'created_at', o.created_at)), '[]') from storage.objects o));
  parts := parts || jsonb_build_object('storage.buckets', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public)), '[]') from storage.buckets b));
  select jsonb_object_agg(k, v) into out from unnest(parts) p, jsonb_each(p) e(k, v);
  return json_build_object('app', 'MINAW DAVAO', 'project', 'ckwdiwfnivquokggjtyq', 'made_at', now(), 'tables', out);
end $f$;
