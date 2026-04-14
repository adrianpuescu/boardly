import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const SUPPORTED_LOCALES = ["en", "ro", "es"];

function detectLocale(acceptLanguage: string): string {
  const preferred = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase());
  for (const lang of preferred) {
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
  }
  return "en";
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  const isProtectedRoute = request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/game") ||
    request.nextUrl.pathname.startsWith("/lobby");

  if (isProtectedRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Set NEXT_LOCALE cookie from Accept-Language if not already set
  if (!request.cookies.get("NEXT_LOCALE")) {
    const acceptLanguage = request.headers.get("accept-language") ?? "";
    const locale = detectLocale(acceptLanguage);
    supabaseResponse.cookies.set("NEXT_LOCALE", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and Next.js internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
