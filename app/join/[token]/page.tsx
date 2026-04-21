import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAnonymousAuthUser } from "@/lib/auth/isAnonymous";
import JoinPageClient from "./JoinPageClient";

interface Props {
  params: { token: string };
}

// ── Error screen ────────────────────────────────────────────────────────────
async function ExpiredPage() {
  const t = await getTranslations("join");

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background:
          "linear-gradient(135deg, #FAF7F2 0%, #FFF3E0 50%, #FAF7F2 100%)",
      }}
    >
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="text-6xl">🙈</div>
        <h1 className="text-2xl font-black text-gray-900">
          {t("expired")}
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          {t("expiredDesc")}
        </p>
        <Link
          href="/"
          className="inline-block mt-2 text-sm font-semibold text-orange-500 hover:text-orange-600 underline underline-offset-4 transition-colors"
        >
          {t("goToBoardly")}
        </Link>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function JoinPage({ params }: Props) {
  const { token } = params;
  const adminClient = createAdminClient();

  // Fetch invite by token (RLS allows public read by token)
  const { data: invite } = await adminClient
    .from("invites")
    .select("id, game_id, inviter_id, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  const isExpired =
    !invite ||
    invite.status !== "pending" ||
    new Date(invite.expires_at) < new Date();

  if (isExpired) {
    return <ExpiredPage />;
  }

  // Fetch game details for the preview
  const { data: game } = await adminClient
    .from("games")
    .select("id, time_control")
    .eq("id", invite.game_id)
    .single();

  // Fetch inviter profile
  const { data: inviter } = await adminClient
    .from("users")
    .select("username")
    .eq("id", invite.inviter_id)
    .maybeSingle();

  // Check current auth state
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAnonymousUser = isAnonymousAuthUser(user);

  // If an authenticated non-guest user is already a player, send them straight there.
  // Guests should stay on /join/[token] (no server redirect) to avoid forced 307 hops.
  if (user && !isAnonymousUser) {
    const { data: existingPlayer } = await adminClient
      .from("game_players")
      .select("user_id")
      .eq("game_id", invite.game_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingPlayer) {
      redirect(`/game/${invite.game_id}`);
    }
  }

  const timeControl = (game?.time_control ?? { type: "unlimited" }) as {
    type: "unlimited" | "per_turn" | "per_game";
    minutes?: number;
  };

  return (
    <JoinPageClient
      token={token}
      gameId={invite.game_id}
      inviterName={inviter?.username ?? "Someone"}
      timeControl={timeControl}
      isLoggedIn={!!user}
    />
  );
}
