import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface FriendshipRow {
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined" | "blocked";
}

interface OpponentRow {
  user_id: string;
  joined_at: string;
}

interface UserRow {
  id: string;
  username: string;
  avatar_url: string | null;
}

export async function GET() {
  const supabase = createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: myGameRows, error: myGamesError } = await admin
    .from("game_players")
    .select("game_id")
    .eq("user_id", user.id);

  if (myGamesError) {
    return NextResponse.json({ error: myGamesError.message }, { status: 500 });
  }

  const gameIds = (myGameRows ?? []).map((row) => row.game_id);
  if (gameIds.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const { data: opponentRowsRaw, error: opponentsError } = await admin
    .from("game_players")
    .select("user_id, joined_at")
    .in("game_id", gameIds)
    .neq("user_id", user.id)
    .order("joined_at", { ascending: false });

  if (opponentsError) {
    return NextResponse.json({ error: opponentsError.message }, { status: 500 });
  }

  const opponentRows = (opponentRowsRaw ?? []) as OpponentRow[];
  const orderedUniqueOpponentIds: string[] = [];
  const seen = new Set<string>();
  for (const row of opponentRows) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    orderedUniqueOpponentIds.push(row.user_id);
  }

  if (orderedUniqueOpponentIds.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const { data: friendshipRowsRaw, error: friendshipsError } = await admin
    .from("friendships")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .in("status", ["accepted", "pending"]);

  if (friendshipsError) {
    return NextResponse.json({ error: friendshipsError.message }, { status: 500 });
  }

  const blockedIds = new Set<string>();
  for (const friendship of (friendshipRowsRaw ?? []) as FriendshipRow[]) {
    if (friendship.requester_id === user.id) {
      blockedIds.add(friendship.addressee_id);
    } else {
      blockedIds.add(friendship.requester_id);
    }
  }

  const candidateIds = orderedUniqueOpponentIds
    .filter((id) => id !== user.id && !blockedIds.has(id))
    .slice(0, 30);

  if (candidateIds.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const { data: usersRows, error: usersError } = await admin
    .from("users")
    .select("id, username, avatar_url")
    .in("id", candidateIds);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const usersMap = new Map<string, UserRow>(
    ((usersRows ?? []) as UserRow[]).map((row) => [row.id, row])
  );

  const suggestions = candidateIds
    .map((id) => usersMap.get(id))
    .filter((u): u is UserRow => !!u)
    .slice(0, 10);

  return NextResponse.json({ suggestions });
}
