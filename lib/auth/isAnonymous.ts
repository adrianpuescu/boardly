import type { User } from "@supabase/supabase-js";

/** True when the session is an anonymous (guest) Supabase Auth user. */
export function isAnonymousAuthUser(user: User | null): boolean {
  if (!user) return false;
  if ((user as { is_anonymous?: boolean }).is_anonymous) return true;
  return user.identities?.some((i) => i.provider === "anonymous") ?? false;
}
