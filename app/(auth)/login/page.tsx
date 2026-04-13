"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ─── Animated chess knight SVG ──────────────────────────────────────────── */
function KnightIllustration() {
  return (
    <div className="relative flex items-center justify-center mb-2 select-none">
      {/* Outer glow ring */}
      <div className="absolute w-32 h-32 rounded-full bg-orange-200 opacity-30 blur-xl" />

      {/* Floating piece */}
      <div className="animate-float relative z-10">
        {/* Board square tiles behind the piece */}
        <div className="absolute -inset-3 grid grid-cols-4 grid-rows-4 opacity-20 rounded-2xl overflow-hidden pointer-events-none">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className={(Math.floor(i / 4) + (i % 4)) % 2 === 0 ? "bg-amber-800" : "bg-amber-100"}
            />
          ))}
        </div>

        {/* Knight piece circle */}
        <div className="w-28 h-28 rounded-[2rem] bg-gradient-to-br from-orange-400 to-orange-600 shadow-2xl flex items-center justify-center ring-4 ring-orange-200">
          {/* Chess knight SVG */}
          <svg
            viewBox="0 0 45 45"
            className="w-16 h-16 drop-shadow-md"
            aria-hidden="true"
          >
            <g fill="none" fillRule="evenodd">
              <path
                d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"
                fill="#fff"
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M24 18c.38 5.12-2.78 9.23-8 9.5-5.5.3-9.5-4.08-8.5-9.5l.5-5c.17-.9.5-1.7 1.09-2.44A4.8 4.8 0 0 1 13 8.5c-.8-1.11-.72-2.7.06-3.7.64-.83 1.6-1.3 2.56-1.3 1 0 2 .5 2.5 1.5.5 1 .5 2.5.5 4.5 2.5-.5 4 1.5 4 3.5l-.62 5z"
                fill="#fff"
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm5.4-7.7a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"
                fill="#c85000"
              />
            </g>
          </svg>
        </div>
      </div>

      {/* Sparkles */}
      <span className="absolute top-1 right-6 text-lg animate-bounce" style={{ animationDelay: "0.2s" }}>✨</span>
      <span className="absolute bottom-2 left-6 text-sm animate-bounce" style={{ animationDelay: "0.6s" }}>⭐</span>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  async function handleGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #FAF7F2 0%, #FFF3E0 50%, #FAF7F2 100%)" }}
    >
      {/* Faint animated chess background */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none chess-bg"
        aria-hidden="true"
      />

      {/* Decorative blobs */}
      <div className="absolute top-0 -left-20 w-72 h-72 bg-orange-200 rounded-full blur-3xl opacity-20 pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-amber-200 rounded-full blur-3xl opacity-20 pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 animate-fade-up">
        {/* Logo & branding */}
        <div className="text-center mb-8">
          <KnightIllustration />

          <h1
            className="text-6xl font-black text-gray-900 mt-5 leading-none tracking-tight"
            style={{ fontFamily: "var(--font-nunito), sans-serif", letterSpacing: "-1px" }}
          >
            Boardly
          </h1>
          <p
            className="mt-3 text-base text-gray-500 font-semibold"
            style={{ fontFamily: "var(--font-nunito), sans-serif" }}
          >
            Chess with friends ♟ &nbsp;Your rules. Your pace.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-orange-100/60 p-7 space-y-5 border border-orange-50">
          {sent ? (
            <div className="text-center py-4 space-y-4">
              <div className="text-6xl animate-bounce">📬</div>
              <h2
                className="text-2xl font-black text-gray-900"
                style={{ fontFamily: "var(--font-nunito), sans-serif" }}
              >
                Check your inbox!
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Magic link sent to{" "}
                <span className="font-bold text-orange-500">{email}</span>.
                <br />
                Click it to jump right in. 🚀
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="mt-2 text-sm text-orange-500 hover:text-orange-600 font-semibold underline underline-offset-4 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <h2
                  className="text-2xl font-black text-gray-900"
                  style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                >
                  Let&apos;s get you in! 👋
                </h2>
                <p className="text-sm text-gray-500">
                  No password needed — just a magic link.
                </p>
              </div>

              <form onSubmit={handleMagicLink} className="space-y-3">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl text-base border-gray-200 focus:border-orange-400 focus:ring-orange-400 bg-gray-50/50"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl text-base font-bold bg-orange-500 hover:bg-orange-600 active:scale-95 text-white transition-all shadow-md shadow-orange-200 hover:shadow-lg hover:shadow-orange-200"
                  style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
                      </svg>
                      Sending…
                    </span>
                  ) : (
                    "Send me a magic link ✨"
                  )}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-white text-gray-400 font-medium">or continue with</span>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleGoogle}
                variant="outline"
                className="w-full h-12 rounded-xl text-sm font-semibold border-gray-200 hover:bg-gray-50 hover:border-gray-300 active:scale-95 transition-all flex items-center gap-3"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </Button>

              {error && (
                <p className="text-sm text-red-500 text-center font-medium">{error}</p>
              )}
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 font-medium">
          By signing in you agree to our terms &nbsp;·&nbsp; Games are meant to be fun 🎉
        </p>
      </div>
    </div>
  );
}
