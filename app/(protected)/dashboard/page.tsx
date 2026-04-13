import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/game/DashboardClient";
import type { DashboardGame, CurrentUser } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Step 1: get every game_id + color for this user
  const { data: myPlayerRows } = await supabase
    .from("game_players")
    .select("game_id, color")
    .eq("user_id", user.id);

  const gameIds = myPlayerRows?.map((r) => r.game_id) ?? [];
  const myColorMap = Object.fromEntries(
    (myPlayerRows ?? []).map((r) => [r.game_id, r.color as "white" | "black"])
  );

  // Step 2: fetch those games with all their players + user profiles
  let games: DashboardGame[] = [];

  if (gameIds.length > 0) {
    const { data: gameRows } = await supabase
      .from("games")
      .select(
        `
        id,
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
            avatar_url
          )
        )
      `
      )
      .in("id", gameIds)
      .in("status", ["waiting", "active"])
      .order("updated_at", { ascending: false });

    games = (gameRows ?? []).map((g) => {
      // Supabase returns related rows as arrays even for FK-based to-one joins.
      const players = (g.game_players ?? []) as Array<{
        user_id: string;
        color: string;
        users: { id: string; username: string; avatar_url: string | null }[];
      }>;

      const opponentRow = players.find((p) => p.user_id !== user.id);

      return {
        id: g.id,
        status: g.status as "waiting" | "active",
        game_type: g.game_type as string,
        time_control: g.time_control as { type: string },
        state: g.state as { turn?: "white" | "black"; fen?: string },
        created_at: g.created_at as string,
        my_color: myColorMap[g.id] ?? "white",
        opponent: opponentRow?.users?.[0] ?? null,
      };
    });
  }

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email ?? "",
    avatar_url:
      (user.user_metadata?.avatar_url as string | undefined) ?? null,
  };

  return <DashboardClient games={games} currentUser={currentUser} />;
}
