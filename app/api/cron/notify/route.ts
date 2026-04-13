// GET /api/cron/notify
// Vercel Cron fallback — runs the same "notify inactive players" logic as the
// Supabase Edge Function. Protected by CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { yourTurnEmail } from "@/lib/emails/your-turn";

const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const UNLIMITED_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours for unlimited games

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify the cron secret to prevent unauthorised invocations.
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  let notified = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Fetch all active games with their players
    const { data: games, error: gamesError } = await admin
      .from("games")
      .select(`
        id,
        time_control,
        state,
        game_players ( user_id, color )
      `)
      .eq("status", "active");

    if (gamesError) {
      console.error("[cron/notify] Failed to fetch games:", gamesError);
      return NextResponse.json({ error: gamesError.message }, { status: 500 });
    }

    for (const game of games ?? []) {
      try {
        const gameId = game.id as string;
        const timeControl = game.time_control as { type: string; minutes?: number } | null;
        const state = game.state as { turn?: string } | null;
        const players = (game.game_players ?? []) as Array<{ user_id: string; color: string }>;

        // Fetch the most recent move for this game
        const { data: latestMoves } = await admin
          .from("moves")
          .select("created_at, user_id")
          .eq("game_id", gameId)
          .order("move_number", { ascending: false })
          .limit(1);

        const latestMove = latestMoves?.[0];
        if (!latestMove) {
          skipped++;
          continue;
        }

        const elapsed = now - new Date(latestMove.created_at as string).getTime();
        const timeControlType = timeControl?.type ?? "unlimited";

        // Apply appropriate inactivity threshold per time-control type
        const threshold =
          timeControlType === "unlimited" ? UNLIMITED_THRESHOLD_MS : INACTIVITY_THRESHOLD_MS;

        if (elapsed < threshold) {
          skipped++;
          continue;
        }

        // Identify the player whose turn it is
        const turnColor: string = state?.turn ?? "white";
        const waitingPlayer = players.find((p) => p.color === turnColor);
        if (!waitingPlayer) {
          skipped++;
          continue;
        }

        const waitingUserId = waitingPlayer.user_id;

        // Dedup: skip if we already sent a notification for this exact turn
        const { data: existingNotif } = await admin
          .from("notifications")
          .select("id")
          .eq("user_id", waitingUserId)
          .eq("type", "your_turn")
          .contains("payload", { game_id: gameId, last_mover_id: latestMove.user_id })
          .limit(1);

        if (existingNotif && existingNotif.length > 0) {
          skipped++;
          continue;
        }

        // Fetch the waiting player's email
        const { data: authUserData } = await admin.auth.admin.getUserById(waitingUserId);
        const waitingEmail = authUserData?.user?.email;
        if (!waitingEmail) {
          skipped++;
          continue;
        }

        // Fetch the opponent's username for the email copy
        const opponentUserId = latestMove.user_id as string;
        const { data: opponentProfile } = await admin
          .from("users")
          .select("username")
          .eq("id", opponentUserId)
          .single();
        const opponentName = (opponentProfile?.username as string | null) ?? "Your opponent";

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://boardly.app";
        const gameUrl = `${appUrl}/game/${gameId}`;

        await sendEmail({
          to: waitingEmail,
          subject: `Still your turn in Boardly! ♟️`,
          html: yourTurnEmail({ opponentName, gameUrl }),
        });

        // Record the notification to prevent duplicate sends
        await admin.from("notifications").insert({
          user_id: waitingUserId,
          type: "your_turn",
          payload: {
            game_id: gameId,
            last_mover_id: opponentUserId,
          },
        });

        notified++;
      } catch (err) {
        console.error(`[cron/notify] Error processing game ${game.id}:`, err);
        errors++;
      }
    }

    console.log(`[cron/notify] Done — notified: ${notified}, skipped: ${skipped}, errors: ${errors}`);
    return NextResponse.json({ ok: true, notified, skipped, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/notify] Fatal error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
