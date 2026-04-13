-- ============================================================
-- Fix handle_new_user trigger + backfill existing auth users
-- ============================================================

-- Rewrite the trigger function to handle Google OAuth and other providers
-- where the email may live in raw_user_meta_data rather than auth.users.email.
-- Also fall back to display_name / full_name from metadata before using the UUID.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_email    text;
  v_username text;
begin
  -- Prefer the top-level email column; fall back to metadata (OAuth providers)
  v_email := coalesce(
    nullif(trim(new.email), ''),
    nullif(trim(new.raw_user_meta_data->>'email'), '')
  );

  -- Build a username: email prefix → display_name → full_name → UUID prefix
  v_username := coalesce(
    nullif(trim(split_part(v_email, '@', 1)), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    'user_' || substr(new.id::text, 1, 8)
  );

  insert into public.users (id, username)
  values (new.id, v_username)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Backfill any auth users who have no public.users row yet
-- (covers users who signed up before the trigger existed or before this fix)
do $$
declare
  rec record;
  v_email    text;
  v_username text;
begin
  for rec in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    where not exists (
      select 1 from public.users pu where pu.id = au.id
    )
  loop
    v_email := coalesce(
      nullif(trim(rec.email), ''),
      nullif(trim(rec.raw_user_meta_data->>'email'), '')
    );

    v_username := coalesce(
      nullif(trim(split_part(v_email, '@', 1)), ''),
      nullif(trim(rec.raw_user_meta_data->>'name'), ''),
      nullif(trim(rec.raw_user_meta_data->>'full_name'), ''),
      'user_' || substr(rec.id::text, 1, 8)
    );

    insert into public.users (id, username)
    values (rec.id, v_username)
    on conflict (id) do nothing;
  end loop;
end;
$$;
