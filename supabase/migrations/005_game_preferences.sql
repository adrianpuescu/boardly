-- ============================================================
-- 005_game_preferences.sql
-- Per-game piece set preferences + global default on user profile
-- ============================================================

-- Add global default piece set to user profiles
alter table public.users
  add column if not exists default_piece_set text;

-- ── user_game_preferences ────────────────────────────────────────────────────
create table if not exists public.user_game_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  game_id     uuid not null references public.games(id) on delete cascade,
  piece_set   text not null,
  created_at  timestamptz default now(),
  unique (user_id, game_id)
);

alter table public.user_game_preferences enable row level security;

-- Users can read their own preferences
create policy "game_prefs: owner can select"
  on public.user_game_preferences
  for select
  using (auth.uid() = user_id);

-- Users can insert their own preferences
create policy "game_prefs: owner can insert"
  on public.user_game_preferences
  for insert
  with check (auth.uid() = user_id);

-- Users can update their own preferences
create policy "game_prefs: owner can update"
  on public.user_game_preferences
  for update
  using (auth.uid() = user_id);

-- Users can delete their own preferences
create policy "game_prefs: owner can delete"
  on public.user_game_preferences
  for delete
  using (auth.uid() = user_id);
