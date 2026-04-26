import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  followingId: z.string().uuid(),
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
    return NextResponse.json({ error: "Invalid followingId" }, { status: 422 });
  }

  const { followingId } = parsed.data;
  if (followingId === user.id) {
    return NextResponse.json({ error: "You cannot follow yourself" }, { status: 422 });
  }

  const { data: follow, error } = await supabase
    .from("follows")
    .insert({ follower_id: user.id, following_id: followingId })
    .select("id, follower_id, following_id, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already following" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ follow }, { status: 201 });
}
