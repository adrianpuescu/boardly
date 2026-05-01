insert into public.badges (id, name, description, icon, category)
values
  ('first_bot_game', 'First Bot Game', 'Play your first game against the AI', '🤖', 'special'),
  ('beat_the_bot', 'Bot Slayer', 'Beat the AI bot for the first time', '🏅', 'wins'),
  ('beat_hard_bot', 'Machine Breaker', 'Beat the AI bot on Hard or Expert difficulty', '🧠', 'wins')
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  category = excluded.category;
