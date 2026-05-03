import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardClient } from "@/components/game/DashboardClient";
import { isAnonymousAuthUser } from "@/lib/auth/isAnonymous";
import type { CurrentUser } from "@/lib/types";
import {
  dashboardHref,
  loadDashboardGamesPage,
  type DashboardGamesFilter,
} from "@/lib/dashboard/loadDashboardGames";

function parseDashboardPageParam(raw: string | string[] | undefined): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(s ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function parseDashboardFilterParam(
  raw: string | string[] | undefined
): DashboardGamesFilter {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s === "ai" || s === "human") return s;
  return "all";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { page?: string | string[]; filter?: string | string[] };
}) {
  const supabase = createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (isAnonymousAuthUser(user)) {
    redirect("/login");
  }

  const { data: myProfile } = await admin
    .from("users")
    .select("username, avatar_url, elo_rating, country")
    .eq("id", user.id)
    .single();

  const requestedPage = parseDashboardPageParam(searchParams.page);
  const gamesFilter = parseDashboardFilterParam(searchParams.filter);
  const { games, totalCount, page, pageSize } = await loadDashboardGamesPage(
    admin,
    user.id,
    requestedPage,
    gamesFilter
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (requestedPage > totalPages) {
    redirect(dashboardHref(totalPages, gamesFilter));
  }

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email ?? "",
    username: myProfile?.username ?? user.email?.split("@")[0] ?? "",
    avatar_url:
      myProfile?.avatar_url ??
      (user.user_metadata?.avatar_url as string | null) ??
      (user.user_metadata?.picture as string | null) ??
      null,
    elo_rating: (myProfile?.elo_rating as number | undefined) ?? 1200,
    country: (myProfile?.country as string | null | undefined) ?? null,
  };

  return (
    <DashboardClient
      games={games}
      currentUser={currentUser}
      gamesFilter={gamesFilter}
      pagination={
        totalCount > 0
          ? { page, pageSize, totalCount, totalPages }
          : null
      }
    />
  );
}
