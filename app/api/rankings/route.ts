import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ExtendedRankingType =
  | "global"
  | "friends"
  | "country"
  | "continent"
  | "win_streak"
  | "most_active"
  | "weekly"
  | "monthly";

interface RankingRow {
  id: string;
  username: string;
  avatar_url: string | null;
  elo_rating: number;
  country: string | null;
  city: string | null;
  continent: string | null;
  games_played: number;
  wins: number;
  win_rate: number;
  current_win_streak: number;
  games_last_30_days: number;
  weekly_elo_gain: number;
  monthly_elo_gain: number;
}

interface UserSummary {
  id: string;
  username: string;
  avatar_url: string | null;
  elo_rating: number;
  country: string | null;
  city: string | null;
  continent: string | null;
}

function toRankingType(value: string | null): ExtendedRankingType {
  if (
    value === "friends" ||
    value === "country" ||
    value === "continent" ||
    value === "win_streak" ||
    value === "most_active" ||
    value === "weekly" ||
    value === "monthly"
  ) {
    return value;
  }
  return "global";
}

async function getFriendIds(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: friendships } = await admin
    .from("friendships")
    .select("requester_id, addressee_id")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq("status", "accepted");

  const friendIds = new Set<string>([userId]);
  for (const row of friendships ?? []) {
    const friendId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    friendIds.add(friendId as string);
  }

  return Array.from(friendIds);
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = toRankingType(request.nextUrl.searchParams.get("type"));
  const { data: me } = await admin
    .from("users")
    .select("id, country, continent")
    .eq("id", user.id)
    .maybeSingle();

  if (!me) {
    return NextResponse.json({ error: "Current user not found" }, { status: 404 });
  }

  const usersQuery = admin
    .from("users")
    .select("id, username, avatar_url, elo_rating, country, city, continent");

  let users: UserSummary[] = [];
  let queryError: string | null = null;

  if (type === "global") {
    const res = await usersQuery.order("elo_rating", { ascending: false }).limit(50);
    users = (res.data ?? []) as UserSummary[];
    queryError = res.error?.message ?? null;
  } else if (type === "country") {
    if (!me.country) return NextResponse.json({ players: [] });
    const res = await usersQuery
      .eq("country", me.country)
      .order("elo_rating", { ascending: false })
      .limit(50);
    users = (res.data ?? []) as UserSummary[];
    queryError = res.error?.message ?? null;
  } else if (type === "continent") {
    if (!me.continent) return NextResponse.json({ players: [] });
    const res = await usersQuery
      .eq("continent", me.continent)
      .order("elo_rating", { ascending: false })
      .limit(50);
    users = (res.data ?? []) as UserSummary[];
    queryError = res.error?.message ?? null;
  } else if (type === "friends") {
    const friendIds = await getFriendIds(admin, user.id);
    const res = await usersQuery
      .in("id", friendIds)
      .order("elo_rating", { ascending: false })
      .limit(50);
    users = (res.data ?? []) as UserSummary[];
    queryError = res.error?.message ?? null;
  } else {
    const res = await usersQuery;
    users = (res.data ?? []) as UserSummary[];
    queryError = res.error?.message ?? null;
  }

  if (queryError) {
    return NextResponse.json({ error: queryError }, { status: 500 });
  }

  const ids = users.map((row) => row.id);
  if (ids.length === 0) {
    return NextResponse.json({ players: [] });
  }

  const { data: playerRows } = await admin
    .from("game_players")
    .select("user_id, game_id")
    .in("user_id", ids);

  const gameIdToUsers = new Map<string, string[]>();
  for (const row of playerRows ?? []) {
    const gameId = row.game_id as string;
    const userId = row.user_id as string;
    const existing = gameIdToUsers.get(gameId) ?? [];
    existing.push(userId);
    gameIdToUsers.set(gameId, existing);
  }

  const playedGameIds = Array.from(gameIdToUsers.keys());
  const completedGamesById = new Map<string, { winnerId: string | null; updatedAt: string }>();
  const recent30GameIds = new Set<string>();
  if (playedGameIds.length > 0) {
    const cutoff30Iso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: games } = await admin
      .from("games")
      .select("id, status, winner_id, updated_at, created_at")
      .in("id", playedGameIds);

    for (const game of games ?? []) {
      const gameId = game.id as string;
      const createdAt = (game.created_at as string | null) ?? "";
      if (createdAt >= cutoff30Iso) {
        recent30GameIds.add(gameId);
      }
      if (game.status === "completed") {
        completedGamesById.set(gameId, {
          winnerId: (game.winner_id as string | null) ?? null,
          updatedAt: (game.updated_at as string) ?? createdAt,
        });
      }
    }
  }

  const statsByUserId = new Map<string, { gamesPlayed: number; wins: number }>();
  const completedResultsByUser = new Map<string, Array<{ won: boolean; updatedAt: string }>>();
  const gamesLast30ByUserId = new Map<string, number>();
  const weeklyEloGainByUserId = new Map<string, number>();
  const monthlyEloGainByUserId = new Map<string, number>();
  const currentWinStreakByUserId = new Map<string, number>();

  for (const userId of ids) {
    statsByUserId.set(userId, { gamesPlayed: 0, wins: 0 });
    completedResultsByUser.set(userId, []);
    gamesLast30ByUserId.set(userId, 0);
    weeklyEloGainByUserId.set(userId, 0);
    monthlyEloGainByUserId.set(userId, 0);
    currentWinStreakByUserId.set(userId, 0);
  }

  gameIdToUsers.forEach((participantIds, gameId) => {
    for (const userId of participantIds) {
      if (recent30GameIds.has(gameId)) {
        gamesLast30ByUserId.set(userId, (gamesLast30ByUserId.get(userId) ?? 0) + 1);
      }
    }

    if (!completedGamesById.has(gameId)) return;
    const completedMeta = completedGamesById.get(gameId);
    const winnerId = completedMeta?.winnerId ?? null;

    for (const userId of participantIds) {
      const stats = statsByUserId.get(userId);
      if (!stats) continue;
      stats.gamesPlayed += 1;
      if (winnerId && winnerId === userId) {
        stats.wins += 1;
      }

      const userResults = completedResultsByUser.get(userId) ?? [];
      userResults.push({
        won: Boolean(winnerId && winnerId === userId),
        updatedAt: completedMeta?.updatedAt ?? "",
      });
      completedResultsByUser.set(userId, userResults);
    }
  });

  const weekStartIso = new Date();
  weekStartIso.setDate(weekStartIso.getDate() - ((weekStartIso.getDay() + 6) % 7));
  weekStartIso.setHours(0, 0, 0, 0);
  const monthStartIso = new Date();
  monthStartIso.setDate(1);
  monthStartIso.setHours(0, 0, 0, 0);

  const { data: eloRows } = await admin
    .from("elo_history")
    .select("user_id, change, created_at")
    .in("user_id", ids)
    .gte("created_at", monthStartIso.toISOString());

  for (const row of eloRows ?? []) {
    const uid = row.user_id as string;
    const change = (row.change as number) ?? 0;
    const createdAt = row.created_at as string;
    monthlyEloGainByUserId.set(uid, (monthlyEloGainByUserId.get(uid) ?? 0) + change);
    if (createdAt >= weekStartIso.toISOString()) {
      weeklyEloGainByUserId.set(uid, (weeklyEloGainByUserId.get(uid) ?? 0) + change);
    }
  }

  for (const userId of ids) {
    const results = (completedResultsByUser.get(userId) ?? []).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    let streak = 0;
    for (const result of results) {
      if (result.won) streak += 1;
      else break;
    }
    currentWinStreakByUserId.set(userId, streak);
  }

  const players: RankingRow[] = (users ?? []).map((row) => {
    const userStats = statsByUserId.get(row.id as string) ?? { gamesPlayed: 0, wins: 0 };
    const winRate =
      userStats.gamesPlayed > 0
        ? Math.round((userStats.wins / userStats.gamesPlayed) * 100)
        : 0;

    return {
      id: row.id as string,
      username: row.username as string,
      avatar_url: (row.avatar_url as string | null) ?? null,
      elo_rating: (row.elo_rating as number) ?? 1200,
      country: (row.country as string | null) ?? null,
      city: (row.city as string | null) ?? null,
      continent: (row.continent as string | null) ?? null,
      games_played: userStats.gamesPlayed,
      wins: userStats.wins,
      win_rate: winRate,
      current_win_streak: currentWinStreakByUserId.get(row.id as string) ?? 0,
      games_last_30_days: gamesLast30ByUserId.get(row.id as string) ?? 0,
      weekly_elo_gain: weeklyEloGainByUserId.get(row.id as string) ?? 0,
      monthly_elo_gain: monthlyEloGainByUserId.get(row.id as string) ?? 0,
    };
  });
  const sortedPlayers = [...players].sort((a, b) => {
    if (type === "win_streak") {
      if (b.current_win_streak !== a.current_win_streak) {
        return b.current_win_streak - a.current_win_streak;
      }
      return b.elo_rating - a.elo_rating;
    }
    if (type === "most_active") {
      if (b.games_last_30_days !== a.games_last_30_days) {
        return b.games_last_30_days - a.games_last_30_days;
      }
      return b.elo_rating - a.elo_rating;
    }
    if (type === "weekly") {
      if (b.weekly_elo_gain !== a.weekly_elo_gain) {
        return b.weekly_elo_gain - a.weekly_elo_gain;
      }
      return b.elo_rating - a.elo_rating;
    }
    if (type === "monthly") {
      if (b.monthly_elo_gain !== a.monthly_elo_gain) {
        return b.monthly_elo_gain - a.monthly_elo_gain;
      }
      return b.elo_rating - a.elo_rating;
    }
    return b.elo_rating - a.elo_rating;
  });

  return NextResponse.json({ players: sortedPlayers.slice(0, 50) });
}
