import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { read_at?: string } = {};
  try {
    body = (await request.json()) as { read_at?: string };
  } catch {
    // Empty body is allowed.
  }

  const readAt = body.read_at ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: readAt })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, read_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notification: data });
}
