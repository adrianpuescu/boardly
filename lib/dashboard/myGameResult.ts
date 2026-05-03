import type { DashboardGame } from "@/lib/types";

export type MyGameResult = "win" | "loss" | "draw" | null;

/**
 * Outcome for the logged-in player on the dashboard. Returns null when there is
 * no scored result (in-progress games, or abandoned games without a winner).
 */
export function getMyGameResult(
  game: DashboardGame,
  userId: string
): MyGameResult {
  if (game.status === "waiting" || game.status === "active") return null;
  if (game.status === "abandoned" && game.winner_id == null) return null;
  if (game.winner_id == null) return "draw";
  if (game.winner_id === userId) return "win";
  return "loss";
}
