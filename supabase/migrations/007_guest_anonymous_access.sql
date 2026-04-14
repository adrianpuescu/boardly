-- ============================================================
-- Guest play (Supabase Anonymous Auth)
-- ============================================================
-- Anonymous users are normal auth.users rows; auth.uid() in RLS is set for
-- their session the same as for email/OAuth users.
--
-- public.users rows are created by public.handle_new_user() on auth.users
-- insert (including anonymous sign-ups).
--
-- Inserts into public.game_players and public.moves are performed by API
-- routes using the service role (bypasses RLS), so no extra INSERT policies
-- are required for guests to join or play.
--
-- Enable "Anonymous sign-ins" in Supabase Dashboard → Authentication →
-- Providers → Anonymous.
-- ============================================================

comment on table public.game_players is
  'Game membership. May include anonymous auth users (Supabase Anonymous Auth).';

comment on table public.moves is
  'Move history. user_id may reference anonymous players; writes go through API (service role).';
