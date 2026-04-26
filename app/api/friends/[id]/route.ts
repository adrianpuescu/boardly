import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: { id: string };
}

export async function DELETE(_request: Request, { params }: Props) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const friendshipId = params.id;
  const { data: existing, error: findError } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("id", friendshipId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
  }
  if (existing.requester_id !== user.id && existing.addressee_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
