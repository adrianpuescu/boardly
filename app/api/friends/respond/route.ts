import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAndAwardBadges } from "@/lib/badges/checkBadges";

const bodySchema = z.object({
  friendshipId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  const { friendshipId, action } = parsed.data;

  const { data: friendship, error: findError } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("id", friendshipId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  if (!friendship) {
    return NextResponse.json(
      { error: "This friend request is no longer valid." },
      { status: 404 }
    );
  }

  if (friendship.addressee_id !== user.id) {
    return NextResponse.json(
      { error: "Only the addressee can respond" },
      { status: 403 }
    );
  }

  if (friendship.status !== "pending") {
    return NextResponse.json(
      { error: "Friend request is no longer pending" },
      { status: 409 }
    );
  }

  const nextStatus = action === "accept" ? "accepted" : "declined";
  const { data: updated, error: updateError } = await supabase
    .from("friendships")
    .update({ status: nextStatus })
    .eq("id", friendshipId)
    .select("id, requester_id, addressee_id, status, created_at, updated_at")
    .single();

  if (updateError) {
    if (updateError.code === "PGRST116") {
      return NextResponse.json(
        { error: "This friend request is no longer valid." },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (action === "accept") {
    try {
      await Promise.all([
        checkAndAwardBadges(updated.requester_id, "friend_added"),
        checkAndAwardBadges(updated.addressee_id, "friend_added"),
      ]);
    } catch (error) {
      console.error("[friends/respond] badge check failed:", error);
    }
  }

  return NextResponse.json({ friendship: updated });
}
