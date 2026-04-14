import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Supabase client for Route Handlers where session cookies must be attached to a
 * specific {@link NextResponse} (e.g. redirects). Using `cookies()` from
 * `next/headers` in a route often fails to persist auth cookies; the SSR guide
 * recommends wiring `setAll` to `response.cookies`.
 */
export function createRouteHandlerClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}

/** Only same-origin relative paths; blocks open redirects. */
export function safeAuthRedirectPath(
  nextParam: string | null,
  fallback = "/dashboard"
): string {
  const raw = nextParam?.trim() ? nextParam : fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes("://")) return fallback;
  return decoded;
}
