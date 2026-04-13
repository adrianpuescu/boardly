import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Navbar } from "@/components/layout/Navbar";
import { ProfileClient } from "@/components/profile/ProfileClient";
import type { CurrentUser, ProfileStats, RecentGame } from "@/lib/types";

export default async function ProfilePage() {
  const supabase = createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch public profile
  const { data: profile } = await admin
    .from("users")
    .select("id, username, avatar_url, created_at")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Fetch all game_player rows for this user
  const { data: myPlayerRows } = await admin
    .from("game_players")
    .select("game_id, color")
    .eq("user_id", user.id);

  const gameIds = myPlayerRows?.map((r) => r.game_id) ?? [];

  let stats: ProfileStats = {
    total: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    win_rate: 0,
  };
  let recentGames: RecentGame[] = [];

  if (gameIds.length > 0) {
    const { data: completedRows } = await admin
      .from("games")
      .select(
        `
        id,
        winner_id,
        time_control,
        updated_at,
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
      .eq("status", "completed")
      .order("updated_at", { ascending: false });

    const completed = completedRows ?? [];

    stats.total = completed.length;

    for (const g of completed) {
      if (g.winner_id === null) {
        stats.draws++;
      } else if (g.winner_id === user.id) {
        stats.wins++;
      } else {
        stats.losses++;
      }
    }

    stats.win_rate =
      stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

    recentGames = completed.slice(0, 5).map((g) => {
      const players = (g.game_players ?? []) as Array<{
        user_id: string;
        color: string;
        users: {
          id: string;
          username: string;
          avatar_url: string | null;
        } | null;
      }>;

      const opponentRow = players.find((p) => p.user_id !== user.id);

      let result: "win" | "loss" | "draw";
      if (g.winner_id === null) result = "draw";
      else if (g.winner_id === user.id) result = "win";
      else result = "loss";

      return {
        id: g.id as string,
        opponent: opponentRow?.users
          ? {
              id: opponentRow.users.id,
              username: opponentRow.users.username,
              avatar_url: opponentRow.users.avatar_url,
            }
          : null,
        result,
        time_control: g.time_control as { type: string; minutes?: number },
        played_at: g.updated_at as string,
      };
    });
  }

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email ?? "",
    avatar_url:
      (user.user_metadata?.avatar_url as string | undefined) ?? null,
  };

  return (
    <>
      <Navbar currentUser={currentUser} />
      <ProfileClient
        profile={profile as { id: string; username: string; avatar_url: string | null; created_at: string }}
        stats={stats}
        recentGames={recentGames}
        email={user.email ?? ""}
      />
    </>
  );
}
