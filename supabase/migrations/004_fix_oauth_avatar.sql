-- ============================================================
-- Fix handle_new_user to capture OAuth avatar_url + backfill
-- ============================================================

-- Rewrite trigger to also save the avatar URL from Google / other OAuth providers.
-- On conflict (user already exists), fill in avatar_url only if it is still NULL
-- so manual uploads are never overwritten.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_email    text;
  v_username text;
  v_avatar   text;
begin
  v_email := coalesce(
    nullif(trim(new.email), ''),
    nullif(trim(new.raw_user_meta_data->>'email'), '')
  );

  v_username := coalesce(
    nullif(trim(split_part(v_email, '@', 1)), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    'user_' || substr(new.id::text, 1, 8)
  );

  -- Google stores the avatar as 'avatar_url'; some providers use 'picture'
  v_avatar := coalesce(
    nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data->>'picture'), '')
  );

  insert into public.users (id, username, avatar_url)
  values (new.id, v_username, v_avatar)
  on conflict (id) do update set
    avatar_url = case
      when public.users.avatar_url is null then excluded.avatar_url
      else public.users.avatar_url
    end;

  return new;
end;
$$;

-- Backfill existing OAuth users whose avatar_url is still NULL
update public.users pu
set avatar_url = coalesce(
  nullif(trim(au.raw_user_meta_data->>'avatar_url'), ''),
  nullif(trim(au.raw_user_meta_data->>'picture'), '')
)
from auth.users au
where pu.id = au.id
  and pu.avatar_url is null
  and (
    au.raw_user_meta_data->>'avatar_url' is not null
    or au.raw_user_meta_data->>'picture' is not null
  );
