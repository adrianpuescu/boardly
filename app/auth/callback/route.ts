import { NextResponse, type NextRequest } from "next/server";
import {
  createRouteHandlerClient,
  getPublicSiteOrigin,
  safeAuthRedirectPath,
} from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const siteOrigin = getPublicSiteOrigin(request);
  const nextPath = safeAuthRedirectPath(searchParams.get("next"), "/dashboard");
  const redirectUrl = new URL(nextPath, `${siteOrigin}/`);

  // PKCE / OAuth (Google) and email links that use ?code= — session cookies must be
  // written onto this redirect response (Route Handlers cannot rely on cookies() from next/headers).
  if (code) {
    const exchangeResponse = NextResponse.redirect(redirectUrl);
    const supabase = createRouteHandlerClient(request, exchangeResponse);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return exchangeResponse;
    }
  }

  // Legacy / alternate email flows (?token_hash=&type=)
  if (token_hash && type) {
    const otpResponse = NextResponse.redirect(redirectUrl);
    const supabase = createRouteHandlerClient(request, otpResponse);
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "email" | "magiclink" | "signup" | "recovery",
    });
    if (!error) {
      return otpResponse;
    }
  }

  const fail = new URL("/login", `${siteOrigin}/`);
  fail.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(fail);
}
