"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { createClient } from "@/lib/supabase/client";
import { guestReachedGameLimit, incrementGuestGamesCount } from "@/lib/guestLimits";

// ── Types ──────────────────────────────────────────────────────────────────
type TimeControlType = "unlimited" | "per_turn" | "per_game";
type PlayMode = "friend" | "bot";

const BOT_DIFFICULTY_PRESETS = [
  { level: 3, labelKey: "botDifficultyEasy" as const },
  { level: 8, labelKey: "botDifficultyMedium" as const },
  { level: 15, labelKey: "botDifficultyHard" as const },
  { level: 1, labelKey: "botDifficultyBeginner" as const },
];

interface TimeControl {
  type: TimeControlType;
  minutes?: number;
}

interface FriendChip {
  id: string;
  username: string;
  avatar_url: string | null;
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
  const opponentIdFromQuery = searchParams.get("opponentId") ?? "";
  const opponentNameFromQuery = searchParams.get("opponentName") ?? "";

  const [opponentEmail, setOpponentEmail] = useState("");
  const [gameName, setGameName] = useState("");
  const [selectedOpponentId, setSelectedOpponentId] = useState(
    () => opponentIdFromQuery
  );
  const [selectedOpponentName, setSelectedOpponentName] = useState(() => opponentNameFromQuery);

