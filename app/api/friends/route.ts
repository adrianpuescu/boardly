import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined" | "blocked";
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  username: string;
  avatar_url: string | null;
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includePending = request.nextUrl.searchParams.get("includePending") === "1";

  const { data: rows, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at, updated_at")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .in("status", includePending ? ["accepted", "pending"] : ["accepted"])
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const friendships = (rows ?? []) as FriendshipRow[];
  const userIds = Array.from(
    new Set(
      friendships.flatMap((row) => [row.requester_id, row.addressee_id])
    )
  );

  let usersMap = new Map<string, UserRow>();
  if (userIds.length > 0) {
    const { data: usersRows, error: usersError } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .in("id", userIds);

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    usersMap = new Map(
      ((usersRows ?? []) as UserRow[]).map((u) => [u.id, u])
    );
  }

  const accepted = friendships
    .filter((row) => row.status === "accepted")
    .map((row) => {
      const friendId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
      const friend = usersMap.get(friendId);
      return {
        friendshipId: row.id,
        id: friendId,
        username: friend?.username ?? "Unknown",
        avatar_url: friend?.avatar_url ?? null,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

  if (!includePending) {
    return NextResponse.json({ friends: accepted });
  }

  const incoming = friendships
    .filter((row) => row.status === "pending" && row.addressee_id === user.id)
    .map((row) => {
      const requester = usersMap.get(row.requester_id);
      return {
        friendshipId: row.id,
        requester_id: row.requester_id,
        username: requester?.username ?? "Unknown",
        avatar_url: requester?.avatar_url ?? null,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

  const outgoing = friendships
    .filter((row) => row.status === "pending" && row.requester_id === user.id)
    .map((row) => {
      const addressee = usersMap.get(row.addressee_id);
      return {
        friendshipId: row.id,
        addressee_id: row.addressee_id,
        username: addressee?.username ?? "Unknown",
        avatar_url: addressee?.avatar_url ?? null,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

  return NextResponse.json({ friends: accepted, incoming, outgoing });
}
