-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists pgcrypto;


-- ============================================================
-- Tables
-- ============================================================

-- users (public profile, mirrors auth.users)
create table public.users (
  id           uuid        primary key references auth.users (id) on delete cascade,
  username     text        unique not null,
  avatar_url   text,
  timezone     text        not null default 'UTC',
  notif_prefs  jsonb       not null default '{"email": true, "push": false}'::jsonb,
  created_at   timestamptz not null default now()
);

-- games
create table public.games (
  id           uuid        primary key default gen_random_uuid(),
  game_type    text        not null default 'chess',
  status       text        not null default 'waiting',  -- waiting | active | completed | abandoned
  state        jsonb       not null default '{}'::jsonb, -- FEN, turn, check status, etc.
  time_control jsonb       not null default '{"type": "unlimited"}'::jsonb,
  winner_id    uuid        references public.users (id),
  created_by   uuid        references public.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- game_players
create table public.game_players (
  id        uuid        primary key default gen_random_uuid(),
  game_id   uuid        not null references public.games (id) on delete cascade,
  user_id   uuid        not null references public.users (id) on delete cascade,
  color     text        not null, -- 'white' | 'black'
  joined_at timestamptz not null default now(),
  unique (game_id, user_id),
  unique (game_id, color)
);

-- moves
create table public.moves (
  id          uuid        primary key default gen_random_uuid(),
  game_id     uuid        not null references public.games (id) on delete cascade,
  user_id     uuid        not null references public.users (id) on delete cascade,
  move_san    text        not null, -- e.g. "e4", "Nf3", "O-O"
  fen_after   text        not null, -- full FEN string after the move
  move_number integer     not null,
  created_at  timestamptz not null default now()
);

-- invites
create table public.invites (
  id            uuid        primary key default gen_random_uuid(),
  game_id       uuid        not null references public.games (id) on delete cascade,
  inviter_id    uuid        not null references public.users (id),
  invitee_email text,
  token         text        unique not null default encode(gen_random_bytes(16), 'hex'),
  status        text        not null default 'pending', -- pending | accepted | declined | expired
  expires_at    timestamptz not null default now() + interval '7 days',
  created_at    timestamptz not null default now()
);

-- notifications
create table public.notifications (
  id      uuid        primary key default gen_random_uuid(),
  user_id uuid        not null references public.users (id) on delete cascade,
  type    text        not null, -- 'your_turn' | 'game_over' | 'invite' | 'game_started'
  payload jsonb       not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);


-- ============================================================
-- Indexes
-- ============================================================
create index on public.game_players (game_id);
create index on public.game_players (user_id);
create index on public.moves (game_id);
create index on public.moves (created_at);
create index on public.notifications (user_id);
create index on public.invites (token);


-- ============================================================
-- Triggers
-- ============================================================

-- 1. Keep games.updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_games_updated_at
  before update on public.games
  for each row execute procedure public.set_updated_at();


-- 2. Auto-create a public.users row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, username)
  values (
    new.id,
    -- use the part before @ in the email; fall back to the raw user_id
    coalesce(
      split_part(new.email, '@', 1),
      new.id::text
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================
-- Row-Level Security
-- ============================================================
alter table public.users         enable row level security;
alter table public.games         enable row level security;
alter table public.game_players  enable row level security;
alter table public.moves         enable row level security;
alter table public.invites       enable row level security;
alter table public.notifications enable row level security;


-- ---- users ----
create policy "users: anyone can read"
  on public.users for select
  using (true);

create policy "users: owner can update"
  on public.users for update
  using (auth.uid() = id);


-- ---- games ----
-- Helper: is the current user a player in this game?
create policy "games: players can read"
  on public.games for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = id
        and gp.user_id = auth.uid()
    )
  );

create policy "games: authenticated users can insert"
  on public.games for insert
  with check (auth.uid() = created_by);

create policy "games: players can update"
  on public.games for update
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = id
        and gp.user_id = auth.uid()
    )
  );


-- ---- game_players ----
create policy "game_players: players can read"
  on public.game_players for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = game_id
        and gp.user_id = auth.uid()
    )
  );

create policy "game_players: users can join"
  on public.game_players for insert
  with check (auth.uid() = user_id);


-- ---- moves ----
create policy "moves: players can read"
  on public.moves for select
  using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = game_id
        and gp.user_id = auth.uid()
    )
  );

-- Insert allowed only when it is the user's turn.
-- "It's your turn" means the game state's 'turn' field matches your color.
create policy "moves: players can insert on their turn"
  on public.moves for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.game_players gp
      join public.games g on g.id = gp.game_id
      where gp.game_id = game_id
        and gp.user_id = auth.uid()
        and g.status   = 'active'
        -- state->>'turn' should equal this player's color ('white' or 'black')
        and g.state->>'turn' = gp.color
    )
  );


-- ---- invites ----
create policy "invites: inviter can read own"
  on public.invites for select
  using (auth.uid() = inviter_id);

create policy "invites: anyone with token can read"
  on public.invites for select
  using (true); -- token is unguessable; fine to expose row when queried by token

create policy "invites: inviter can create"
  on public.invites for insert
  with check (auth.uid() = inviter_id);


-- ---- notifications ----
create policy "notifications: owner can read"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications: owner can update (mark read)"
  on public.notifications for update
  using (auth.uid() = user_id);
