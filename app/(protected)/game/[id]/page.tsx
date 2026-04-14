import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GamePageClient } from "@/components/game/GamePageClient";
import { isAnonymousAuthUser } from "@/lib/auth/isAnonymous";
import type { CurrentUser, GamePageData } from "@/lib/types";

interface Props {
  params: { id: string };
}

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default async function GamePage({ params }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const isGuest = isAnonymousAuthUser(user);

  // Fetch game with all players + their profiles
  const { data: game } = await supabase
    .from("games")
    .select(
      `
      id,
      status,
      game_type,
      state,
      time_control,
      winner_id,
      game_players (
        user_id,
        color,
        users (
          id,
          username,
          avatar_url
        )
      )
    `
    )
    .eq("id", params.id)
    .single();

  if (!game) redirect("/dashboard");

  // PostgREST returns FK many-to-one joins as a single object, not an array.
  const players = (game.game_players ?? []) as unknown as Array<{
    user_id: string;
    color: string;
    users: { id: string; username: string; avatar_url: string | null } | null;
  }>;

  // Verify current user is actually in this game
  const myPlayerRow = players.find((p) => p.user_id === user.id);
  if (!myPlayerRow) redirect("/dashboard");

  const opponentRow = players.find((p) => p.user_id !== user.id);

  let opponentEmail: string | null = null;
  if (opponentRow) {
    const admin = createAdminClient();
    const { data: authData } = await admin.auth.admin.getUserById(
      opponentRow.user_id
    );
    opponentEmail = authData?.user?.email ?? null;
  }

  const state = (game.state ?? {}) as {
    fen?: string;
    turn?: string;
    turn_started_at?: string;
    white_time_ms?: number;
    black_time_ms?: number;
  };

  const myProfile = myPlayerRow.users;
  const opponentProfile = opponentRow?.users ?? null;

  const gameData: GamePageData = {
    id: game.id as string,
    status: game.status as GamePageData["status"],
    game_type: game.game_type as string,
    state: {
      fen: state.fen ?? INITIAL_FEN,
      turn: (state.turn ?? "white") as "white" | "black",
      turn_started_at: state.turn_started_at,
      white_time_ms: state.white_time_ms,
      black_time_ms: state.black_time_ms,
    },
    time_control: game.time_control as GamePageData["time_control"],
    winner_id: (game.winner_id as string | null) ?? null,
    my_color: myPlayerRow.color as "white" | "black",
    opponent: opponentProfile,
    opponent_email: opponentEmail,
  };

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email ?? "",
    username: myProfile?.username ?? user.email?.split("@")[0] ?? "You",
    avatar_url:
      myProfile?.avatar_url ??
      (user.user_metadata?.avatar_url as string | null) ??
      (user.user_metadata?.picture as string | null) ??
      null,
    isGuest,
  };

  return <GamePageClient game={gameData} currentUser={currentUser} />;
}
