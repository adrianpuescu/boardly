import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Navbar } from "@/components/layout/Navbar";
import { RankingsPageClient } from "@/components/rankings/RankingsPageClient";
import type { CurrentUser } from "@/lib/types";

export default async function RankingsPage() {
  const supabase = createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await admin
    .from("users")
    .select("username, avatar_url, elo_rating, country")
    .eq("id", user.id)
    .maybeSingle();

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email ?? "",
    username: profile?.username ?? user.email?.split("@")[0] ?? "",
    avatar_url:
      profile?.avatar_url ??
      (user.user_metadata?.avatar_url as string | null) ??
      (user.user_metadata?.picture as string | null) ??
      null,
    elo_rating: (profile?.elo_rating as number | undefined) ?? 1200,
    country: (profile?.country as string | null | undefined) ?? null,
  };

  return (
    <>
      <Navbar currentUser={currentUser} />
      <RankingsPageClient currentUserId={user.id} />
    </>
  );
}
