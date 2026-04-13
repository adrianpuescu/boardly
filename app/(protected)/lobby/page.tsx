"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

// ── Types ──────────────────────────────────────────────────────────────────
type TimeControlType = "unlimited" | "per_turn" | "per_game";

interface TimeControl {
  type: TimeControlType;
  minutes?: number;
}

// ── Time-control card config ───────────────────────────────────────────────
const TIME_CARDS = [
  {
    type: "unlimited" as const,
    emoji: "♾️",
    label: "Unlimited",
    description: "Play at your own pace, no pressure",
    hasSlider: false,
  },
  {
    type: "per_turn" as const,
    emoji: "⏱️",
    label: "Per turn",
    description: "Each player gets N minutes per move",
    hasSlider: true,
    min: 1,
    max: 60,
    defaultMinutes: 10,
    unit: "min / move",
  },
  {
    type: "per_game" as const,
    emoji: "⏰",
    label: "Per game",
    description: "Each player gets N minutes total",
    hasSlider: true,
    min: 5,
    max: 180,
    defaultMinutes: 30,
    unit: "min total",
  },
] as const;

// ── Component ──────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const router = useRouter();

  const [opponentEmail, setOpponentEmail] = useState("");
  const [selectedType, setSelectedType] = useState<TimeControlType>("unlimited");
  const [perTurnMinutes, setPerTurnMinutes] = useState(10);
  const [perGameMinutes, setPerGameMinutes] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getTimeControl(): TimeControl {
    if (selectedType === "per_turn") return { type: "per_turn", minutes: perTurnMinutes };
    if (selectedType === "per_game") return { type: "per_game", minutes: perGameMinutes };
    return { type: "unlimited" };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opponentEmail: opponentEmail.trim() || undefined,
          timeControl: getTimeControl(),
        }),
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
    <div className="min-h-screen px-4 py-8" style={{ background: "linear-gradient(160deg, #FAF7F2 0%, #FFF8F0 50%, #FAF7F2 100%)" }}>
      <div className="max-w-lg mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm font-medium">Back</span>
        </button>

        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            New Game
          </h1>
          <p className="mt-1 text-gray-500">Set up your challenge</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Opponent ───────────────────────────────────────── */}
          <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50 space-y-3">
            <h2 className="text-base font-bold text-gray-800">Opponent</h2>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">
                Friend&apos;s email{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </span>
              <Input
                type="email"
                placeholder="friend@example.com"
                value={opponentEmail}
                onChange={(e) => setOpponentEmail(e.target.value)}
                className="h-11 rounded-xl border-gray-200 focus:border-orange-400 focus:ring-orange-400"
              />
              <p className="text-xs text-gray-400">
                We&apos;ll send them an invite link — or they can join without
                an account.
              </p>
            </label>
          </section>

          {/* ── Time control ───────────────────────────────────── */}
          <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50 space-y-4">
            <h2 className="text-base font-bold text-gray-800">Time Control</h2>

            <div className="space-y-3">
              {TIME_CARDS.map((card) => {
                const isSelected = selectedType === card.type;
                const currentMinutes =
                  card.type === "per_turn"
                    ? perTurnMinutes
                    : card.type === "per_game"
                    ? perGameMinutes
                    : null;

                return (
                  <motion.div
                    key={card.type}
                    layout
                    onClick={() => setSelectedType(card.type)}
                    className={`rounded-2xl border-2 p-4 cursor-pointer transition-colors select-none ${
                      isSelected
                        ? "border-orange-400 bg-orange-50"
                        : "border-gray-100 hover:border-orange-200 hover:bg-orange-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Radio dot */}
                      <div
                        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          isSelected
                            ? "border-orange-500 bg-orange-500"
                            : "border-gray-300"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg leading-none">
                            {card.emoji}
                          </span>
                          <span className="font-semibold text-gray-900">
                            {card.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {card.description}
                        </p>

                        {/* Slider — shown only when card is selected */}
                        <AnimatePresence initial={false}>
                          {isSelected && card.hasSlider && currentMinutes !== null && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div
                                className="mt-4 space-y-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">
                                    {card.min} min
                                  </span>
                                  <span className="text-sm font-bold text-orange-600 tabular-nums">
                                    {currentMinutes} {card.unit}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {card.max} min
                                  </span>
                                </div>
                                <Slider
                                  min={card.min}
                                  max={card.max}
                                  step={card.type === "per_turn" ? 1 : 5}
                                  value={[currentMinutes]}
                                  onValueChange={(raw) => {
                                    const val = Array.isArray(raw)
                                      ? raw[0]
                                      : (raw as number);
                                    if (card.type === "per_turn")
                                      setPerTurnMinutes(val);
                                    else setPerGameMinutes(val);
                                  }}
                                  className="[&_[role=slider]]:bg-orange-500 [&_[role=slider]]:border-orange-500 [&_.bg-primary]:bg-orange-500"
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* ── Submit ─────────────────────────────────────────── */}
          <div className="space-y-3">
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-13 rounded-2xl text-base font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-60 py-3"
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
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Creating game…
                </span>
              ) : (
                "Create Game 🎲"
              )}
            </Button>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="text-sm text-red-500 text-center"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </form>
      </div>
    </div>
  );
}
