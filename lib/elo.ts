const K_FACTOR_NEW_PLAYER = 32;
const K_FACTOR_EXPERIENCED_PLAYER = 16;
const NEW_PLAYER_GAMES_THRESHOLD = 30;

function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));
}

export function getKFactor(gamesPlayed: number): number {
  return gamesPlayed < NEW_PLAYER_GAMES_THRESHOLD
    ? K_FACTOR_NEW_PLAYER
    : K_FACTOR_EXPERIENCED_PLAYER;
}

export function calculateElo(
  winnerElo: number,
  loserElo: number,
  kFactor: number
): { newWinnerElo: number; newLoserElo: number } {
  const winnerExpected = expectedScore(winnerElo, loserElo);
  const loserExpected = expectedScore(loserElo, winnerElo);

  const newWinnerElo = Math.round(winnerElo + kFactor * (1 - winnerExpected));
  const newLoserElo = Math.round(loserElo + kFactor * (0 - loserExpected));

  return { newWinnerElo, newLoserElo };
}
