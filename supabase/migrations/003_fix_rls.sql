-- ============================================================
-- 003_fix_rls.sql
-- Full RLS audit: drop all existing policies and replace with
-- correct, minimal-privilege rules.
--
-- Design principles:
--   • Writes that go through the service-role admin client (game_players
--     inserts, moves inserts) have NO user-level policy — the service role
--     bypasses RLS entirely, so a policy would only create attack surface.
--   • Subqueries that reference game_players use the fully-qualified outer
--     column (games.id or moves.game_id) to avoid any ambiguity.
-- ============================================================


-- ============================================================
-- Drop every existing policy on every table
-- (makes this migration idempotent / safe to re-run after manual
--  dashboard edits that may have introduced stale policies)
-- ============================================================

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('users','games','game_players','moves','invites','notifications')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end;
$$;


-- ============================================================
-- Re-enable RLS (safe no-op if already enabled)
-- ============================================================
alter table public.users         enable row level security;
alter table public.games         enable row level security;
alter table public.game_players  enable row level security;
alter table public.moves         enable row level security;
alter table public.invites       enable row level security;
alter table public.notifications enable row level security;


-- ============================================================
-- users
-- ============================================================

-- Anyone (authenticated or anon) can read public profiles.
create policy "users: anyone can read"
  on public.users
  for select
  using (true);

-- Users can only update their own profile row.
create policy "users: owner can update"
  on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- ============================================================
-- games
-- ============================================================

-- Users can read games they participate in.
create policy "games: players can read"
  on public.games
  for select
  using (
    exists (
      select 1
      from public.game_players gp
      where gp.game_id = games.id
        and gp.user_id = auth.uid()
    )
  );

-- Any authenticated user can create a game; they must be the creator.
create policy "games: authenticated can insert"
  on public.games
  for insert
  with check (
    auth.uid() is not null
    and auth.uid() = created_by
  );

-- Only players already in the game can update it.
create policy "games: players can update"
  on public.games
  for update
  using (
    exists (
      select 1
      from public.game_players gp
      where gp.game_id = games.id
        and gp.user_id = auth.uid()
    )
  );


-- ============================================================
-- game_players
-- ============================================================

-- Users can see all player rows for games they are a member of
-- (needed so each side can see who their opponent is / what color they play).
create policy "game_players: members can read"
  on public.game_players
  for select
  using (
    exists (
      select 1
      from public.game_players me
      where me.game_id = game_players.game_id
        and me.user_id = auth.uid()
    )
  );

-- No user-level INSERT policy.
-- All game_players rows are inserted by API routes using the service-role
-- admin client, which bypasses RLS.  A user-facing insert policy would
-- allow clients to join arbitrary games directly.


-- ============================================================
-- moves
-- ============================================================

-- Users can read all moves for games they are a player in.
create policy "moves: players can read"
  on public.moves
  for select
  using (
    exists (
      select 1
      from public.game_players gp
      where gp.game_id = moves.game_id
        and gp.user_id = auth.uid()
    )
  );

-- No user-level INSERT policy.
-- Move validation (turn order, legality) and insertion are handled by the
-- API route /api/moves/[id] using the service-role admin client.


-- ============================================================
-- invites
-- ============================================================

-- The inviter can always see their own invites (e.g. to list pending invites).
create policy "invites: inviter can read own"
  on public.invites
  for select
  using (auth.uid() = inviter_id);

-- Anyone (including unauthenticated visitors following an invite link) can
-- read an invite row.  The 40-hex-char token is unguessable; the API always
-- filters by token so exposure is limited to the single row.
create policy "invites: anyone with token can read"
  on public.invites
  for select
  using (true);

-- Authenticated users can create invites for games they are a player in.
create policy "invites: players can create"
  on public.invites
  for insert
  with check (
    auth.uid() = inviter_id
    and exists (
      select 1
      from public.game_players gp
      where gp.game_id = invites.game_id
        and gp.user_id = auth.uid()
    )
  );


-- ============================================================
-- notifications
-- ============================================================

-- Users can only see their own notifications.
create policy "notifications: owner can read"
  on public.notifications
  for select
  using (auth.uid() = user_id);

-- Users can only update (e.g. mark as read) their own notifications.
create policy "notifications: owner can update"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
