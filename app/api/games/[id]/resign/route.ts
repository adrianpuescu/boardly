import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { gameOverEmail } from "@/lib/emails/your-turn";
import { awardGameCompletedBadgesForPlayers } from "@/lib/badges/checkBadges";

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
      `id, status, state, game_players ( user_id, color )`
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

  const playerRow = players.find((p) => p.user_id === user.id);
  if (!playerRow) {
    return NextResponse.json(
      { error: "You are not a player in this game" },
      { status: 403 }
    );
  }

  const opponentRow = players.find((p) => p.user_id !== user.id);
  const winnerId = opponentRow?.user_id ?? null;

  const currentState = (game.state ?? {}) as Record<string, unknown>;

  const { error: updateError } = await adminClient
    .from("games")
    .update({
      status: "completed",
      winner_id: winnerId,
      state: { ...currentState, result: "resignation" },
    })
    .eq("id", gameId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to resign: " + updateError.message },
      { status: 500 }
    );
  }

  const resignState = currentState as { vs_bot?: boolean; bot_user_id?: string };
  const resignBotUid =
    typeof resignState.bot_user_id === "string"
      ? resignState.bot_user_id
      : undefined;

  await awardGameCompletedBadgesForPlayers({
    winnerId,
    botUserId: resignBotUid ?? null,
    players,
  });

  if (opponentRow?.user_id) {
    const { data: currentUserRecord } = await adminClient
      .from("users")
      .select("username")
      .eq("id", user.id)
      .single();

    const currentUsername = currentUserRecord?.username ?? "Your opponent";
    const { error: notificationError } = await adminClient
      .from("notifications")
      .insert({
        user_id: opponentRow.user_id,
        type: "game_over",
        payload: {
          game_id: gameId,
          opponent_name: currentUsername,
          result: "resignation",
        },
      });

    if (notificationError) {
      console.error("[resign] notification insert error:", notificationError);
    }
  }

  // Fire-and-forget email to opponent
  if (opponentRow) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const gameUrl = `${appUrl}/game/${gameId}`;

    void (async () => {
      try {
        const { data: currentUserRecord } = await adminClient
          .from("users")
          .select("username")
          .eq("id", user.id)
          .single();

        const currentUsername = currentUserRecord?.username ?? "Your opponent";

        const { data: opponentAuthUser } = await adminClient.auth.admin.getUserById(
          opponentRow.user_id
        );
        const opponentEmail = opponentAuthUser?.user?.email;
        if (!opponentEmail) return;

        await sendEmail({
          to: opponentEmail,
          subject: `${currentUsername} resigned — You won! 🏆`,
          html: gameOverEmail({
            opponentName: currentUsername,
            result: "checkmate",
            didWin: true,
            gameUrl,
          }),
        });
      } catch (err) {
        console.error("[resign] email error:", err);
      }
    })();
  }

  return NextResponse.json({ success: true, winnerId });
}
