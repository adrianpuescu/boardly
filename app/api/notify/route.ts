import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { yourTurnEmail, gameOverEmail } from "@/lib/emails/your-turn";

const bodySchema = z.object({
  gameId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(["your_turn", "game_over", "invite"]),
  // Optional extra context for game_over notifications
  result: z.enum(["checkmate", "stalemate", "draw"]).optional(),
  winnerId: z.string().uuid().nullable().optional(),
  opponentName: z.string().optional(),
});

// ── POST /api/notify ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Require the caller to be authenticated
  const supabase = createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { gameId, userId, type, result, winnerId, opponentName } = parsed.data;

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const gameUrl = `${appUrl}/game/${gameId}`;

  // Look up the target user's email via the admin auth API
  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authData?.user?.email) {
    return NextResponse.json({ sent: false, reason: "user_not_found" });
  }

  const toEmail = authData.user.email;

  // Resolve the opponent display name if not supplied
  let resolvedOpponentName = opponentName ?? "Your opponent";
  if (!opponentName) {
    const { data: profile } = await admin
      .from("users")
      .select("username")
      .eq("id", caller.id)
      .single();
    if (profile?.username) resolvedOpponentName = profile.username;
  }

  try {
    switch (type) {
      case "your_turn": {
        await sendEmail({
          to: toEmail,
          subject: "It's your turn in Boardly! ♟️",
          html: yourTurnEmail({ opponentName: resolvedOpponentName, gameUrl }),
        });
        break;
      }

      case "game_over": {
        const gameResult = result ?? "draw";
        const didWin = winnerId != null && winnerId === userId;

        await sendEmail({
          to: toEmail,
          subject: didWin
            ? "You won your Boardly game! 🏆"
            : gameResult === "checkmate"
            ? `${resolvedOpponentName} checkmated you — Boardly`
            : `Game over — ${gameResult} — Boardly`,
          html: gameOverEmail({
            opponentName: resolvedOpponentName,
            result: gameResult,
            didWin,
            gameUrl,
          }),
        });
        break;
      }

      case "invite": {
        await sendEmail({
          to: toEmail,
          subject: `${resolvedOpponentName} challenged you to a game of chess! ♟️`,
          html: yourTurnEmail({ opponentName: resolvedOpponentName, gameUrl }),
        });
        break;
      }
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("[notify POST] sendEmail failed:", err);
    return NextResponse.json({ sent: false, reason: "send_failed" }, { status: 500 });
  }
}
