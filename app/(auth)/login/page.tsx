"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function KnightIllustration() {
  return (
    <div className="relative flex select-none items-center justify-start">
      <div className="absolute h-32 w-32 rounded-full bg-orange-200 opacity-30 blur-xl" />

      <div className="relative z-10 animate-float">
        <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-orange-400 to-orange-600 shadow-2xl ring-4 ring-orange-200">
          <svg
            viewBox="0 0 45 45"
            className="h-16 w-16 drop-shadow-md"
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

      <span
        className="absolute right-6 top-1 text-lg animate-bounce"
        style={{ animationDelay: "0.2s" }}
      >
        ✨
      </span>
      <span
        className="absolute bottom-2 left-6 text-sm animate-bounce"
        style={{ animationDelay: "0.6s" }}
      >
        ⭐
      </span>
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  function callbackUrl() {
    const next = encodeURIComponent(redirectTo);
    return `${window.location.origin}/auth/callback?next=${next}`;
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setMagicLinkLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });

    setMagicLinkLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  async function handleAnonymousSignIn() {
    setGuestLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInAnonymously();

    if (error) {
      setError(error.message);
      setGuestLoading(false);
      return;
    }

    router.push("/lobby");
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });

    if (error) {
      setError(error.message);
    }
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 40%, #FFF8F0 0%, #F5EFE6 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgba(255,160,64,0.12) 25%, transparent 25%, transparent 75%, rgba(255,160,64,0.12) 75%), linear-gradient(45deg, rgba(255,160,64,0.12) 25%, transparent 25%, transparent 75%, rgba(255,160,64,0.12) 75%)",
          backgroundSize: "48px 48px",
          backgroundPosition: "0 0, 24px 24px",
          animation: "chess-drift 24s linear infinite",
        }}
      />
      <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-orange-200 opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-amber-200 opacity-20 blur-3xl" />

      <main className="relative z-10 mx-auto w-full max-w-7xl px-10 py-10 md:px-16 lg:px-20 md:py-12">
        <div className="relative mt-8 flex flex-col gap-12 md:mt-0 md:flex-row md:items-center md:gap-20">
          <div className="flex items-center gap-4 md:absolute md:bottom-full md:left-0 md:mb-2">
            <KnightIllustration />
            <p
              className="text-5xl font-black leading-none tracking-tight text-gray-900 sm:text-6xl"
              style={{
                fontFamily: "var(--font-nunito), sans-serif",
                letterSpacing: "-1px",
              }}
            >
              Boardly
            </p>
          </div>

          <section className="relative flex flex-1 flex-col items-start justify-start space-y-8 text-left md:space-y-9">
            <h1
              className="max-w-xl text-3xl font-black leading-tight text-gray-800 sm:text-4xl"
              style={{ fontFamily: "var(--font-nunito), sans-serif" }}
            >
              Play board games with friends, your way.
            </h1>

            <ul className="space-y-3 text-base font-semibold text-gray-700 sm:text-xl">
              <li className="flex items-center gap-3">
                <span aria-hidden="true" className="text-xl">
                  ♟️
                </span>
                <span>Chess and more — new games coming soon</span>
              </li>
              <li className="flex items-center gap-3">
                <span aria-hidden="true" className="text-xl">
                  ⚡
                </span>
                <span>Play multiple games simultaneously</span>
              </li>
              <li className="flex items-center gap-3">
                <span aria-hidden="true" className="text-xl">
                  🌍
                </span>
                <span>Challenge anyone, anywhere, anytime</span>
              </li>
            </ul>

            <div className="space-y-3">
              <Button
                type="button"
                onClick={handleAnonymousSignIn}
                disabled={guestLoading}
                className="h-14 w-full max-w-md rounded-2xl bg-orange-500 px-5 text-base font-extrabold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:bg-orange-600 sm:text-lg"
                style={{ fontFamily: "var(--font-nunito), sans-serif" }}
              >
                {guestLoading ? "Entering lobby..." : "Play now — no account needed"}
              </Button>
              <p className="text-sm text-gray-500">
                Or sign in to save your progress and stats
              </p>
            </div>
          </section>

          <section className="relative w-full md:max-w-lg">
            <div className="pointer-events-none absolute -left-20 top-1/2 z-0 hidden w-56 -translate-y-1/2 -rotate-6 lg:block">
              <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-orange-200/45 via-amber-100/35 to-transparent blur-lg" />
              <div className="relative overflow-hidden rounded-2xl border border-orange-100/80 bg-white shadow-xl shadow-orange-200/55">
                <Image
                  src="/images/chess-preview.png"
                  alt="Boardly chess game preview"
                  width={1600}
                  height={900}
                  className="h-auto w-full object-cover"
                />
              </div>
            </div>
            <div className="relative z-10 rounded-3xl border-2 border-orange-100 bg-white/95 p-6 shadow-xl shadow-orange-100/80 backdrop-blur-sm sm:p-8">
            {sent ? (
              <div className="space-y-4 text-center">
                <div aria-hidden="true" className="text-5xl">
                  📬
                </div>
                <h2
                  className="text-2xl font-black text-gray-900"
                  style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                >
                  Check your inbox
                </h2>
                <p className="text-sm leading-relaxed text-gray-600">
                  We sent a magic link to{" "}
                  <span className="font-semibold text-orange-600">{email}</span>. Open
                  it to continue.
                </p>
                <button
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                  }}
                  className="text-sm font-semibold text-orange-600 underline underline-offset-4 transition-colors hover:text-orange-700"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <>
                <h2
                  className="text-3xl font-black text-gray-900"
                  style={{ fontFamily: "var(--font-nunito), sans-serif" }}
                >
                  Sign in
                </h2>
                <p className="mt-1 text-sm text-gray-500">No password needed.</p>

                <form onSubmit={handleMagicLink} className="mt-5 space-y-3">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 rounded-xl border-gray-200 bg-gray-50/50 text-base focus:border-orange-400 focus:ring-orange-400"
                  />
                  <Button
                    type="submit"
                    disabled={magicLinkLoading}
                    className="h-12 w-full rounded-xl bg-gray-900 text-base font-extrabold text-white transition hover:bg-gray-800"
                  >
                    {magicLinkLoading ? "Sending..." : "Send magic link"}
                  </Button>
                </form>

                <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span>or</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                <Button
                  type="button"
                  onClick={handleGoogle}
                  variant="outline"
                  className="h-12 w-full rounded-xl border-2 border-gray-200 text-sm font-bold transition hover:bg-gray-50"
                >
                  Continue with Google
                </Button>

                <button
                  type="button"
                  onClick={handleAnonymousSignIn}
                  disabled={guestLoading}
                  className="mt-4 text-sm font-medium text-gray-500 underline underline-offset-4 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {guestLoading ? "Continuing as guest..." : "Continue as guest"}
                </button>
              </>
            )}

            {error && <p className="mt-4 text-sm font-medium text-red-500">{error}</p>}
            </div>

            <p className="mt-5 text-xs text-gray-400">
              By continuing, you agree to Boardly&apos;s terms and privacy policy.
            </p>
          </section>
        </div>
      </main>
      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes chess-drift {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-48px, -48px, 0);
          }
        }

        .animate-float {
          animation: float 4.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
