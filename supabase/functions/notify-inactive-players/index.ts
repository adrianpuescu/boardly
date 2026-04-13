// Supabase Edge Function: notify-inactive-players
// Triggered every 30 minutes via Supabase cron (or HTTP).
// Sends "your turn" emails only when a player has been inactive for 30+ minutes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://boardly.app";

const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const UNLIMITED_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours for unlimited games

interface GamePlayer {
  user_id: string;
  color: string;
}

interface GameRow {
  id: string;
  time_control: { type: string; minutes?: number };
  state: { turn?: string };
  last_move_at: string;
  game_players: GamePlayer[];
}

async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Boardly <onboarding@resend.dev>",
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
  return res.json();
}

function buildYourTurnEmail(opponentName: string, gameUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>It's your turn in Boardly!</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;max-width:560px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a2f 0%,#0f2318 100%);padding:32px 40px;text-align:center;">
              <span style="font-size:40px;">♟️</span>
              <h1 style="margin:12px 0 4px;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Boardly</h1>
              <p style="margin:0;color:#6b7280;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Chess Reimagined</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#ffffff;font-size:22px;font-weight:600;">Still your turn! ♟️</h2>
              <p style="margin:0 0 24px;color:#9ca3af;font-size:15px;line-height:1.6;">
                <strong style="color:#d1d5db;">${opponentName}</strong> is waiting for your move.
                It's been a while — head back to the board!
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#16a34a;border-radius:8px;">
                    <a href="${gameUrl}"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.2px;">
                      Make your move →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
                Or copy this link into your browser:<br/>
                <a href="${gameUrl}" style="color:#4ade80;word-break:break-all;">${gameUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #2a2a2a;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:12px;">
                You're receiving this because you have an active game on Boardly.<br/>
                Good luck out there! 🎯
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function processNotifications(): Promise<{ notified: number; skipped: number; errors: number }> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const now = Date.now();
  const cutoff30m = new Date(now - INACTIVITY_THRESHOLD_MS).toISOString();
  const cutoff24h = new Date(now - UNLIMITED_THRESHOLD_MS).toISOString();

  // Find active games whose last move was made 30+ minutes ago.
  // We join the latest move per game via a subquery-style approach.
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
    throw new Error(`Failed to fetch games: ${gamesError.message}`);
  }

  let notified = 0;
  let skipped = 0;
  let errors = 0;

  for (const game of (games ?? []) as GameRow[]) {
    try {
      // Fetch the latest move for this game
      const { data: latestMoves } = await admin
        .from("moves")
        .select("created_at, user_id")
        .eq("game_id", game.id)
        .order("move_number", { ascending: false })
        .limit(1);

      const latestMove = latestMoves?.[0];
      if (!latestMove) {
        // No moves yet — game just started, skip
        skipped++;
        continue;
      }

      const lastMoveAt = new Date(latestMove.created_at).getTime();
      const elapsed = now - lastMoveAt;
      const timeControlType = game.time_control?.type ?? "unlimited";

      // For unlimited games, only notify after 24h of inactivity (avoid spam)
      if (timeControlType === "unlimited") {
        if (elapsed < UNLIMITED_THRESHOLD_MS) {
          skipped++;
          continue;
        }
      } else {
        // For all other time controls, use the 30-minute threshold
        if (elapsed < INACTIVITY_THRESHOLD_MS) {
          skipped++;
          continue;
        }
      }

      // Determine whose turn it is
      const turnColor: string = game.state?.turn ?? "white";
      const players = game.game_players ?? [];
      const waitingPlayer = players.find((p) => p.color === turnColor);
      if (!waitingPlayer) {
        skipped++;
        continue;
      }

      // The player who last moved is the opponent (for the email copy)
      const moverPlayer = players.find((p) => p.user_id === latestMove.user_id);
      const waitingUserId = waitingPlayer.user_id;

      // Check if we already sent a notification for this exact turn.
      // We key on game_id + the last move's user_id (i.e., the opponent who moved),
      // stored as payload so we can detect "same turn" duplicates.
      const { data: existingNotif } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", waitingUserId)
        .eq("type", "your_turn")
        .contains("payload", { game_id: game.id, last_mover_id: latestMove.user_id })
        .limit(1);

      if (existingNotif && existingNotif.length > 0) {
        // Already notified for this turn
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
      const opponentUserId = moverPlayer?.user_id ?? latestMove.user_id;
      const { data: opponentProfile } = await admin
        .from("users")
        .select("username")
        .eq("id", opponentUserId)
        .single();
      const opponentName = opponentProfile?.username ?? "Your opponent";

      const gameUrl = `${APP_URL}/game/${game.id}`;

      await sendResendEmail({
        to: waitingEmail,
        subject: `Still your turn in Boardly! ♟️`,
        html: buildYourTurnEmail(opponentName, gameUrl),
      });

      // Record the notification to prevent duplicates
      await admin.from("notifications").insert({
        user_id: waitingUserId,
        type: "your_turn",
        payload: {
          game_id: game.id,
          last_mover_id: latestMove.user_id,
        },
      });

      notified++;
    } catch (err) {
      console.error(`[notify] Error processing game ${game.id}:`, err);
      errors++;
    }
  }

  return { notified, skipped, errors };
}

Deno.serve(async (req: Request) => {
  // Allow Supabase scheduled invocations (no auth header) and manual HTTP calls.
  // For manual HTTP calls, optionally protect with CRON_SECRET.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const result = await processNotifications();
    console.log("[notify-inactive-players] Done:", result);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[notify-inactive-players] Fatal error:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
