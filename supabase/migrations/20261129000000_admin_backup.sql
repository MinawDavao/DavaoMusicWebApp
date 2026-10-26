-- Full data backup for the main admin: every table in public + private as one JSON file,
-- plus the list of uploaded files (storage) and the account list (id, email, dates).
-- Photos and song files themselves stay in Supabase storage.
create or replace function public.admin_backup() returns json
language plpgsql security definer set search_path = '' as $f$
declare r record; out jsonb := '{}'; rows jsonb;
begin
  if auth.uid() is distinct from private.hoop_main_admin() then
    raise exception 'ADMIN: Only the main admin can download a backup.';
  end if;
  for r in select table_schema s, table_name t from information_schema.tables
           where table_schema in ('public', 'private') and table_type = 'BASE TABLE' order by 1, 2 loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I.%I x', r.s, r.t) into rows;
    out := out || jsonb_build_object(r.s || '.' || r.t, rows);
  end loop;
  out := out || jsonb_build_object('auth.users', (select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'email', u.email, 'created_at', u.created_at, 'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at)), '[]') from auth.users u));
  out := out || jsonb_build_object('storage.objects', (select coalesce(jsonb_agg(jsonb_build_object(
           'bucket', o.bucket_id, 'name', o.name, 'size', o.metadata->>'size', 'type', o.metadata->>'mimetype', 'created_at', o.created_at)), '[]') from storage.objects o));
  return json_build_object('app', 'MINAW DAVAO', 'project', 'ckwdiwfnivquokggjtyq', 'made_at', now(), 'tables', out);
end $f$;
revoke all on function public.admin_backup() from public, anon;
grant execute on function public.admin_backup() to authenticated;
