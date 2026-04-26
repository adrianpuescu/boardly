-- One-time ELO backfill from historical completed decisive games.
-- Rebuilds elo_history and users.elo_rating by replaying games chronologically.

create unique index if not exists elo_history_game_user_unique_idx
  on public.elo_history (game_id, user_id);

do $$
declare
  game_row record;
  winner_rating integer;
  loser_rating integer;
  winner_games integer;
  loser_games integer;
  k_factor integer;
  expected_winner numeric;
  expected_loser numeric;
  new_winner integer;
  new_loser integer;
begin
  -- Recompute from scratch to make historical ratings deterministic.
  delete from public.elo_history;
  update public.users set elo_rating = 1200;

  create temporary table tmp_elo_state (
    user_id uuid primary key,
    elo_rating integer not null,
    games_played integer not null
  ) on commit drop;

  insert into tmp_elo_state (user_id, elo_rating, games_played)
  select id, 1200, 0
  from public.users;

  for game_row in
    select
      g.id as game_id,
      g.created_at,
      g.winner_id,
      (
        select gp.user_id
        from public.game_players gp
        where gp.game_id = g.id
          and gp.user_id <> g.winner_id
        limit 1
      ) as loser_id
    from public.games g
    where g.status = 'completed'
      and g.winner_id is not null
    order by g.created_at asc, g.id asc
  loop
    if game_row.loser_id is null then
      continue;
    end if;

    select elo_rating, games_played
      into winner_rating, winner_games
    from tmp_elo_state
    where user_id = game_row.winner_id;

    select elo_rating, games_played
      into loser_rating, loser_games
    from tmp_elo_state
    where user_id = game_row.loser_id;

    if winner_rating is null or loser_rating is null then
      continue;
    end if;

    -- Keep K-factor behavior aligned with runtime implementation.
    k_factor := case
      when greatest(winner_games, loser_games) < 30 then 32
      else 16
    end;

    expected_winner := 1 / (1 + power(10, (loser_rating - winner_rating) / 400.0));
    expected_loser := 1 / (1 + power(10, (winner_rating - loser_rating) / 400.0));

    new_winner := round(winner_rating + (k_factor * (1 - expected_winner)));
    new_loser := round(loser_rating + (k_factor * (0 - expected_loser)));

    insert into public.elo_history (
      user_id,
      game_id,
      elo_before,
      elo_after,
      change
    )
    values
      (
        game_row.winner_id,
        game_row.game_id,
        winner_rating,
        new_winner,
        new_winner - winner_rating
      ),
      (
        game_row.loser_id,
        game_row.game_id,
        loser_rating,
        new_loser,
        new_loser - loser_rating
      )
    on conflict (game_id, user_id) do update
      set
        elo_before = excluded.elo_before,
        elo_after = excluded.elo_after,
        change = excluded.change;

    update tmp_elo_state
      set elo_rating = new_winner,
          games_played = games_played + 1
      where user_id = game_row.winner_id;

    update tmp_elo_state
      set elo_rating = new_loser,
          games_played = games_played + 1
      where user_id = game_row.loser_id;
  end loop;

  update public.users u
    set elo_rating = s.elo_rating
  from tmp_elo_state s
  where u.id = s.user_id;
end $$;
