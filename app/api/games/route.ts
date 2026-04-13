import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const timeControlSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("unlimited") }),
  z.object({ type: z.literal("per_turn"), minutes: z.number().int().min(1).max(60) }),
  z.object({ type: z.literal("per_game"), minutes: z.number().int().min(5).max(180) }),
]);

const bodySchema = z.object({
  opponentEmail: z.string().email().optional().or(z.literal("")).transform((v) =>
    v === "" ? undefined : v
  ),
  timeControl: timeControlSchema,
});

export async function POST(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Validate body ──────────────────────────────────────────────────────────
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

  const { opponentEmail, timeControl } = parsed.data;

  // ── Insert game ────────────────────────────────────────────────────────────
  const { data: game, error: gameError } = await supabase
    .from("games")
    .insert({
      game_type: "chess",
      status: "waiting",
      state: { fen: INITIAL_FEN, turn: "white" },
      time_control: timeControl,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (gameError || !game) {
    console.error("games insert error:", gameError);
    return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
  }

  const gameId = game.id as string;

  // ── Add creator as white player ────────────────────────────────────────────
  const { error: creatorPlayerError } = await supabase
    .from("game_players")
    .insert({ game_id: gameId, user_id: user.id, color: "white" });

  if (creatorPlayerError) {
    console.error("game_players insert (creator) error:", creatorPlayerError);
    return NextResponse.json(
      { error: "Failed to add creator to game" },
      { status: 500 }
    );
  }

  // ── Handle opponent ────────────────────────────────────────────────────────
  if (!opponentEmail) {
    // No opponent provided — add the same user as black so the game is
    // immediately playable for solo testing (play-against-yourself mode).
    const { error: selfBlackError } = await supabase
      .from("game_players")
      .insert({ game_id: gameId, user_id: user.id, color: "black" });

    if (!selfBlackError) {
      await supabase
        .from("games")
        .update({ status: "active" })
        .eq("id", gameId);
    }
  } else if (opponentEmail) {
    const admin = createAdminClient();

    // Look up opponent in auth.users via admin API.
    // listUsers doesn't filter by email, so we page through users.
    // For production: add email to public.users or use an RPC function.
    const { data: usersPage } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });

    const opponentAuthUser = usersPage?.users?.find(
      (u) => u.email === opponentEmail
    );

    if (opponentAuthUser) {
      // Opponent already has an account — add as black player
      const { error: opponentPlayerError } = await supabase
        .from("game_players")
        .insert({
          game_id: gameId,
          user_id: opponentAuthUser.id,
          color: "black",
        });

      if (!opponentPlayerError) {
        // Both players present — move to active
        await supabase
          .from("games")
          .update({ status: "active" })
          .eq("id", gameId);
      }
    } else {
      // Unknown email — create an invite
      const { error: inviteError } = await supabase.from("invites").insert({
        game_id: gameId,
        inviter_id: user.id,
        invitee_email: opponentEmail,
      });

      if (inviteError) {
        console.error("invites insert error:", inviteError);
        // Non-fatal: game still created, invite just won't be sent
      }
    }
  }

  return NextResponse.json({ gameId }, { status: 201 });
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: games, error } = await supabase
    .from("games")
    .select(
      `
      id, status, game_type, time_control, state, created_at,
      game_players (user_id, color)
    `
    )
    .in(
      "id",
      (
        await supabase
          .from("game_players")
          .select("game_id")
          .eq("user_id", user.id)
      ).data?.map((r) => r.game_id) ?? []
    )
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ games });
}
