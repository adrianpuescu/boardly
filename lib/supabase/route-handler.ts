import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Origin for absolute redirects (OAuth callback, etc.). On Vercel, `request.url`
 * may use the *.vercel.app deployment host even when the user opened a custom
 * domain; `x-forwarded-host` reflects the browser URL.
 */
export function getPublicSiteOrigin(request: NextRequest): string {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (forwardedHost) {
    const proto = forwardedProto || "https";
    return `${proto}://${forwardedHost}`;
  }

  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (envUrl && /^https?:\/\//i.test(envUrl)) {
    try {
      return new URL(envUrl).origin;
    } catch {
      /* fall through */
    }
  }

  return new URL(request.url).origin;
}

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
