import type { SupabaseClient } from "@supabase/supabase-js";

/** Display name stored in `public.users.username` for the Stockfish bot profile. */
export const BOARDLY_BOT_USERNAME = "Boardly Bot";

const BOARDLY_BOT_EMAIL = "boardly-bot@internal.boardly.invalid";

/**
 * Ensures a Supabase Auth user + `public.users` row exist for the engine bot.
 * The profile uses emoji as `avatar_url` (shown in-game via dedicated UI).
 */
export async function getOrCreateBoardlyBotUser(
  adminClient: SupabaseClient
): Promise<string> {
  const { data: existing } = await adminClient
    .from("users")
    .select("id")
    .eq("username", BOARDLY_BOT_USERNAME)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data: created, error: createErr } =
    await adminClient.auth.admin.createUser({
      email: BOARDLY_BOT_EMAIL,
      password: crypto.randomUUID() + crypto.randomUUID(),
      email_confirm: true,
    });

  let botId: string | null = created.user?.id ?? null;

  if (createErr || !botId) {
    const msg = createErr?.message ?? "";
    const duplicate =
      msg.toLowerCase().includes("already") ||
      msg.toLowerCase().includes("registered") ||
      msg.toLowerCase().includes("exists");

    if (duplicate) {
      const { data: listData } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const authMatch = listData?.users?.find((u) => u.email === BOARDLY_BOT_EMAIL);
      if (authMatch) botId = authMatch.id;
    }

    if (!botId) {
      console.error("[boardlyBot] createUser failed:", createErr);
      throw new Error("Failed to create Boardly Bot account");
    }
  }

  await adminClient
    .from("users")
    .update({
      username: BOARDLY_BOT_USERNAME,
      avatar_url: "🤖",
    })
    .eq("id", botId);

  return botId;
}

export function isBoardlyBotUsername(username: string | null | undefined): boolean {
  return username === BOARDLY_BOT_USERNAME;
}
