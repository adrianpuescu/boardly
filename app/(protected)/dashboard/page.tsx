import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardClient } from "@/components/game/DashboardClient";
import { isAnonymousAuthUser } from "@/lib/auth/isAnonymous";
import type { DashboardGame, CurrentUser } from "@/lib/types";

export default async function DashboardPage() {
  // Auth check via the user-scoped client — never trust the admin client for identity.
  const supabase = createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (isAnonymousAuthUser(user)) {
    redirect("/login");
  }

  // Fetch the current user's public profile (has the uploaded avatar_url)
  const { data: myProfile } = await admin
    .from("users")
    .select("username, avatar_url, elo_rating, country")
    .eq("id", user.id)
    .single();

  // Step 1: get every game_id + color for this user.
  // Use admin client so the self-referential RLS policy on game_players
  // doesn't filter out opponent rows (recursive RLS issue).
  const { data: myPlayerRows } = await admin
    .from("game_players")
    .select("game_id, color")
    .eq("user_id", user.id);

  const gameIds = myPlayerRows?.map((r) => r.game_id) ?? [];
  const myColorMap = Object.fromEntries(
    (myPlayerRows ?? []).map((r) => [r.game_id, r.color as "white" | "black"])
  );

  // Step 2: fetch those games with all their players + user profiles.
  // Admin client bypasses the recursive RLS on game_players so both
  // player rows (self + opponent) are returned in the nested join.
  let games: DashboardGame[] = [];

  if (gameIds.length > 0) {
    const { data: gameRows, error: gamesQueryError } = await admin
      .from("games")
      .select(
        `
        id,
        name,
        created_by,
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
      .in("id", gameIds)
      .in("status", ["waiting", "active", "completed", "abandoned"])
      .order("updated_at", { ascending: false });

    if (gamesQueryError) {
      console.error("[dashboard] games query error:", gamesQueryError);
    }

    console.log(
      "[dashboard] games fetched:",
      (gameRows ?? []).length,
      (gameRows ?? []).map((g) => ({
        id: g.id,
        status: g.status,
        playerCount: Array.isArray(g.game_players) ? g.game_players.length : 0,
        vs_bot: Boolean((g.state as { vs_bot?: boolean } | null)?.vs_bot),
      }))
    );

    games = (gameRows ?? []).map((g) => {
      // PostgREST embeds the FK-referenced row (users) as a single object,
      // not an array — game_players.user_id → public.users.id is many-to-one.
      const players = (g.game_players ?? []) as unknown as Array<{
        user_id: string;
        color: string;
        users: { id: string; username: string; avatar_url: string | null; elo_rating?: number } | null;
      }>;

      const opponentRow = players.find((p) => p.user_id !== user.id);

      return {
        id: g.id,
        name: (g.name as string | null) ?? null,
        created_by: (g.created_by as string | null) ?? null,
        status: g.status as "waiting" | "active" | "completed" | "abandoned",
        game_type: g.game_type as string,
        time_control: g.time_control as { type: string },
        state: g.state as {
          turn?: "white" | "black";
          fen?: string;
          vs_bot?: boolean;
        },
        created_at: g.created_at as string,
        my_color: myColorMap[g.id] ?? "white",
        opponent: opponentRow?.users ?? null,
      };
    });
  }

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email ?? "",
    username: myProfile?.username ?? user.email?.split("@")[0] ?? "",
    avatar_url:
      myProfile?.avatar_url ??
      (user.user_metadata?.avatar_url as string | null) ??
      (user.user_metadata?.picture as string | null) ??
      null,
    elo_rating: (myProfile?.elo_rating as number | undefined) ?? 1200,
    country: (myProfile?.country as string | null | undefined) ?? null,
  };

  return <DashboardClient games={games} currentUser={currentUser} />;
}
