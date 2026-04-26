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

  const followId = params.id;
  const { data: follow, error: findError } = await supabase
    .from("follows")
    .select("id, follower_id")
    .eq("id", followId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!follow) {
    return NextResponse.json({ error: "Follow not found" }, { status: 404 });
  }
  if (follow.follower_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("follows").delete().eq("id", followId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
