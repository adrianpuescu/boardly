import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type BadgeId =
  | "first_win"
  | "wins_10"
  | "wins_100"
  | "first_friend"
  | "friends_10"
  | "early_adopter"
  | "first_game"
  | "games_10"
  | "games_100"
  | "win_streak_3"
  | "win_streak_5";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: users, error: usersError } = await admin
    .from("users")
    .select("id");

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  let usersProcessed = 0;
  let badgesAwarded = 0;

  for (const user of users ?? []) {
    usersProcessed += 1;
    const userId = user.id as string;

    const { data: existingBadgesRows, error: existingBadgesError } = await admin
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", userId);

    if (existingBadgesError) {
      console.error("[backfill-badges] failed reading existing badges:", existingBadgesError);
      continue;
    }

    const earnedBadgeIds = new Set(
      (existingBadgesRows ?? []).map((row) => row.badge_id as BadgeId)
    );

    const { data: playerRows, error: playerRowsError } = await admin
      .from("game_players")
      .select("game_id")
      .eq("user_id", userId);

    if (playerRowsError) {
      console.error("[backfill-badges] failed reading game count:", playerRowsError);
      continue;
    }

    const { data: winsRows, error: winsError } = await admin
      .from("games")
      .select("id")
      .eq("status", "completed")
      .eq("winner_id", userId);

    if (winsError) {
      console.error("[backfill-badges] failed reading wins:", winsError);
      continue;
    }

    const { data: acceptedFriendships, error: friendsError } = await admin
      .from("friendships")
      .select("id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (friendsError) {
      console.error("[backfill-badges] failed reading friends count:", friendsError);
      continue;
    }

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
      console.error("[backfill-badges] failed reading games for streak:", streakError);
      continue;
    }

    const gamesPlayed = (playerRows ?? []).length;
    const wins = (winsRows ?? []).length;
    const friends = (acceptedFriendships ?? []).length;
    const winsByGame = (completedGames ?? []).map((game) => game.winner_id === userId);
    const longestWinStreak = getLongestWinStreak(winsByGame);

    const qualifiesFor = new Set<BadgeId>();

    qualifiesFor.add("early_adopter");
    if (gamesPlayed >= 1) qualifiesFor.add("first_game");
    if (gamesPlayed >= 10) qualifiesFor.add("games_10");
    if (gamesPlayed >= 100) qualifiesFor.add("games_100");
    if (wins >= 1) qualifiesFor.add("first_win");
    if (wins >= 10) qualifiesFor.add("wins_10");
    if (wins >= 100) qualifiesFor.add("wins_100");
    if (friends >= 1) qualifiesFor.add("first_friend");
    if (friends >= 10) qualifiesFor.add("friends_10");
    if (longestWinStreak >= 3) qualifiesFor.add("win_streak_3");
    if (longestWinStreak >= 5) qualifiesFor.add("win_streak_5");

    const missingBadgeIds = [...qualifiesFor].filter((badgeId) => !earnedBadgeIds.has(badgeId));
    if (missingBadgeIds.length === 0) continue;

    const { data: insertedRows, error: insertError } = await admin
      .from("user_badges")
      .insert(missingBadgeIds.map((badgeId) => ({ user_id: userId, badge_id: badgeId })))
      .select("badge_id");

    if (insertError) {
      console.error("[backfill-badges] failed inserting user_badges:", insertError);
      continue;
    }

    const newBadgeIds = (insertedRows ?? []).map((row) => row.badge_id as string);
    badgesAwarded += newBadgeIds.length;

    const { data: badgeMetaRows, error: badgeMetaError } = await admin
      .from("badges")
      .select("id, name, icon")
      .in("id", newBadgeIds);

    if (badgeMetaError) {
      console.error("[backfill-badges] failed reading badge metadata:", badgeMetaError);
      continue;
    }

    if ((badgeMetaRows ?? []).length > 0) {
      const { error: notificationError } = await admin.from("notifications").insert(
        badgeMetaRows.map((badge) => ({
          user_id: userId,
          type: "badge_earned",
          payload: {
            badgeId: badge.id,
            badgeName: badge.name,
            badgeIcon: badge.icon,
          },
        }))
      );

      if (notificationError) {
        console.error("[backfill-badges] failed inserting notifications:", notificationError);
      }
    }
  }

  return NextResponse.json({ usersProcessed, badgesAwarded });
}
