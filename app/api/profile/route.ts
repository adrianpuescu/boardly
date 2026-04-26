import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z
  .object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(20, "Username must be at most 20 characters")
      .regex(
        /^[a-zA-Z0-9._]+$/,
        "Only letters, numbers, dots and underscores allowed"
      )
      .optional(),
    avatar_url: z.string().url("Invalid avatar URL").optional(),
    country: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{2}$/, "Country must be an ISO alpha-2 code"))
      .optional()
      .or(z.literal("")),
    city: z.string().trim().max(80, "City is too long").optional().or(z.literal("")),
    continent: z.string().trim().max(80, "Continent is too long").optional().or(z.literal("")),
  })
  .refine(
    (d) =>
      d.username !== undefined ||
      d.avatar_url !== undefined ||
      d.country !== undefined ||
      d.city !== undefined ||
      d.continent !== undefined,
    {
    message: "At least one field must be provided",
    }
  );

export async function PATCH(request: NextRequest) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 422 }
    );
  }

  const { username, avatar_url, country, city, continent } = parsed.data;
  const admin = createAdminClient();

  if (username !== undefined) {
    // Check uniqueness — exclude the current user
    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("username", username)
      .neq("id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Username already taken" },
        { status: 409 }
      );
    }
  }

  const updates: Record<string, string | null> = {};
  if (username !== undefined) updates.username = username;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (country !== undefined) updates.country = country === "" ? null : country;
  if (city !== undefined) updates.city = city === "" ? null : city;
  if (continent !== undefined) updates.continent = continent === "" ? null : continent;

  const { error } = await admin
    .from("users")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    console.error("profile update error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }

  return NextResponse.json(updates);
}
