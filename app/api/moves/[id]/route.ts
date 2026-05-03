import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Chess } from "chess.js";
import type { Square, PieceSymbol } from "chess.js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { awardGameCompletedBadgesForPlayers } from "@/lib/badges/checkBadges";
import { calculateElo, getKFactor } from "@/lib/elo";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const bodySchema = z.object({
  from: z.string().min(2).max(2),
  to: z.string().min(2).max(2),
  promotion: z.string().length(1).optional(),
  /** Human submits the bot's ply through their session so moves stay validated server-side. */
  asBot: z.boolean().optional(),
});

async function updateEloAfterCompletedGame(params: {
  adminClient: ReturnType<typeof createAdminClient>;
  gameId: string;
  winnerId: string;
  loserId: string;
}) {
  const { adminClient, gameId, winnerId, loserId } = params;
  const participantIds = [winnerId, loserId];

  const { data: users, error: usersError } = await adminClient
    .from("users")
    .select("id, elo_rating")
    .in("id", participantIds);

  if (usersError || !users || users.length < 2) {
    throw new Error(usersError?.message ?? "Could not load users for ELO update");
  }

  const winner = users.find((row) => row.id === winnerId);
  const loser = users.find((row) => row.id === loserId);
  if (!winner || !loser) {
    throw new Error("Missing winner/loser profile for ELO update");
  }

  const [{ count: winnerGames }, { count: loserGames }] = await Promise.all([
    adminClient
      .from("elo_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", winnerId),
    adminClient
      .from("elo_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", loserId),
  ]);

  const winnerK = getKFactor(winnerGames ?? 0);
  const loserK = getKFactor(loserGames ?? 0);
  const effectiveK = Math.max(winnerK, loserK);

  const { newWinnerElo, newLoserElo } = calculateElo(
    winner.elo_rating ?? 1200,
    loser.elo_rating ?? 1200,
    effectiveK
  );

  const winnerChange = newWinnerElo - (winner.elo_rating ?? 1200);
  const loserChange = newLoserElo - (loser.elo_rating ?? 1200);

  const { error: updateUsersError } = await adminClient
    .from("users")
    .upsert(
      [
        { id: winnerId, elo_rating: newWinnerElo },
        { id: loserId, elo_rating: newLoserElo },
      ],
      { onConflict: "id" }
    );

  if (updateUsersError) {
    throw new Error(updateUsersError.message);
  }

  const { error: historyError } = await adminClient.from("elo_history").insert([
    {
      user_id: winnerId,
      game_id: gameId,
      elo_before: winner.elo_rating ?? 1200,
      elo_after: newWinnerElo,
      change: winnerChange,
    },
    {
      user_id: loserId,
      game_id: gameId,
      elo_before: loser.elo_rating ?? 1200,
      elo_after: newLoserElo,
      change: loserChange,
    },
  ]);

  if (historyError) {
    throw new Error(historyError.message);
  }
}

