"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo & branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-orange-500 shadow-lg mb-4">
            <span className="text-4xl" role="img" aria-label="board game">
              🎲
            </span>
          </div>
          <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">
            Boardly
          </h1>
          <p className="mt-3 text-lg text-gray-500 font-medium">
            Play board games with friends, your way.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
          {sent ? (
            <div className="text-center py-4 space-y-3">
              <div className="text-5xl">📬</div>
              <h2 className="text-xl font-bold text-gray-900">
                Check your inbox!
              </h2>
              <p className="text-gray-500">
                We sent a magic link to{" "}
                <span className="font-semibold text-orange-500">{email}</span>.
                <br />
                Click it to jump right in.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="mt-4 text-sm text-orange-500 hover:text-orange-600 underline underline-offset-4 transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              {/* Magic link form */}
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-gray-900">
                  Let&apos;s get you in 👋
                </h2>
                <p className="text-sm text-gray-500">
                  No password needed — we&apos;ll send you a magic link.
                </p>
              </div>

              <form onSubmit={handleMagicLink} className="space-y-3">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl text-base border-gray-200 focus:border-orange-400 focus:ring-orange-400"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl text-base font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                >
                  {loading ? "Sending…" : "Send me a link ✨"}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-gray-400">or</span>
                </div>
              </div>

              {/* Google OAuth */}
              <Button
                type="button"
                onClick={handleGoogle}
                variant="outline"
                className="w-full h-12 rounded-xl text-base font-medium border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-3"
              >
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </Button>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          By signing in you agree to our terms. Games are meant to be fun 🎉
        </p>
      </div>
    </div>
  );
}
