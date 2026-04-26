import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  name: z.string().max(50),
});

export async function PATCH(
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

  const trimmedName = parsed.data.name.trim();
  if (trimmedName.length > 50) {
    return NextResponse.json(
      { error: "Name must be at most 50 characters" },
      { status: 422 }
    );
  }

  const adminClient = createAdminClient();

  const { data: game, error: fetchError } = await adminClient
    .from("games")
    .select("id, created_by")
    .eq("id", gameId)
    .single();

  if (fetchError || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  let canEdit = game.created_by === user.id;
  if (!canEdit && game.created_by == null) {
    const { data: creatorPlayer } = await adminClient
      .from("game_players")
      .select("user_id")
      .eq("game_id", gameId)
      .eq("color", "white")
      .maybeSingle();
    canEdit = creatorPlayer?.user_id === user.id;
  }

  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: updatedGame, error: updateError } = await adminClient
    .from("games")
    .update({ name: trimmedName.length > 0 ? trimmedName : null })
    .eq("id", gameId)
    .select("name")
    .single();

  if (updateError || !updatedGame) {
    return NextResponse.json({ error: "Failed to update game name" }, { status: 500 });
  }

  return NextResponse.json({ name: (updatedGame.name as string | null) ?? "" });
}
