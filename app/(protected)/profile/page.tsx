import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Navbar } from "@/components/layout/Navbar";
import { ProfileClient } from "@/components/profile/ProfileClient";
import type {
  CurrentUser,
  ProfileBadge,
  ProfileStats,
  RecentGame,
} from "@/lib/types";

interface FriendshipStatusRow {
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined" | "blocked";
}

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
    .select("id, username, avatar_url, created_at, elo_rating, country, city, continent")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Fetch all game_player rows for this user
  const { data: myPlayerRows } = await admin
    .from("game_players")
    .select("game_id, color")
    .eq("user_id", user.id);

  const gameIds = myPlayerRows?.map((r) => r.game_id) ?? [];

  const stats: ProfileStats = {
    total: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    win_rate: 0,
  };
  let recentGames: RecentGame[] = [];
  let badges: ProfileBadge[] = [];

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
      const players = (g.game_players ?? []) as unknown as Array<{
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
        friend_request_status: "none",
      };
    });
  }

  const opponentIds = Array.from(
    new Set(
      recentGames
        .map((game) => game.opponent?.id)
        .filter((id): id is string => !!id)
    )
  );

  if (opponentIds.length > 0) {
    const { data: friendshipRows } = await admin
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .in("status", ["pending", "accepted", "declined"]);

    const relationByOpponent = new Map<
      string,
      RecentGame["friend_request_status"]
    >();

    for (const row of (friendshipRows ?? []) as FriendshipStatusRow[]) {
      const opponentId =
        row.requester_id === user.id ? row.addressee_id : row.requester_id;
      if (!opponentIds.includes(opponentId)) continue;

      if (row.status === "accepted") {
        relationByOpponent.set(opponentId, "friends");
      } else if (row.status === "pending") {
        relationByOpponent.set(opponentId, "pending");
      } else if (row.status === "declined") {
        relationByOpponent.set(
          opponentId,
          row.requester_id === user.id ? "declined_by_them" : "declined_by_you"
        );
      }
    }

    recentGames = recentGames.map((game) => {
      if (!game.opponent?.id) return game;
      return {
        ...game,
        friend_request_status: relationByOpponent.get(game.opponent.id) ?? "none",
      };
    });
  }

  const { data: badgesRows } = await admin
    .from("badges")
    .select("id, name, description, icon, category")
    .order("name", { ascending: true });

  const { data: earnedBadgeRows } = await admin
    .from("user_badges")
    .select("badge_id, earned_at")
    .eq("user_id", user.id);

  const earnedAtByBadgeId = new Map(
    (earnedBadgeRows ?? []).map((row) => [row.badge_id as string, row.earned_at as string])
  );

  badges = ((badgesRows ?? []) as Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    category: "wins" | "social" | "special";
  }>).map((badge) => ({
    id: badge.id,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    category: badge.category,
    earned_at: earnedAtByBadgeId.get(badge.id) ?? null,
  }));

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email ?? "",
    username: profile.username,
    avatar_url:
      profile.avatar_url ??
      (user.user_metadata?.avatar_url as string | null) ??
      (user.user_metadata?.picture as string | null) ??
      null,
    elo_rating: (profile.elo_rating as number | undefined) ?? 1200,
    country: (profile.country as string | null | undefined) ?? null,
  };

  return (
    <>
      <Navbar currentUser={currentUser} />
      <ProfileClient
        profile={profile as {
          id: string;
          username: string;
          avatar_url: string | null;
          created_at: string;
          elo_rating: number;
          country: string | null;
          city: string | null;
          continent: string | null;
        }}
        stats={stats}
        recentGames={recentGames}
        badges={badges}
        email={user.email ?? ""}
        isOwnProfile
      />
    </>
  );
}
