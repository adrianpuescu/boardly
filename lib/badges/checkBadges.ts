import { createAdminClient } from "@/lib/supabase/admin";

type BadgeTrigger = "game_completed" | "friend_added";
function getLongestWinStreak(winsByGame: boolean[]): number {
  let longest = 0;
  let current = 0;

  for (const didWin of winsByGame) {
    if (didWin) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return longest;
}

/** Call after any game reaches `completed` (human vs human or vs bot). */
export async function awardGameCompletedBadgesForPlayers(params: {
  winnerId: string | null;
  botUserId: string | null;
  players: Array<{ user_id: string }>;
}): Promise<void> {
  const { winnerId, botUserId, players } = params;
  const involvesBot =
    !!botUserId && players.some((p) => p.user_id === botUserId);
  const humanPlayerId = involvesBot
    ? players.find((p) => p.user_id !== botUserId)?.user_id ?? null
    : null;

  try {
    if (!involvesBot) {
      if (winnerId) {
        await checkAndAwardBadges(winnerId, "game_completed");
      }
    } else if (humanPlayerId) {
      await checkAndAwardBadges(humanPlayerId, "game_completed");
    }
  } catch (error) {
    console.error("[badges] game completion badge check failed:", error);
  }
}

export async function checkAndAwardBadges(
  userId: string,
  trigger: BadgeTrigger
): Promise<string[]> {
  const admin = createAdminClient();

  const { data: alreadyEarnedRows, error: earnedError } = await admin
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", userId);

  if (earnedError) {
    console.error("[badges] failed to load current badges:", earnedError);
    return [];
  }

  const earnedSet = new Set((alreadyEarnedRows ?? []).map((row) => row.badge_id));
  const candidateBadgeIds = new Set<string>();

  if (trigger === "game_completed") {
    const { data: playerRows, error: gameCountError } = await admin
      .from("game_players")
      .select("game_id")
      .eq("user_id", userId);

    if (gameCountError) {
      console.error("[badges] failed to count games:", gameCountError);
      return [];
    }

    const playedGamesCount = (playerRows ?? []).length;
    if (playedGamesCount >= 1) candidateBadgeIds.add("first_game");
    if (playedGamesCount >= 10) candidateBadgeIds.add("games_10");
    if (playedGamesCount >= 100) candidateBadgeIds.add("games_100");

    const { data: winsRows, error: winsError } = await admin
      .from("games")
      .select("id")
      .eq("winner_id", userId)
      .eq("status", "completed");

    if (winsError) {
      console.error("[badges] failed to count wins:", winsError);
      return [];
    }

    const winsCount = (winsRows ?? []).length;
    if (winsCount >= 1) candidateBadgeIds.add("first_win");
    if (winsCount >= 10) candidateBadgeIds.add("wins_10");
    if (winsCount >= 100) candidateBadgeIds.add("wins_100");

    const { data: completedGames, error: streakError } = await admin
      .from("games")
      .select(
        `
        id,
        winner_id,
        updated_at,
        game_players!inner(user_id)
      `
      )
      .eq("status", "completed")
      .eq("game_players.user_id", userId)
      .order("updated_at", { ascending: true });

    if (streakError) {
      console.error("[badges] failed to calculate streak:", streakError);
      return [];
    }

    const winsByGame = (completedGames ?? []).map((game) => game.winner_id === userId);
    const longestStreak = getLongestWinStreak(winsByGame);
    if (longestStreak >= 3) candidateBadgeIds.add("win_streak_3");
    if (longestStreak >= 5) candidateBadgeIds.add("win_streak_5");

    const playedGameIds = Array.from(
      new Set((playerRows ?? []).map((r) => r.game_id))
    );
    let botGamesCompleted: Array<{ winner_id: string | null; state: unknown }> =
      [];
    if (playedGameIds.length > 0) {
      const { data: completedStates, error: botGamesError } = await admin
        .from("games")
        .select("winner_id, state")
        .eq("status", "completed")
        .in("id", playedGameIds);

      if (botGamesError) {
        console.error("[badges] failed to load bot games:", botGamesError);
      } else {
        botGamesCompleted = (completedStates ?? []).filter((g) => {
          const s = g.state as { vs_bot?: boolean } | null;
          return !!s?.vs_bot;
        });
      }
    }

    if (botGamesCompleted.length >= 1) candidateBadgeIds.add("first_bot_game");

    const botWinsCount = botGamesCompleted.filter(
      (g) => g.winner_id === userId
    ).length;
    if (botWinsCount >= 1) candidateBadgeIds.add("beat_the_bot");

    const beatHardBot = botGamesCompleted.some((g) => {
      if (g.winner_id !== userId) return false;
      const d = (g.state as { bot_difficulty?: number }).bot_difficulty;
      return typeof d === "number" && d >= 15;
    });
    if (beatHardBot) candidateBadgeIds.add("beat_hard_bot");
  }

  if (trigger === "friend_added") {
    const { data: friendRows, error: friendError } = await admin
      .from("friendships")
      .select("id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (friendError) {
      console.error("[badges] failed to count friends:", friendError);
      return [];
    }

    const friendsCount = (friendRows ?? []).length;
    if (friendsCount >= 1) candidateBadgeIds.add("first_friend");
    if (friendsCount >= 10) candidateBadgeIds.add("friends_10");
  }

  const newBadgeIds = Array.from(candidateBadgeIds).filter(
    (badgeId) => !earnedSet.has(badgeId)
  );
  if (newBadgeIds.length === 0) {
    return [];
  }

  const badgeRowsToInsert = newBadgeIds.map((badgeId) => ({
    user_id: userId,
    badge_id: badgeId,
  }));

  const { data: insertedBadges, error: insertBadgesError } = await admin
    .from("user_badges")
    .insert(badgeRowsToInsert)
    .select("badge_id");

  if (insertBadgesError) {
    console.error("[badges] failed to insert earned badges:", insertBadgesError);
    return [];
  }

  const awardedBadgeIds = (insertedBadges ?? []).map((row) => row.badge_id);
  if (awardedBadgeIds.length === 0) {
    return [];
  }

  const { data: badgeMetaRows, error: badgeMetaError } = await admin
    .from("badges")
    .select("id, name, icon")
    .in("id", awardedBadgeIds);

  if (badgeMetaError) {
    console.error("[badges] failed to load badge metadata:", badgeMetaError);
    return awardedBadgeIds;
  }

  const notifications = (badgeMetaRows ?? []).map((badge) => ({
    user_id: userId,
    type: "badge_earned",
    payload: {
      badgeId: badge.id,
      badgeName: badge.name,
      badgeIcon: badge.icon,
    },
  }));

  if (notifications.length > 0) {
    const { error: notificationError } = await admin
      .from("notifications")
      .insert(notifications);
    if (notificationError) {
      console.error("[badges] failed to insert badge notifications:", notificationError);
    }
  }

  return awardedBadgeIds;
}
