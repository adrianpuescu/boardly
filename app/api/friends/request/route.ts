import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  addresseeId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  console.log("[friends/request] POST handler called");
  const supabase = createClient();
  const admin = createAdminClient();
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
    return NextResponse.json({ error: "Invalid addresseeId" }, { status: 422 });
  }

  const { addresseeId } = parsed.data;
  if (addresseeId === user.id) {
    return NextResponse.json({ error: "You cannot friend yourself" }, { status: 422 });
  }

  const { data: requesterProfile } = await supabase
    .from("users")
    .select("id, username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { data: existingRows, error: existingError } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${user.id})`
    )
    .limit(2);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existing = existingRows?.[0];
  if (existing) {
    if (existing.status === "accepted") {
      return NextResponse.json(
        { error: "You are already friends" },
        { status: 409 }
      );
    }
    if (existing.status === "blocked") {
      return NextResponse.json(
        { error: "Friend request cannot be sent" },
        { status: 403 }
      );
    }
    if (existing.status === "pending" && existing.requester_id === user.id) {
      return NextResponse.json(
        { error: "Friend request already pending" },
        { status: 409 }
      );
    }
    if (existing.status === "pending" && existing.addressee_id === user.id) {
      const { data: accepted, error: acceptError } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", existing.id)
        .select("id, requester_id, addressee_id, status, created_at, updated_at")
        .single();

      if (acceptError) {
        return NextResponse.json({ error: acceptError.message }, { status: 500 });
      }

      return NextResponse.json({ friendship: accepted }, { status: 200 });
    }

    const { data: resent, error: resendError } = await supabase
      .from("friendships")
      .update({
        requester_id: user.id,
        addressee_id: addresseeId,
        status: "pending",
      })
      .eq("id", existing.id)
      .select("id, requester_id, addressee_id, status, created_at, updated_at")
      .single();

    if (resendError) {
      return NextResponse.json({ error: resendError.message }, { status: 500 });
    }

    return NextResponse.json({ friendship: resent }, { status: 200 });
  }

  const { data: friendship, error } = await supabase
    .from("friendships")
    .insert({
      requester_id: user.id,
      addressee_id: addresseeId,
      status: "pending",
    })
    .select("id, requester_id, addressee_id, status, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("[friends/request] building friend_request notification payload");
  const payload = {
    friendshipId: friendship.id,
    fromUserId: user.id,
    fromUsername: requesterProfile?.username ?? user.email?.split("@")[0] ?? "Someone",
    fromAvatar: requesterProfile?.avatar_url ?? null,
  };
  console.log("Inserting friend_request notification:", payload);

  const { data: existingUnreadNotifications, error: existingNotifError } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", addresseeId)
    .eq("type", "friend_request")
    .is("read_at", null)
    .eq("payload->>fromUserId", user.id);

  if (existingNotifError) {
    console.error("Friend request pre-delete notification query error:", existingNotifError);
  } else if ((existingUnreadNotifications ?? []).length > 0) {
    const idsToDelete = existingUnreadNotifications.map((row) => row.id);
    const { error: deleteNotifError } = await admin
      .from("notifications")
      .delete()
      .in("id", idsToDelete);
    if (deleteNotifError) {
      console.error("Friend request pre-delete notification error:", deleteNotifError);
    }
  }

  const { error: notifError } = await admin.from("notifications").insert({
    user_id: addresseeId,
    type: "friend_request",
    payload,
  });

  if (notifError) {
    console.error("Friend request notification error:", notifError);
  }

  return NextResponse.json({ friendship }, { status: 201 });
}