  useEffect(() => {
    setSelectedOpponentId(opponentIdFromQuery);
    setSelectedOpponentName(opponentNameFromQuery);
  }, [opponentIdFromQuery, opponentNameFromQuery]);
  const [selectedType, setSelectedType] = useState<TimeControlType>("unlimited");
  const [perTurnMinutes, setPerTurnMinutes] = useState(10);
  const [perGameMinutes, setPerGameMinutes] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdGame, setCreatedGame] = useState<{ gameId: string; inviteToken: string } | null>(null);
  const [isAnonymousUser, setIsAnonymousUser] = useState(false);
  const [guestLimitReached, setGuestLimitReached] = useState(false);
  const [friends, setFriends] = useState<FriendChip[]>([]);
  const [playMode, setPlayMode] = useState<PlayMode>("friend");
  const [botDifficulty, setBotDifficulty] = useState(8);

  useEffect(() => {
    let cancelled = false;

    async function detectAnonymousUser() {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const anonymous = !!data.user?.is_anonymous;
      if (cancelled) return;
      setIsAnonymousUser(anonymous);
      setGuestLimitReached(anonymous && guestReachedGameLimit());
    }

    void detectAnonymousUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFriends() {
      try {
        const res = await fetch("/api/friends", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          friends?: Array<{
            id: string;
            username: string;
            avatar_url: string | null;
          }>;
        };
        if (!cancelled) {
          setFriends(data.friends ?? []);
        }
      } catch {
        // Friend chips are optional in lobby setup.
      }
    }

    void loadFriends();
    return () => {
      cancelled = true;
    };
  }, []);

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
          name: gameName.trim() || undefined,
          timeControl: getTimeControl(),
          ...(playMode === "bot"
            ? { vsBot: true, botDifficulty }
            : {
                opponentEmail: opponentEmail.trim() || undefined,
                opponentId: selectedOpponentId || undefined,
              }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("somethingWentWrong"));
        return;
      }

      if (data.inviteToken) {
        if (isAnonymousUser) {
          incrementGuestGamesCount();
          setGuestLimitReached(guestReachedGameLimit());
        }
        setCreatedGame({ gameId: data.gameId, inviteToken: data.inviteToken });
      } else {
        if (isAnonymousUser) {
          incrementGuestGamesCount();
          setGuestLimitReached(guestReachedGameLimit());
        }
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
        <Button
          type="button"
          variant="ghost"
          onClick={() => (createdGame ? setCreatedGame(null) : router.push("/dashboard"))}
          className="mb-8 h-auto -ml-1 gap-1.5 self-start px-2 text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">{t("back")}</span>
        </Button>

        {/* Share step — shown after successful game creation */}
        <AnimatePresence mode="wait">
          {createdGame && (
            <ShareStep
              inviteToken={createdGame.inviteToken}
              onGoToGame={() => router.push(`/game/${createdGame.gameId}`)}
            />
          )}
        </AnimatePresence>

        {createdGame ? null : guestLimitReached ? (
          <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-md shadow-orange-100/60">
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              {t("guestLimitTitle")}
            </h2>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              {t("guestLimitMessage")}
            </p>
            <Link href="/login" className="mt-5 block">
              <Button className="h-12 w-full rounded-xl bg-orange-500 text-base font-bold text-white hover:bg-orange-600">
                {t("guestLimitCreateAccount")}
              </Button>
            </Link>
          </div>
        ) : (
          <>
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            {t("newGame")}
          </h1>
          <p className="mt-1 text-gray-500">{t("setupChallenge")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Play mode (friend / bot) ───────────────────────── */}
          <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50 space-y-4">
            <div className="flex rounded-2xl border border-gray-100 bg-orange-50/50 p-1 gap-1">
              <button
                type="button"
                onClick={() => setPlayMode("friend")}
                className={`flex-1 rounded-xl py-3 px-3 text-sm font-bold transition-colors ${
                  playMode === "friend"
                    ? "bg-white text-orange-700 shadow-sm ring-1 ring-orange-100"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("playVsFriend")}
              </button>
              <button
                type="button"
                onClick={() => setPlayMode("bot")}
                className={`flex-1 rounded-xl py-3 px-3 text-sm font-bold transition-colors ${
                  playMode === "bot"
                    ? "bg-white text-orange-700 shadow-sm ring-1 ring-orange-100"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("playVsBot")}
              </button>
            </div>

            {playMode === "bot" && (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-gray-500 leading-relaxed">{t("botModeHint")}</p>
                <p className="text-sm font-semibold text-gray-700">{t("botDifficulty")}</p>
                <RadioGroup
                  value={String(botDifficulty)}
                  onValueChange={(v) => setBotDifficulty(Number(v))}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {BOT_DIFFICULTY_PRESETS.map((preset) => (
                    <label
                      key={preset.level}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2.5 transition-colors ${
                        botDifficulty === preset.level
                          ? "border-orange-400 bg-orange-50"
                          : "border-gray-100 hover:border-orange-200 bg-white"
                      }`}
                    >
                      <RadioGroupItem value={String(preset.level)} className="border-gray-300" />
                      <span className="text-sm font-semibold text-gray-800">
                        {t(preset.labelKey)}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}
          </section>

          {/* ── Game name ──────────────────────────────────────── */}
          <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">
                {t("gameName")}{" "}
                <span className="text-gray-400 font-normal">{t("optional")}</span>
              </span>
              <Input
                type="text"
                placeholder={t("gameNamePlaceholder")}
                maxLength={50}
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                className="h-11 rounded-xl border-gray-200 focus:border-orange-400 focus:ring-orange-400"
              />
              <p className="text-xs text-gray-400 text-right tabular-nums">
                {t("gameNameCount", { current: gameName.length, max: 50 })}
              </p>
            </label>
          </section>

          {/* ── Opponent ───────────────────────────────────────── */}
          {playMode === "friend" && (
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
              {!opponentEmail.trim() && (selectedOpponentId || selectedOpponentName) && (
                <p className="text-xs text-orange-600">
                  {selectedOpponentName
                    ? `Inviting ${selectedOpponentName}. Add an email only if you want to override this opponent.`
                    : "Inviting your previous opponent. Add an email only if you want to override this opponent."}
                </p>
              )}
              <p className="text-xs text-gray-400">
                {t("friendEmailHint")}
              </p>
            </label>
            {friends.length > 0 && (
              <div className="pt-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {t("inviteFriend")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {friends.map((friend) => (
                    <Button
                      key={friend.id}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelectedOpponentId(friend.id);
                        setSelectedOpponentName(friend.username);
                        setOpponentEmail("");
                      }}
                      className={`h-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-normal ${
                        selectedOpponentId === friend.id && !opponentEmail.trim()
                          ? "border-orange-400 bg-orange-50 text-orange-700"
                          : "border-orange-100 bg-white text-gray-700 hover:bg-orange-50"
                      }`}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-700">
                        {friend.username.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-medium">{friend.username}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </section>
          )}

          {/* ── Time control ───────────────────────────────────── */}
          <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50 space-y-4">
            <h2 className="text-base font-bold text-gray-800">{t("timeControl")}</h2>

            <RadioGroup
              value={selectedType}
              onValueChange={(v) => setSelectedType(v as TimeControlType)}
              className="space-y-3"
            >
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
                  <motion.label
                    key={card.type}
                    layout
                    className={`block rounded-2xl border-2 p-4 cursor-pointer transition-colors select-none ${
                      isSelected
                        ? "border-orange-400 bg-orange-50"
                        : "border-gray-100 hover:border-orange-200 hover:bg-orange-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem
                        value={card.type}
                        className="mt-0.5 border-2 border-gray-300 data-[checked]:border-orange-500 data-[checked]:bg-orange-500 dark:data-[checked]:bg-orange-500"
                        aria-label={meta.label}
                      />

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
                                onPointerDown={(e) => e.stopPropagation()}
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
                  </motion.label>
                );
              })}
            </RadioGroup>
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
