"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { safeAuthRedirectPath } from "@/lib/auth/safeRedirectPath";

/**
 * Poll briefly for a session after redirect with tokens in the URL hash
 * (implicit flow). Hash is never sent to the server, so this must run client-side.
 */
async function waitForSessionFromUrl(
  supabase: ReturnType<typeof createClient>,
  maxMs: number
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("common");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function finish(next: string) {
      router.replace(next);
    }

    async function fail() {
      router.replace("/login?error=auth_callback_failed");
    }

    async function run() {
      const supabase = createClient();
      const next = safeAuthRedirectPath(searchParams.get("next"), "/dashboard");

      if (searchParams.get("error")) {
        router.replace("/login?error=oauth_error");
        return;
      }

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const token_hash = url.searchParams.get("token_hash");
      const otpType = url.searchParams.get("type");
      const email = url.searchParams.get("email");
      const token = url.searchParams.get("token");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          await finish(next);
          return;
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          await finish(next);
          return;
        }
      }

      if (token_hash && otpType) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: otpType as "email" | "magiclink" | "signup" | "recovery",
        });
        if (!error) {
          await finish(next);
          return;
        }
      }

      if (email && token) {
        const otpEmailType =
          otpType === "signup" || otpType === "magiclink" || otpType === "email"
            ? otpType
            : "email";
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: otpEmailType,
        });
        if (!error) {
          await finish(next);
          return;
        }
      }

      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (hash.includes("error")) {
        await fail();
        return;
      }

      if (hash.includes("access_token")) {
        if (await waitForSessionFromUrl(supabase, 5000)) {
          await finish(next);
          return;
        }
      }

      const {
        data: { session: finalSession },
      } = await supabase.auth.getSession();
      if (finalSession) {
        await finish(next);
        return;
      }

      await fail();
    }

    void run();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <svg
        className="animate-spin h-8 w-8 text-orange-500"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"
        />
      </svg>
      <p className="text-sm text-gray-600 font-medium">{t("loading")}</p>
    </div>
  );
}
