import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardGame } from "@/lib/types";

export const DASHBOARD_GAMES_PAGE_SIZE = 12;

/** Dashboard list: all games, vs Boardly bot only, or human opponents only. */
export type DashboardGamesFilter = "all" | "ai" | "human";

/** Query string for `/dashboard` links (page + optional filter). */
export function dashboardHref(
  page: number,
  filter: DashboardGamesFilter
): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const q = params.toString();
  return q ? `/dashboard?${q}` : "/dashboard";
}

type GameRowForDashboard = {
  id: string;
  name: string | null;
  created_by: string | null;
  winner_id: string | null;
  status: string;
  game_type: string;
  time_control: { type: string };
  state: {
    turn?: "white" | "black";
    fen?: string;
    vs_bot?: boolean;
  };
  created_at: string;
  game_players: Array<{
    user_id: string;
    color: string;
    users: {
      id: string;
      username: string;
      avatar_url: string | null;
      elo_rating?: number;
    } | null;
  }>;
};

function mapRowsToDashboardGames(
  gameRows: GameRowForDashboard[],
  userId: string
): DashboardGame[] {
  return gameRows.map((g) => {
    const players = g.game_players ?? [];
    const opponentRow = players.find((p) => p.user_id !== userId);
    const myRow = players.find((p) => p.user_id === userId);

    return {
      id: g.id,
      name: g.name ?? null,
      created_by: g.created_by ?? null,
      winner_id: (g.winner_id as string | null | undefined) ?? null,
      status: g.status as DashboardGame["status"],
      game_type: g.game_type,
      time_control: g.time_control,
      state: g.state,
      created_at: g.created_at,
      my_color: (myRow?.color as "white" | "black") ?? "white",
      opponent: opponentRow?.users ?? null,
    };
  });
}

export async function loadDashboardGamesPage(
  admin: SupabaseClient,
  userId: string,
  page: number,
  filter: DashboardGamesFilter = "all"
): Promise<{
  games: DashboardGame[];
  totalCount: number;
  page: number;
  pageSize: number;
}> {
  const pageSize = DASHBOARD_GAMES_PAGE_SIZE;
  const safePage = Math.max(1, Math.floor(page));
  const offset = (safePage - 1) * pageSize;

  let idQuery = admin
    .from("games")
    .select("id, game_players!inner(user_id)", { count: "exact" })
    .eq("game_players.user_id", userId)
    .in("status", ["waiting", "active", "completed", "abandoned"]);

  if (filter === "ai") {
    idQuery = idQuery.contains("state", { vs_bot: true });
  } else if (filter === "human") {
    // not() does not JSON-stringify objects — raw values become "[object Object]".
    // PostgREST expects the same payload as contains(): cs.{"vs_bot":true}
    idQuery = idQuery.not("state", "cs", JSON.stringify({ vs_bot: true }));
  }

  const {
    data: idRows,
    error: idError,
    count,
  } = await idQuery
    .order("updated_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (idError) {
    console.error("[dashboard] paginated id query error:", idError);
    return {
      games: [],
      totalCount: 0,
      page: safePage,
      pageSize,
    };
  }

  const totalCount = count ?? 0;
  const ids = (idRows ?? []).map((r) => r.id as string);

  if (ids.length === 0) {
    return {
      games: [],
      totalCount,
      page: safePage,
      pageSize,
    };
  }

  const idOrder = new Map(ids.map((id, i) => [id, i]));

  const { data: gameRows, error: gamesError } = await admin
    .from("games")
    .select(
      `
      id,
      name,
      created_by,
      winner_id,
      status,
      game_type,
      time_control,
      state,
      created_at,
      game_players (
        user_id,
        color,
        users (
          id,
          username,
          avatar_url,
          elo_rating
        )
      )
    `
    )
    .in("id", ids)
    .in("status", ["waiting", "active", "completed", "abandoned"]);

  if (gamesError) {
    console.error("[dashboard] full games query error:", gamesError);
    return {
      games: [],
      totalCount,
      page: safePage,
      pageSize,
    };
  }

  const rows = [...(gameRows ?? [])] as unknown as GameRowForDashboard[];
  rows.sort(
    (a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0)
  );

  return {
    games: mapRowsToDashboardGames(rows, userId),
    totalCount,
    page: safePage,
    pageSize,
  };
}
