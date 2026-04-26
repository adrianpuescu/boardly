import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Navbar } from "@/components/layout/Navbar";
import { FriendsPageClient } from "@/components/friends/FriendsPageClient";
import type { CurrentUser } from "@/lib/types";

export default async function FriendsPage() {
  const supabase = createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: myProfile } = await admin
    .from("users")
    .select("username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email ?? "",
    username: myProfile?.username ?? user.email?.split("@")[0] ?? "",
    avatar_url:
      myProfile?.avatar_url ??
      (user.user_metadata?.avatar_url as string | null) ??
      (user.user_metadata?.picture as string | null) ??
      null,
  };

  return (
    <>
      <Navbar currentUser={currentUser} />
      <FriendsPageClient />
    </>
  );
}
