import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { gameOverEmail } from "@/lib/emails/your-turn";
import { awardGameCompletedBadgesForPlayers } from "@/lib/badges/checkBadges";

// ── POST /api/moves/[id]/timeout ────────────────────────────────────────────
export async function POST(
  _request: NextRequest,
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

  const { data: game } = await adminClient
    .from("games")
    .select(
      `
      id, status, state, time_control,
      game_players ( user_id, color )
    `
    )
    .eq("id", gameId)
    .single();

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status === "completed" || game.status === "abandoned") {
    return NextResponse.json({ error: "Game is already over" }, { status: 400 });
  }

  const players = (game.game_players ?? []) as Array<{
    user_id: string;
    color: string;
  }>;

  // Caller must be a participant
  if (!players.find((p) => p.user_id === user.id)) {
    return NextResponse.json({ error: "Not a player in this game" }, { status: 403 });
  }

  const timeControl = game.time_control as { type: string; minutes?: number } | null;
  if (!timeControl || timeControl.type === "unlimited") {
    return NextResponse.json({ error: "This game has no time control" }, { status: 400 });
  }

  const state = game.state as {
    turn?: string;
    turn_started_at?: string;
    white_time_ms?: number;
    black_time_ms?: number;
  };

  if (!state.turn_started_at) {
    return NextResponse.json({ error: "No turn in progress" }, { status: 400 });
  }

  const now = Date.now();
  const turnStartedAt = new Date(state.turn_started_at).getTime();
  const elapsed = now - turnStartedAt;

  // Determine whose turn it is and how much time they had left
  const loserColor = state.turn as "white" | "black" | undefined;
  if (!loserColor) {
    return NextResponse.json({ error: "Invalid game state" }, { status: 400 });
  }

  let hasExpired = false;
  if (timeControl.type === "per_turn") {
    const totalMs = (timeControl.minutes ?? 1) * 60 * 1000;
    hasExpired = elapsed >= totalMs;
  } else if (timeControl.type === "per_game") {
    const totalMs = (timeControl.minutes ?? 10) * 60 * 1000;
    const remainingMs =
      loserColor === "white"
        ? (state.white_time_ms ?? totalMs)
        : (state.black_time_ms ?? totalMs);
    hasExpired = elapsed >= remainingMs;
  }

  if (!hasExpired) {
    return NextResponse.json({ error: "Timer has not expired yet" }, { status: 400 });
  }

  // Find winner (opponent of the player who timed out)
  const loserRow = players.find((p) => p.color === loserColor);
  const winnerRow = players.find((p) => p.color !== loserColor);

  if (!loserRow || !winnerRow) {
    return NextResponse.json({ error: "Could not resolve players" }, { status: 400 });
  }

  const { error: updateError } = await adminClient
    .from("games")
    .update({
      status: "completed",
      winner_id: winnerRow.user_id,
      state: { ...game.state, result: "timeout" },
    })
    .eq("id", gameId);

  if (updateError) {
    console.error("[timeout] games update error:", updateError);
    return NextResponse.json({ error: "Failed to end game" }, { status: 500 });
  }

  const timeoutState = game.state as { vs_bot?: boolean; bot_user_id?: string };
  const timeoutBotUid =
    typeof timeoutState.bot_user_id === "string" ? timeoutState.bot_user_id : null;

  await awardGameCompletedBadgesForPlayers({
    winnerId: winnerRow.user_id,
    botUserId: timeoutBotUid,
    players,
  });

  // Fire-and-forget email to the winner
  void (async () => {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const gameUrl = `${appUrl}/game/${gameId}`;

      const { data: loserAuthUser } = await adminClient.auth.admin.getUserById(
        loserRow.user_id
      );
      const { data: winnerAuthUser } = await adminClient.auth.admin.getUserById(
        winnerRow.user_id
      );
      const winnerEmail = winnerAuthUser?.user?.email;
      const loserUsername =
        (
          await adminClient
            .from("users")
            .select("username")
            .eq("id", loserRow.user_id)
            .single()
        ).data?.username ?? loserAuthUser?.user?.email ?? "Your opponent";

      if (winnerEmail) {
        await sendEmail({
          to: winnerEmail,
          subject: "You won! Your opponent ran out of time — Boardly ⏰",
          html: gameOverEmail({
            opponentName: loserUsername,
            result: "checkmate",
            didWin: true,
            gameUrl,
          }),
        });
      }
    } catch (err) {
      console.error("[timeout] email error:", err);
    }
  })();

  return NextResponse.json({
    success: true,
    result: "timeout",
    winnerId: winnerRow.user_id,
    loserId: loserRow.user_id,
  });
}
