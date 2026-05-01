import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { INITIAL_FEN } from "@/lib/chess/squareHighlight";
import { getOrCreateBoardlyBotUser } from "@/lib/chess/boardlyBot";

const bodySchema = z.object({
  originalGameId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
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

  const { originalGameId } = parsed.data;
  const adminClient = createAdminClient();

  const { data: game, error: gameError } = await adminClient
    .from("games")
    .select(`id, status, time_control, state, game_players ( user_id, color )`)
    .eq("id", originalGameId)
    .single();

  if (gameError || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "completed" && game.status !== "abandoned") {
    return NextResponse.json(
      { error: "Only finished games can be rematched" },
      { status: 400 }
    );
  }

  const players = (game.game_players ?? []) as Array<{
    user_id: string;
    color: string;
  }>;

  if (players.length !== 2) {
    return NextResponse.json(
      { error: "Rematch requires two players in the original game" },
      { status: 400 }
    );
  }

  if (!players.some((p) => p.user_id === user.id)) {
    return NextResponse.json(
      { error: "You are not a player in this game" },
      { status: 403 }
    );
  }

  const white = players.find((p) => p.color === "white");
  const black = players.find((p) => p.color === "black");
  if (!white || !black) {
    return NextResponse.json({ error: "Invalid player colors" }, { status: 400 });
  }

  const rawState = game.state as {
    vs_bot?: boolean;
    bot_difficulty?: number;
    bot_user_id?: string;
  };

  const timeControl = game.time_control as Record<string, unknown>;

  // ── Vs bot rematch: same difficulty, human vs bot (human white, bot black) ──
  if (rawState?.vs_bot) {
    const botUidFromState =
      typeof rawState.bot_user_id === "string"
        ? rawState.bot_user_id
        : players.find((p) => p.user_id !== user.id)?.user_id ?? null;
    if (!botUidFromState || botUidFromState === user.id) {
      return NextResponse.json({ error: "Invalid bot rematch request" }, { status: 400 });
    }

    let botUserId: string;
    try {
      botUserId = await getOrCreateBoardlyBotUser(adminClient);
    } catch (e) {
      console.error("[rematch] bot user:", e);
      return NextResponse.json({ error: "Failed to set up bot opponent" }, { status: 500 });
    }

    const difficulty =
      typeof rawState.bot_difficulty === "number"
        ? Math.min(20, Math.max(1, rawState.bot_difficulty))
        : 10;

    const { data: newBotGame, error: botInsertErr } = await adminClient
      .from("games")
      .insert({
        game_type: "chess",
        status: "active",
        state: {
          fen: INITIAL_FEN,
          turn: "white",
          vs_bot: true,
          bot_difficulty: difficulty,
          bot_user_id: botUserId,
        },
        time_control: timeControl,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (botInsertErr || !newBotGame) {
      console.error("rematch games insert error (vs bot):", botInsertErr);
      return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
    }

    const newGameId = newBotGame.id as string;

    const { error: humanErr } = await adminClient.from("game_players").insert({
      game_id: newGameId,
      user_id: user.id,
      color: "white",
    });

    if (humanErr) {
      console.error("rematch game_players (human vs bot):", humanErr);
      await adminClient.from("games").delete().eq("id", newGameId);
      return NextResponse.json(
        { error: "Failed to add players to rematch" },
        { status: 500 }
      );
    }

    const { error: botPlayerErr } = await adminClient.from("game_players").insert({
      game_id: newGameId,
      user_id: botUserId,
      color: "black",
    });

    if (botPlayerErr) {
      console.error("rematch game_players (bot):", botPlayerErr);
      await adminClient.from("games").delete().eq("id", newGameId);
      return NextResponse.json(
        { error: "Failed to add players to rematch" },
        { status: 500 }
      );
    }

    return NextResponse.json({ gameId: newGameId }, { status: 201 });
  }

  // Swap colors: previous white → black, previous black → white
  const { data: newGame, error: insertGameError } = await adminClient
    .from("games")
    .insert({
      game_type: "chess",
      status: "active",
      state: { fen: INITIAL_FEN, turn: "white" },
      time_control: timeControl,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertGameError || !newGame) {
    console.error("rematch games insert error:", insertGameError);
    return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
  }

  const gameId = newGame.id as string;

  const { error: p1Error } = await adminClient.from("game_players").insert({
    game_id: gameId,
    user_id: black.user_id,
    color: "white",
  });

  if (p1Error) {
    console.error("rematch game_players (white) error:", p1Error);
    await adminClient.from("games").delete().eq("id", gameId);
    return NextResponse.json(
      { error: "Failed to add players to rematch" },
      { status: 500 }
    );
  }

  const { error: p2Error } = await adminClient.from("game_players").insert({
    game_id: gameId,
    user_id: white.user_id,
    color: "black",
  });

  if (p2Error) {
    console.error("rematch game_players (black) error:", p2Error);
    await adminClient.from("games").delete().eq("id", gameId);
    return NextResponse.json(
      { error: "Failed to add players to rematch" },
      { status: 500 }
    );
  }

  return NextResponse.json({ gameId }, { status: 201 });
}
