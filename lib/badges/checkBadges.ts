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

  const newBadgeIds = [...candidateBadgeIds].filter((badgeId) => !earnedSet.has(badgeId));
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
