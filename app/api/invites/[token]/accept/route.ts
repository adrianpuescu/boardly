import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: { token: string };
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { token } = params;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // ── Fetch invite ───────────────────────────────────────────────────────────
  const { data: invite } = await adminClient
    .from("invites")
    .select("id, game_id, inviter_id, status, expires_at")
    .eq("token", token)
    .single();

  if (!invite) {
    return NextResponse.json(
      { error: "Invite not found" },
      { status: 404 }
    );
  }

  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: "This invite has already been used" },
      { status: 409 }
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "This invite has expired" },
      { status: 410 }
    );
  }

  // ── Prevent the inviter from accepting their own invite ───────────────────
  if (invite.inviter_id === user.id) {
    return NextResponse.json(
      { error: "You cannot join your own game via invite" },
      { status: 400 }
    );
  }

  // ── Check if user is already a player ─────────────────────────────────────
  const { data: existingPlayer } = await adminClient
    .from("game_players")
    .select("user_id")
    .eq("game_id", invite.game_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingPlayer) {
    // Already in — just return the game ID so the client can redirect.
    return NextResponse.json({ gameId: invite.game_id });
  }

  // ── Check if the black slot is still open ─────────────────────────────────
  const { data: blackPlayer } = await adminClient
    .from("game_players")
    .select("user_id")
    .eq("game_id", invite.game_id)
    .eq("color", "black")
    .maybeSingle();

  if (blackPlayer) {
    return NextResponse.json(
      { error: "This game is already full" },
      { status: 409 }
    );
  }

  // ── Add user as black ──────────────────────────────────────────────────────
  const { error: addPlayerError } = await adminClient
    .from("game_players")
    .insert({ game_id: invite.game_id, user_id: user.id, color: "black" });

  if (addPlayerError) {
    console.error("game_players insert (accepter) error:", addPlayerError);
    return NextResponse.json(
      { error: "Failed to join game" },
      { status: 500 }
    );
  }

  // ── Activate game & mark invite accepted ──────────────────────────────────
  await Promise.all([
    adminClient
      .from("games")
      .update({ status: "active" })
      .eq("id", invite.game_id),
    adminClient
      .from("invites")
      .update({ status: "accepted" })
      .eq("id", invite.id),
  ]);

  return NextResponse.json({ gameId: invite.game_id }, { status: 200 });
}
