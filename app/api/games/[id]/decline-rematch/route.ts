import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Abandon a rematch game that was created but never started (no moves).
 * Used when the opponent declines a rematch proposal.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const gameId = params.id;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: game, error: fetchErr } = await adminClient
    .from("games")
    .select(`id, status, game_players ( user_id )`)
    .eq("id", gameId)
    .single();

  if (fetchErr || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const players = (game.game_players ?? []) as { user_id: string }[];
  if (!players.some((p) => p.user_id === user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (game.status === "abandoned") {
    return NextResponse.json({ ok: true });
  }

  if (game.status !== "active" && game.status !== "waiting") {
    return NextResponse.json(
      { error: "Game cannot be cancelled" },
      { status: 400 }
    );
  }

  const { count } = await adminClient
    .from("moves")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Game already has moves" },
      { status: 400 }
    );
  }

  const { error: updateErr } = await adminClient
    .from("games")
    .update({ status: "abandoned" })
    .eq("id", gameId);

  if (updateErr) {
    console.error("decline-rematch update:", updateErr);
    return NextResponse.json({ error: "Failed to abandon game" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
