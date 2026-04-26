import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RankingType = "global" | "friends" | "country";

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
}

function toRankingType(value: string | null): RankingType {
  if (value === "friends" || value === "country") return value;
  return "global";
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
    .select("id, country")
    .eq("id", user.id)
    .maybeSingle();

  if (!me) {
    return NextResponse.json({ error: "Current user not found" }, { status: 404 });
  }

  let query = admin
    .from("users")
    .select("id, username, avatar_url, elo_rating, country, city, continent")
    .order("elo_rating", { ascending: false })
    .limit(50);

  if (type === "country") {
    if (!me.country) {
      return NextResponse.json({ players: [] });
    }
    query = query.eq("country", me.country);
  } else if (type === "friends") {
    const { data: friendships } = await admin
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq("status", "accepted");

    const friendIds = new Set<string>([user.id]);
    for (const row of friendships ?? []) {
      const friendId =
        row.requester_id === user.id ? row.addressee_id : row.requester_id;
      friendIds.add(friendId as string);
    }

    query = query.in("id", Array.from(friendIds));
  }

  const { data: users, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (users ?? []).map((row) => row.id as string);
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
  const completedGamesById = new Map<string, string | null>();
  if (playedGameIds.length > 0) {
    const { data: games } = await admin
      .from("games")
      .select("id, status, winner_id")
      .in("id", playedGameIds)
      .eq("status", "completed");

    for (const game of games ?? []) {
      completedGamesById.set(game.id as string, (game.winner_id as string | null) ?? null);
    }
  }

  const statsByUserId = new Map<string, { gamesPlayed: number; wins: number }>();
  for (const userId of ids) {
    statsByUserId.set(userId, { gamesPlayed: 0, wins: 0 });
  }

  gameIdToUsers.forEach((participantIds, gameId) => {
    if (!completedGamesById.has(gameId)) return;
    const winnerId = completedGamesById.get(gameId);

    for (const userId of participantIds) {
      const stats = statsByUserId.get(userId);
      if (!stats) continue;
      stats.gamesPlayed += 1;
      if (winnerId && winnerId === userId) {
        stats.wins += 1;
      }
    }
  });

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
    };
  });

  return NextResponse.json({ players });
}