// ── POST /api/moves/[id] ────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gameId = params.id;

  // Auth — user-scoped client only for identity verification.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin client — used for ALL database operations.
  const adminClient = createAdminClient();

  // Validate body
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

  const { from, to, promotion = "q", asBot = false } = parsed.data;

  // Fetch game + players
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

  // Hard-stop only for truly finished games
  if (game.status === "completed" || game.status === "abandoned") {
    return NextResponse.json({ error: "Game is already over" }, { status: 400 });
  }

  const players = (game.game_players ?? []) as Array<{
    user_id: string;
    color: string;
  }>;

  const rawState = game.state as {
    fen?: string;
    turn?: string;
    vs_bot?: boolean;
    bot_user_id?: string;
    turn_started_at?: string;
    white_time_ms?: number;
    black_time_ms?: number;
  };
  const botUserId =
    typeof rawState.bot_user_id === "string" ? rawState.bot_user_id : null;
  const isVsBotGame = !!rawState.vs_bot && !!botUserId;

  let moverUserId = user.id;
  let actingPlayerRow: { user_id: string; color: string };

  if (asBot) {
    if (!isVsBotGame || !botUserId) {
      return NextResponse.json(
        { error: "This game does not support bot moves" },
        { status: 400 }
      );
    }
    if (user.id === botUserId) {
      return NextResponse.json({ error: "Invalid bot move request" }, { status: 403 });
    }

    const botRow = players.find((p) => p.user_id === botUserId);
    const humanRow = players.find((p) => p.user_id === user.id);

    if (!botRow || !humanRow) {
      console.error(
        `[moves POST asBot] human ${user.id} / bot ${botUserId} missing in game ${gameId}`
      );
      return NextResponse.json(
        { error: "You are not a player in this game" },
        { status: 403 }
      );
    }

    actingPlayerRow = botRow;
    moverUserId = botUserId;
  } else {
    const playerRow = players.find((p) => p.user_id === user.id);
    if (!playerRow) {
      console.error(
        `[moves POST] user ${user.id} not found in game ${gameId}. Players:`,
        players
      );
      return NextResponse.json(
        { error: "You are not a player in this game" },
        { status: 403 }
      );
    }
    actingPlayerRow = playerRow;
  }

  // ── Auto-activate waiting games ────────────────────────────────────────────
  // Games start as "waiting"; the moves-INSERT RLS policy requires
  // status = 'active', so we must flip it before recording the first move.
  if (game.status === "waiting") {
    const { error: activateErr } = await adminClient
      .from("games")
      .update({ status: "active" })
      .eq("id", gameId);

    if (activateErr) {
      console.error("[moves POST] failed to activate game:", activateErr);
      return NextResponse.json(
        { error: "Could not activate game" },
        { status: 500 }
      );
    }
  }

  // Authoritative FEN from the DB state column
  const state = rawState;
  const currentFen = (state?.fen && state.fen.trim() !== "")
    ? state.fen
    : INITIAL_FEN;

  // Verify it's this player's turn (compare FEN active-colour with player colour)
  const chess = new Chess(currentFen);
  const turnColor = chess.turn() === "w" ? "white" : "black";
  if (turnColor !== actingPlayerRow.color) {
    console.error(
      `[moves POST] wrong turn: FEN says ${turnColor}, mover color is ${actingPlayerRow.color}`
    );
    return NextResponse.json(
      { error: `It is not your turn (${actingPlayerRow.color})` },
      { status: 400 }
    );
  }

  // Validate and apply move via chess.js (throws on illegal move in v1)
  let moveResult;
  try {
    moveResult = chess.move({
      from: from as Square,
      to: to as Square,
      promotion: promotion as PieceSymbol,
    });
  } catch (err) {
    console.error(`[moves POST] illegal move ${from}->${to} on FEN ${currentFen}:`, err);
    return NextResponse.json(
      { error: `Invalid move: ${from} → ${to}` },
      { status: 400 }
    );
  }

  const newFen = chess.fen();
  const moveSan = moveResult.san;

  // Determine game-over state
  const isOver = chess.isGameOver();
  let result: string | null = null;
  let winnerId: string | null = null;

  if (isOver) {
    if (chess.isCheckmate()) {
      result = "checkmate";
      winnerId = moverUserId; // the player who just moved delivered checkmate
    } else if (chess.isStalemate()) {
      result = "stalemate";
    } else {
      // Fifty-move rule, insufficient material, threefold repetition
      result = "draw";
    }
  }

  // Get sequential move number
  const { count: moveCount } = await adminClient
    .from("moves")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId);

  const moveNumber = (moveCount ?? 0) + 1;

  // Insert move record
  const { error: moveError } = await adminClient.from("moves").insert({
    game_id: gameId,
    user_id: moverUserId,
    move_san: moveSan,
    fen_after: newFen,
    move_number: moveNumber,
  });

  if (moveError) {
    console.error("[moves POST] moves insert error:", moveError);
    return NextResponse.json(
      { error: `Failed to record move: ${moveError.message}` },
      { status: 500 }
    );
  }

  // Update games row
  const newTurn = chess.turn() === "w" ? "white" : "black";
  const now = new Date().toISOString();
  const timeControl = game.time_control as { type: string; minutes?: number } | null;

  const prevState = (game.state ?? {}) as Record<string, unknown>;
  const newState: Record<string, unknown> = {
    ...prevState,
    fen: newFen,
    turn: newTurn,
  };
  if (result) newState.result = result;

  // Attach timer fields based on time control type
  if (!isOver && timeControl?.type === "per_turn") {
    newState.turn_started_at = now;
  } else if (!isOver && timeControl?.type === "per_game") {
    const totalMs = (timeControl.minutes ?? 10) * 60 * 1000;

    // Carry forward existing banks, or initialise them on the first move
    let whiteMs = state.white_time_ms ?? totalMs;
    let blackMs = state.black_time_ms ?? totalMs;

    // Deduct elapsed time from the player who just moved
    if (state.turn_started_at) {
      const elapsed = Date.now() - new Date(state.turn_started_at).getTime();
      if (actingPlayerRow.color === "white") {
        whiteMs = Math.max(0, whiteMs - elapsed);
      } else {
        blackMs = Math.max(0, blackMs - elapsed);
      }
    }

    newState.white_time_ms = whiteMs;
    newState.black_time_ms = blackMs;
    newState.turn_started_at = now;
  }

  const gameUpdate: Record<string, unknown> = { state: newState };
  if (isOver) {
    gameUpdate.status = "completed";
    if (winnerId) gameUpdate.winner_id = winnerId;
  }

  const { error: updateError } = await adminClient
    .from("games")
    .update(gameUpdate)
    .eq("id", gameId);

  if (updateError) {
    console.error("games update error:", updateError);
    // Non-fatal: the move is already recorded; the game state may lag one cycle
  }

  if (!isOver) {
    const nextPlayer = players.find((p) => p.color === newTurn);
    const skipTurnNotify =
      !!botUserId && !!nextPlayer && nextPlayer.user_id === botUserId;

    if (nextPlayer && !skipTurnNotify && nextPlayer.user_id !== moverUserId) {
      const { data: moverProfile } = await adminClient
        .from("users")
        .select("username")
        .eq("id", moverUserId)
        .single();

      const moverName = moverProfile?.username ?? "Your opponent";

      const { error: cleanupError } = await adminClient
        .from("notifications")
        .delete()
        .eq("user_id", nextPlayer.user_id)
        .eq("type", "your_turn")
        .is("read_at", null)
        .contains("payload", { game_id: gameId });

      if (cleanupError) {
        console.error("[moves POST] your_turn notification cleanup error:", cleanupError);
      }

      const { error: notificationError } = await adminClient
        .from("notifications")
        .insert({
          user_id: nextPlayer.user_id,
          type: "your_turn",
          payload: {
            game_id: gameId,
            opponent_name: moverName,
          },
        });

      if (notificationError) {
        console.error("[moves POST] your_turn notification insert error:", notificationError);
      }
    }
  }

  if (isOver) {
    const loser = winnerId
      ? players.find((p) => p.user_id !== winnerId)
      : undefined;
    const involvesBot =
      !!botUserId && players.some((p) => p.user_id === botUserId);

    if (winnerId && !involvesBot && loser?.user_id) {
      try {
        await updateEloAfterCompletedGame({
          adminClient,
          gameId,
          winnerId,
          loserId: loser.user_id,
        });
      } catch (error) {
        console.error("[moves POST] ELO update failed:", error);
      }
    }

    const newBadges = await awardGameCompletedBadgesForPlayers({
      winnerId,
      botUserId,
      players,
    });

    return NextResponse.json({
      success: true,
      fen: newFen,
      san: moveSan,
      from,
      to,
      gameOver: isOver,
      result,
      winnerId,
      newBadges,
    });
  }

  return NextResponse.json({
    success: true,
    fen: newFen,
    san: moveSan,
    from,
    to,
    gameOver: isOver,
    result,
    winnerId,
  });
}

// ── GET /api/moves/[id] ─────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gameId = params.id;

  // Auth — user-scoped client only for identity verification.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin client — used for ALL database operations.
  const adminClient = createAdminClient();

  // Ensure the requester is a player in this game.
  const { data: playerRow } = await adminClient
    .from("game_players")
    .select("id")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .single();

  if (!playerRow) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: moves, error } = await adminClient
    .from("moves")
    .select("id, move_san, fen_after, move_number, created_at, user_id")
    .eq("game_id", gameId)
    .order("move_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ moves });
}
