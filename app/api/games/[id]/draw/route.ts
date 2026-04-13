import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  action: z.enum(["offer", "accept", "decline"]),
});

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
    const { error } = await adminClient
      .from("games")
      .update({
        state: { ...currentState, draw_offered_by: user.id },
      })
      .eq("id", gameId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: "offer" });
  }

  if (action === "decline") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { draw_offered_by: _removed, ...stateWithoutOffer } = currentState as Record<string, unknown> & { draw_offered_by?: string };
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { draw_offered_by: _dropped, ...stateWithoutOffer } = currentState as Record<string, unknown> & { draw_offered_by?: string };

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

  return NextResponse.json({ success: true, action: "accept" });
}
