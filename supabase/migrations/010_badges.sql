create table if not exists public.badges (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null,
  category text not null check (category in ('wins', 'social', 'special'))
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_id text not null references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create index if not exists user_badges_user_id_idx on public.user_badges (user_id);
create index if not exists user_badges_badge_id_idx on public.user_badges (badge_id);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

create policy "badges: anyone can read"
  on public.badges for select
  using (true);

create policy "user_badges: users can read own"
  on public.user_badges for select
  using (auth.uid() = user_id);

insert into public.badges (id, name, description, icon, category)
values
  ('first_win', 'First Win', 'Win your first game', '🏆', 'wins'),
  ('wins_10', '10 Wins', 'Win 10 games', '🥇', 'wins'),
  ('wins_100', '100 Wins', 'Win 100 games', '👑', 'wins'),
  ('first_friend', 'Social Butterfly', 'Add your first friend', '🤝', 'social'),
  ('friends_10', 'Popular', 'Have 10 friends', '👥', 'social'),
  ('early_adopter', 'Early Adopter', 'One of the first players on Boardly', '⭐', 'special'),
  ('first_game', 'First Move', 'Play your first game', '🎮', 'special'),
  ('games_10', 'Getting Started', 'Play 10 games', '🎯', 'special'),
  ('games_100', 'Veteran', 'Play 100 games', '🎖️', 'special'),
  ('win_streak_3', 'On Fire', 'Win 3 games in a row', '🔥', 'wins'),
  ('win_streak_5', 'Unstoppable', 'Win 5 games in a row', '⚡', 'wins')
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  category = excluded.category;

-- Existing users at the time of introducing badges are considered early adopters.
insert into public.user_badges (user_id, badge_id)
select u.id, 'early_adopter'
from public.users u
on conflict (user_id, badge_id) do nothing;

-- Backfill "first_game" for users who already played at least one game.
insert into public.user_badges (user_id, badge_id)
select distinct gp.user_id, 'first_game'
from public.game_players gp
on conflict (user_id, badge_id) do nothing;
