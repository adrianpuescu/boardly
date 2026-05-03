import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { awardGameCompletedBadgesForPlayers } from "@/lib/badges/checkBadges";

const bodySchema = z.object({
  action: z.enum(["offer", "accept", "decline"]),
});

function omitDrawOffer(state: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...state };
  delete next["draw_offered_by"];
  return next;
}

export async function POST(
  request: NextRequest,
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

  const { action } = parsed.data;

  const adminClient = createAdminClient();

  const { data: game } = await adminClient
    .from("games")
    .select(`id, status, state, game_players ( user_id, color )`)
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

  const currentState = (game.state ?? {}) as Record<string, unknown>;

  if (action === "offer") {
    const vsBot = !!(currentState as { vs_bot?: boolean }).vs_bot;

    /** Bot games: resolve accept/decline in one DB write — no interim draw_offered_by (avoids realtime races). */
    if (vsBot) {
      const botDifficulty =
        typeof (currentState as { bot_difficulty?: number }).bot_difficulty ===
        "number"
          ? (currentState as { bot_difficulty?: number }).bot_difficulty!
          : 10;
      /** Medium (8+) and Hard (15): always accept; Beginner/Easy: 50%. */
      const botAccepts = botDifficulty >= 8 || Math.random() < 0.5;

      if (!botAccepts) {
        return NextResponse.json({
          success: true,
          action: "offer",
          botResponse: "declined",
          drawCompleted: false,
        });
      }

      const stateWithoutOffer = omitDrawOffer(currentState);

      const { error: completeError } = await adminClient
        .from("games")
        .update({
          status: "completed",
          winner_id: null,
          state: { ...stateWithoutOffer, result: "draw" },
        })
        .eq("id", gameId);

      if (completeError) {
        return NextResponse.json({ error: completeError.message }, { status: 500 });
      }

      const drawState = stateWithoutOffer as {
        vs_bot?: boolean;
        bot_user_id?: string;
      };
      const drawBotUid =
        typeof drawState.bot_user_id === "string" ? drawState.bot_user_id : null;

      const newBadges = await awardGameCompletedBadgesForPlayers({
        winnerId: null,
        botUserId: drawBotUid,
        players,
      });

      return NextResponse.json({
        success: true,
        action: "offer",
        botResponse: "accepted",
        drawCompleted: true,
        newBadges,
      });
    }

    const offeredState = { ...currentState, draw_offered_by: user.id };
    const { error } = await adminClient
      .from("games")
      .update({
        state: offeredState,
      })
      .eq("id", gameId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action: "offer",
      drawCompleted: false,
    });
  }

  if (action === "decline") {
    const stateWithoutOffer = omitDrawOffer(currentState);
    const { error } = await adminClient
      .from("games")
      .update({ state: stateWithoutOffer })
      .eq("id", gameId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: "decline" });
  }

  // action === "accept"
  const drawOfferedBy = (currentState as { draw_offered_by?: string }).draw_offered_by;
  if (!drawOfferedBy || drawOfferedBy === user.id) {
    return NextResponse.json(
      { error: "No draw offer from opponent to accept" },
      { status: 400 }
    );
  }

  const stateWithoutOffer = omitDrawOffer(currentState);

  const { error } = await adminClient
    .from("games")
    .update({
      status: "completed",
      winner_id: null,
      state: { ...stateWithoutOffer, result: "draw" },
    })
    .eq("id", gameId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const drawState = stateWithoutOffer as { vs_bot?: boolean; bot_user_id?: string };
  const drawBotUid =
    typeof drawState.bot_user_id === "string" ? drawState.bot_user_id : null;

  const newBadges = await awardGameCompletedBadgesForPlayers({
    winnerId: null,
    botUserId: drawBotUid,
    players,
  });

  return NextResponse.json({ success: true, action: "accept", newBadges });
}
