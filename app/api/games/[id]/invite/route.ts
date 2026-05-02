import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
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

  const { data: game, error: gameError } = await adminClient
    .from("games")
    .select("id, status, created_by, state, game_players ( user_id, color )")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
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

  const state = (game.state ?? {}) as { vs_bot?: boolean };
  if (state.vs_bot) {
    return NextResponse.json(
      { error: "Invite link is not available for bot games" },
      { status: 400 }
    );
  }

  if (game.status !== "waiting") {
    return NextResponse.json(
      { error: "Game is not waiting for an opponent" },
      { status: 403 }
    );
  }

  const whitePlayer = players.find((p) => p.color === "white");
  const creatorId =
    game.created_by != null
      ? (game.created_by as string)
      : whitePlayer?.user_id ?? null;

  if (!creatorId || creatorId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const { data: existingInvite } = await adminClient
    .from("invites")
    .select("token")
    .eq("game_id", gameId)
    .eq("inviter_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let token = existingInvite?.token as string | undefined;

  if (!token) {
    const { data: created, error: insertError } = await adminClient
      .from("invites")
      .insert({
        game_id: gameId,
        inviter_id: user.id,
        invitee_email: null,
      })
      .select("token")
      .single();

    if (insertError || !created) {
      console.error("[games/invite GET] invites insert error:", insertError);
      return NextResponse.json(
        { error: "Could not create invite" },
        { status: 500 }
      );
    }
    token = created.token as string;
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl.replace(/\/$/, "")}/join/${token}`;

  return NextResponse.json({ token, inviteUrl });
}
