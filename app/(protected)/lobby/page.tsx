"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";
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
const TIME_CARD_CONFIG = [
  {
    type: "unlimited" as const,
    emoji: "♾️",
    hasSlider: false,
  },
  {
    type: "per_turn" as const,
    emoji: "⏱️",
    hasSlider: true,
    min: 1,
    max: 60,
    defaultMinutes: 10,
  },
  {
    type: "per_game" as const,
    emoji: "⏰",
    hasSlider: true,
    min: 5,
    max: 180,
    defaultMinutes: 30,
  },
] as const;

// ── Share step ─────────────────────────────────────────────────────────────
interface ShareStepProps {
  gameId: string;
  inviteToken: string;
  onGoToGame: () => void;
}

function ShareStep({ inviteToken, onGoToGame }: ShareStepProps) {
  const t = useTranslations("lobby");
  const [copied, setCopied] = useState(false);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const inviteUrl = `${appUrl}/join/${inviteToken}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers that block clipboard without user gesture
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Icon */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-orange-100 text-4xl mb-4 shadow-sm">
          🔗
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
          {t("gameCreated")}
        </h2>
        <p className="mt-1 text-gray-500 text-sm">
          {t("shareLink")}
        </p>
      </div>

      {/* Link box */}
      <div className="bg-white rounded-3xl p-5 shadow-md border border-orange-50 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {t("inviteLink")}
        </p>
        <div className="flex items-center gap-2 bg-orange-50 rounded-xl px-4 py-3 border border-orange-100">
          <span className="flex-1 text-sm text-gray-700 font-mono truncate select-all">
            {inviteUrl}
          </span>
        </div>
        <Button
          type="button"
          onClick={handleCopy}
          className={`w-full h-11 rounded-xl font-bold transition-all ${
            copied
              ? "bg-green-500 hover:bg-green-500 text-white"
              : "bg-orange-500 hover:bg-orange-600 text-white"
          }`}
        >
          {copied ? (
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              {t("copied")}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Copy className="w-4 h-4" />
              {t("copyLink")}
            </span>
          )}
        </Button>
      </div>

      {/* Go to game */}
      <Button
        type="button"
        onClick={onGoToGame}
        variant="outline"
        className="w-full h-11 rounded-xl font-bold border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-700 transition-all flex items-center gap-2"
      >
        <ExternalLink className="w-4 h-4" />
        {t("goToGame")}
      </Button>
    </motion.div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("lobby");

  const [opponentEmail, setOpponentEmail] = useState(
    () => searchParams.get("opponentEmail") ?? ""
  );

  useEffect(() => {
    setOpponentEmail(searchParams.get("opponentEmail") ?? "");
  }, [searchParams]);
  const [selectedType, setSelectedType] = useState<TimeControlType>("unlimited");
  const [perTurnMinutes, setPerTurnMinutes] = useState(10);
  const [perGameMinutes, setPerGameMinutes] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdGame, setCreatedGame] = useState<{ gameId: string; inviteToken: string } | null>(null);

  // Card label/description/unit derived from translations
  const cardMeta: Record<TimeControlType, { label: string; description: string; unit?: string }> = {
    unlimited: { label: t("unlimited"), description: t("unlimitedDesc") },
    per_turn: { label: t("perTurn"), description: t("perTurnDesc"), unit: t("perTurnUnit") },
    per_game: { label: t("perGame"), description: t("perGameDesc"), unit: t("perGameUnit") },
  };

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
        setError(data.error ?? t("somethingWentWrong"));
        return;
      }

      if (data.inviteToken) {
        setCreatedGame({ gameId: data.gameId, inviteToken: data.inviteToken });
      } else {
        router.push(`/game/${data.gameId}`);
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "linear-gradient(160deg, #FAF7F2 0%, #FFF8F0 50%, #FAF7F2 100%)" }}>
      <div className="max-w-lg mx-auto">
        {/* Back button */}
        <button
          onClick={() => createdGame ? setCreatedGame(null) : router.push("/dashboard")}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm font-medium">{t("back")}</span>
        </button>

        {/* Share step — shown after successful game creation */}
        <AnimatePresence mode="wait">
          {createdGame && (
            <ShareStep
              gameId={createdGame.gameId}
              inviteToken={createdGame.inviteToken}
              onGoToGame={() => router.push(`/game/${createdGame.gameId}`)}
            />
          )}
        </AnimatePresence>

        {createdGame ? null : (
          <>
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            {t("newGame")}
          </h1>
          <p className="mt-1 text-gray-500">{t("setupChallenge")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Opponent ───────────────────────────────────────── */}
          <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50 space-y-3">
            <h2 className="text-base font-bold text-gray-800">{t("opponent")}</h2>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">
                {t("friendsEmail")}{" "}
                <span className="text-gray-400 font-normal">{t("optional")}</span>
              </span>
              <Input
                type="email"
                placeholder={t("friendEmailPlaceholder")}
                value={opponentEmail}
                onChange={(e) => setOpponentEmail(e.target.value)}
                className="h-11 rounded-xl border-gray-200 focus:border-orange-400 focus:ring-orange-400"
              />
              <p className="text-xs text-gray-400">
                {t("friendEmailHint")}
              </p>
            </label>
          </section>

          {/* ── Time control ───────────────────────────────────── */}
          <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50 space-y-4">
            <h2 className="text-base font-bold text-gray-800">{t("timeControl")}</h2>

            <div className="space-y-3">
              {TIME_CARD_CONFIG.map((card) => {
                const isSelected = selectedType === card.type;
                const meta = cardMeta[card.type];
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
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {meta.description}
                        </p>

                        {/* Slider — shown only when card is selected */}
                        <AnimatePresence initial={false}>
                          {isSelected && card.hasSlider && currentMinutes !== null && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              style={{ overflow: "hidden" }}
                            >
                              <div
                                className="mt-4 space-y-3 px-2 pb-5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">
                                    {card.min} {t("min")}
                                  </span>
                                  <span className="text-sm font-bold text-orange-600 tabular-nums">
                                    {currentMinutes} {meta.unit}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {card.max} {t("min")}
                                  </span>
                                </div>
                                <Slider
                                  min={card.min}
                                  max={card.max}
                                  step={card.type === "per_turn" ? 1 : 5}
                                  value={[currentMinutes]}
                                  onValueChange={(val) => {
                                    if (card.type === "per_turn")
                                      setPerTurnMinutes(val[0]);
                                    else setPerGameMinutes(val[0]);
                                  }}
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
                  {t("creating")}
                </span>
              ) : (
                t("createGame")
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
        </>
        )}
      </div>
    </div>
  );
}
