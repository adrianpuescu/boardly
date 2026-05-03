import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardClient } from "@/components/game/DashboardClient";
import { isAnonymousAuthUser } from "@/lib/auth/isAnonymous";
import type { CurrentUser } from "@/lib/types";
import { loadDashboardGamesPage } from "@/lib/dashboard/loadDashboardGames";

function parseDashboardPageParam(raw: string | string[] | undefined): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(s ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { page?: string | string[] };
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
  const { games, totalCount, page, pageSize } = await loadDashboardGamesPage(
    admin,
    user.id,
    requestedPage
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalCount > 0 && requestedPage > totalPages) {
    redirect(`/dashboard?page=${totalPages}`);
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
      pagination={
        totalCount > 0
          ? { page, pageSize, totalCount, totalPages }
          : null
      }
    />
  );
}
