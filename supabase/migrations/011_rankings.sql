alter table public.users
  add column if not exists elo_rating integer not null default 1200,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists continent text;

create table if not exists public.elo_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  elo_before integer not null,
  elo_after integer not null,
  change integer not null,
  created_at timestamptz not null default now()
);

create index if not exists elo_history_user_id_idx on public.elo_history (user_id);
create index if not exists elo_history_game_id_idx on public.elo_history (game_id);
create index if not exists users_elo_rating_idx on public.users (elo_rating desc);
create index if not exists users_country_elo_idx on public.users (country, elo_rating desc);

alter table public.elo_history enable row level security;

create policy "elo_history: anyone can read"
  on public.elo_history for select
  using (true);
