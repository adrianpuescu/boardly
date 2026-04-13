"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface TimeControl {
  type: "unlimited" | "per_turn" | "per_game";
  minutes?: number;
}

interface JoinPageClientProps {
  token: string;
  gameId: string;
  inviterName: string;
  timeControl: TimeControl;
  isLoggedIn: boolean;
}

function formatTimeControl(tc: TimeControl): string {
  if (tc.type === "unlimited") return "Unlimited time";
  if (tc.type === "per_turn") return `${tc.minutes} min per move`;
  if (tc.type === "per_game") return `${tc.minutes} min per player`;
  return "Unknown";
}

// ── Chess board preview decoration ─────────────────────────────────────────
function MiniBoard() {
  return (
    <div className="grid grid-cols-4 grid-rows-4 w-16 h-16 rounded-xl overflow-hidden opacity-60 flex-shrink-0">
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className={
            (Math.floor(i / 4) + (i % 4)) % 2 === 0
              ? "bg-amber-800"
              : "bg-amber-100"
          }
        />
      ))}
    </div>
  );
}

export default function JoinPageClient({
  token,
  gameId,
  inviterName,
  timeControl,
  isLoggedIn,
}: JoinPageClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      router.push(`/game/${data.gameId}`);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #FAF7F2 0%, #FFF3E0 50%, #FAF7F2 100%)",
      }}
    >
      {/* Decorative blobs */}
      <div className="absolute top-0 -left-20 w-72 h-72 bg-orange-200 rounded-full blur-3xl opacity-20 pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-amber-200 rounded-full blur-3xl opacity-20 pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <Link
            href="/"
            className="text-4xl font-black text-gray-900 tracking-tight hover:text-orange-500 transition-colors"
            style={{ fontFamily: "var(--font-nunito), sans-serif" }}
          >
            Boardly
          </Link>
          <p className="mt-1 text-sm text-gray-500 font-medium">
            Chess with friends ♟
          </p>
        </div>

        {/* Challenge card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-orange-100/60 p-7 space-y-6 border border-orange-50">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="text-5xl mb-2">♟️</div>
            <h1 className="text-2xl font-black text-gray-900">
              You&apos;re invited!
            </h1>
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-orange-600">{inviterName}</span>
              {" "}is challenging you to a game of chess.
            </p>
          </div>

          {/* Game details */}
          <div className="flex items-center gap-4 bg-orange-50 rounded-2xl px-4 py-3 border border-orange-100">
            <MiniBoard />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Time control
              </p>
              <p className="font-bold text-gray-800">
                {timeControl.type === "unlimited" ? "♾️" : timeControl.type === "per_turn" ? "⏱️" : "⏰"}
                {" "}{formatTimeControl(timeControl)}
              </p>
              <p className="text-xs text-gray-500">
                You&apos;ll play as{" "}
                <span className="font-semibold text-gray-700">Black ♙</span>
              </p>
            </div>
          </div>

          {/* CTA */}
          {isLoggedIn ? (
            <div className="space-y-3">
              <Button
                onClick={handleAccept}
                disabled={loading}
                className="w-full h-12 rounded-xl text-base font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-200 transition-all"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
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
                    Joining…
                  </span>
                ) : (
                  "Accept challenge 🤝"
                )}
              </Button>

              <button
                onClick={() => router.push(`/game/${gameId}`)}
                className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
              >
                View game without joining
              </button>

              {error && (
                <p className="text-sm text-red-500 text-center font-medium">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Link
                href={`/login?redirectTo=/join/${token}`}
                className="block"
              >
                <Button className="w-full h-12 rounded-xl text-base font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-200 transition-all">
                  Sign in to join ✨
                </Button>
              </Link>
              <p className="text-center text-xs text-gray-400">
                Free to join — no credit card needed.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 font-medium">
          Boardly &nbsp;·&nbsp; Chess with friends, your rules, your pace.
        </p>
      </div>
    </div>
  );
}
