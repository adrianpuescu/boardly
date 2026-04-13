import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const BUCKET = "avatars";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 2 MB limit" },
      { status: 413 }
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${user.id}/avatar.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const admin = createAdminClient();

  // Ensure bucket exists and is public
  const { data: buckets } = await admin.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.name === BUCKET);
  if (!bucketExists) {
    const { error: bucketError } = await admin.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      fileSizeLimit: MAX_SIZE,
    });
    if (bucketError) {
      console.error("bucket creation error:", bucketError);
      return NextResponse.json(
        { error: "Storage setup failed" },
        { status: 500 }
      );
    }
  }

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("avatar upload error:", uploadError);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  // Bust cache by appending a timestamp query param
  const avatarUrl = `${publicUrl}?t=${Date.now()}`;

  const { error: dbError } = await admin
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (dbError) {
    console.error("avatar_url db update error:", dbError);
    return NextResponse.json(
      { error: "Failed to save avatar URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({ avatar_url: avatarUrl });
}
