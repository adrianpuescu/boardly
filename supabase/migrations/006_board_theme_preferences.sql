-- ============================================================
-- 006_board_theme_preferences.sql
-- Add board theme preferences (global + per-game)
-- ============================================================

-- Global default board theme on user profile
alter table public.users
  add column if not exists default_board_theme text;

-- Allow independent per-game preferences for piece set and board theme
alter table public.user_game_preferences
  alter column piece_set drop not null;

alter table public.user_game_preferences
  add column if not exists board_theme text;
