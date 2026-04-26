"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Pencil, X, Camera, ArrowLeft, Loader2, Lock } from "lucide-react";
import { countries } from "countries-list";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProfileBadge, ProfileStats, RecentGame } from "@/lib/types";

interface ProfileData {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
  elo_rating: number;
  country: string | null;
  city: string | null;
  continent: string | null;
}

interface Props {
  profile: ProfileData;
  stats: ProfileStats;
  recentGames: RecentGame[];
  badges: ProfileBadge[];
  email: string;
  isOwnProfile?: boolean;
}

type PopoverFriendStatus =
  | "none"
  | "friends"
  | "pending"
  | "declined_by_you"
  | "declined_by_them";

const USERNAME_RE = /^[a-zA-Z0-9._]+$/;
const CONTINENT_NAMES: Record<string, string> = {
  AF: "Africa",
  AN: "Antarctica",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
};

const COUNTRY_OPTIONS: Array<{ code: string; label: string; continent: string }> = Object
  .entries(countries as Record<string, { name: string; continent: string }>)
  .map(([code, data]) => ({
    code,
    label: data.name,
    continent: CONTINENT_NAMES[data.continent] ?? data.continent,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

function formatMemberSince(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(
    locale === "ro" ? "ro-RO" : locale === "es" ? "es-ES" : "en-US",
    {
      month: "long",
      year: "numeric",
    }
  );
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(
    locale === "ro" ? "ro-RO" : locale === "es" ? "es-ES" : "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

function formatTimeControl(
  tc: { type: string; minutes?: number },
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  if (tc.type === "unlimited") return t("unlimited");
  if (tc.type === "per_turn") return t("minPerMove", { minutes: tc.minutes ?? 0 });
  if (tc.type === "per_game") return t("minPerGame", { minutes: tc.minutes ?? 0 });
  return tc.type;
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({
  avatarUrl,
  username,
  size = 80,
}: {
  avatarUrl: string | null;
  username: string;
  size?: number;
}) {
  const [error, setError] = useState(false);
  const initials = username.slice(0, 2).toUpperCase();

  if (avatarUrl && !error) {
    return (
      <div
        className="relative rounded-full ring-4 ring-orange-200 overflow-hidden flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src={avatarUrl}
          alt={username}
          fill
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-full bg-gradient-to-br from-orange-400 to-orange-600 ring-4 ring-orange-200 flex items-center justify-center text-white font-black select-none flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.3 }}
    >
      {initials}
    </div>
  );
}

// ── Small opponent avatar ──────────────────────────────────────────────────────
function SmallAvatar({
  avatarUrl,
  username,
}: {
  avatarUrl: string | null;
  username: string;
}) {
  const [error, setError] = useState(false);
  const initials = username.slice(0, 2).toUpperCase();

  if (avatarUrl && !error) {
    return (
      <div className="relative w-9 h-9 rounded-full ring-2 ring-orange-100 overflow-hidden flex-shrink-0">
        <Image
          src={avatarUrl}
          alt={username}
          fill
          sizes="36px"
          className="object-cover"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div className="w-9 h-9 rounded-full bg-orange-100 ring-2 ring-orange-200 flex items-center justify-center text-orange-700 text-xs font-bold select-none flex-shrink-0">
      {initials}
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: string | number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 shadow-sm border border-orange-50 flex flex-col gap-1"
    >
      <span className="text-2xl leading-none">{emoji}</span>
      <p className="text-2xl font-black text-gray-900 tabular-nums mt-1">
        {value}
      </p>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label}
      </p>
    </motion.div>
  );
}

// ── Result badge ───────────────────────────────────────────────────────────────
function ResultBadge({ result }: { result: "win" | "loss" | "draw" }) {
  const t = useTranslations("profile");

  const config = {
    win: { label: t("win"), className: "bg-green-100 text-green-700" },
    loss: { label: t("loss"), className: "bg-red-100 text-red-600" },
    draw: { label: t("draw"), className: "bg-gray-100 text-gray-500" },
  }[result];

  return (
    <span
      className={`text-xs font-bold px-2.5 py-1 rounded-full ${config.className}`}
    >
      {config.label}
    </span>
  );
}

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

// ── Main component ─────────────────────────────────────────────────────────────
export function ProfileClient({
  profile,
  stats,
  recentGames,
  badges,
  email,
  isOwnProfile = true,
}: Props) {
  const router = useRouter();
  const t = useTranslations("profile");
  const locale = useLocale();

  const [username, setUsername] = useState(profile.username);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile.username);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inviteMenuForGame, setInviteMenuForGame] = useState<string | null>(null);
  const inviteMenuRef = useRef<HTMLUListElement>(null);
  const [friendRequestByUserId, setFriendRequestByUserId] = useState<
    Record<string, "idle" | "loading" | "sent">
  >({});
  const [friendState, setFriendState] = useState<"none" | "pending" | "friends">(
    "none"
  );
  const [isFollowing, setIsFollowing] = useState(false);
  const [country, setCountry] = useState(profile.country ?? "");
  const [countrySelectOpen, setCountrySelectOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [city, setCity] = useState(profile.city ?? "");
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const earnedBadgesCount = badges.filter((badge) => badge.earned_at).length;
  const filteredCountryOptions = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    if (!query) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.code.toLowerCase().includes(query)
    );
  }, [countryQuery]);

  function validateUsername(value: string): string | null {
    if (value.length < 3) return t("usernameMin");
    if (value.length > 20) return t("usernameMax");
    if (!USERNAME_RE.test(value)) return t("usernameChars");
    return null;
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError(t("imageSizeError"));
      e.target.value = "";
      return;
    }

    setAvatarError(null);
    setUploading(true);

    // Optimistic preview
    const localPreview = URL.createObjectURL(file);
    setAvatarUrl(localPreview);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/avatar", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setAvatarError(data.error ?? t("uploadFailed"));
        setAvatarUrl(profile.avatar_url);
        return;
      }

      setAvatarUrl(data.avatar_url);
    } catch {
      setAvatarError(t("networkError"));
      setAvatarUrl(profile.avatar_url);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
      e.target.value = "";
    }
  }

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        inviteMenuRef.current &&
        !inviteMenuRef.current.contains(event.target as Node)
      ) {
        setInviteMenuForGame(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function startEditing() {
    setDraft(username);
    setEditError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setEditError(null);
  }

  async function saveUsername() {
    const trimmed = draft.trim();
    const validationError = validateUsername(trimmed);
    if (validationError) {
      setEditError(validationError);
      return;
    }
    if (trimmed === username) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    setEditError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEditError(data.error ?? t("failedToSave"));
        return;
      }

      setUsername(data.username);
      setIsEditing(false);
    } catch {
      setEditError(t("networkError"));
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") saveUsername();
    if (e.key === "Escape") cancelEditing();
  }

  async function sendFriendRequest(userId: string) {
    if (!userId || friendRequestByUserId[userId] === "loading") return;
    setFriendRequestByUserId((prev) => ({ ...prev, [userId]: "loading" }));
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresseeId: userId }),
      });
      if (!res.ok) {
        setFriendRequestByUserId((prev) => ({ ...prev, [userId]: "idle" }));
        return;
      }
      setFriendRequestByUserId((prev) => ({ ...prev, [userId]: "sent" }));
    } catch {
      setFriendRequestByUserId((prev) => ({ ...prev, [userId]: "idle" }));
    }
  }

  function getPopoverFriendStatus(game: RecentGame): PopoverFriendStatus {
    const local = game.opponent?.id
      ? friendRequestByUserId[game.opponent.id]
      : undefined;
    if (local === "sent" || local === "loading") return "pending";
    return (game.friend_request_status ?? "none") as PopoverFriendStatus;
  }

  async function saveLocation() {
    const normalizedCountry = country.trim().toUpperCase();
    const continent =
      COUNTRY_OPTIONS.find((option) => option.code === normalizedCountry)?.continent ??
      "";

    setLocationSaving(true);
    setLocationError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: normalizedCountry,
          city: city.trim(),
          continent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocationError(data.error ?? t("failedToSave"));
      }
    } catch {
      setLocationError(t("networkError"));
    } finally {
      setLocationSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{
        background:
          "linear-gradient(160deg, #FAF7F2 0%, #FFF8F0 50%, #FAF7F2 100%)",
      }}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back */}
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm font-medium">{t("backToDashboard")}</span>
        </button>

        {/* ── Header card ────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-white rounded-3xl p-6 shadow-md border border-orange-50"
        >
          <div className="flex items-start gap-5">
            {/* Avatar + edit button + error */}
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div className="relative">
                <Avatar
                  avatarUrl={avatarUrl}
                  username={username}
                  size={80}
                />
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                {isOwnProfile && (
                  <button
                    title={t("changeAvatar")}
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-orange-500 hover:bg-orange-600 disabled:opacity-70 text-white flex items-center justify-center shadow-md transition-colors"
                  >
                    {uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
              <AnimatePresence>
                {avatarError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-red-500 font-medium text-center max-w-[80px] leading-tight"
                  >
                    {avatarError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pt-1">
              {/* Username row */}
              <div className="flex items-center gap-2 flex-wrap">
                {isOwnProfile && isEditing ? (
                  <div className="flex items-center gap-2 flex-wrap w-full">
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        setEditError(null);
                      }}
                      onKeyDown={handleKeyDown}
                      onBlur={saveUsername}
                      maxLength={20}
                      className="text-2xl font-extrabold text-gray-900 bg-orange-50 border-2 border-orange-300 rounded-xl px-3 py-1 focus:outline-none focus:border-orange-500 w-52 tracking-tight"
                      style={{ lineHeight: 1.2 }}
                    />
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        saveUsername();
                      }}
                      disabled={saving}
                      className="w-8 h-8 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        cancelEditing();
                      }}
                      className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : isOwnProfile ? (
                  <button
                    onClick={startEditing}
                    className="group flex items-center gap-2"
                  >
                    <span className="text-2xl font-extrabold text-gray-900 tracking-tight">
                      {username}
                    </span>
                    <Pencil className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors" />
                  </button>
                ) : (
                  <span className="text-2xl font-extrabold text-gray-900 tracking-tight">
                    {username}
                  </span>
                )}
              </div>

              {/* Inline error */}
              <AnimatePresence>
                {editError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-red-500 mt-1 font-medium"
                  >
                    {editError}
                  </motion.p>
                )}
              </AnimatePresence>

              <p className="text-sm text-gray-400 mt-1">{email}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {t("memberSince")} {formatMemberSince(profile.created_at, locale)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-sm font-bold text-orange-700">
                  {t("elo")}: {profile.elo_rating}
                </p>
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => router.push("/friends")}
                    className="inline-flex items-center rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100"
                  >
                    {t("viewFriends")}
                  </button>
                )}
              </div>
              {!isOwnProfile && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    variant={friendState === "none" ? "default" : "outline"}
                    className={
                      friendState === "none"
                        ? "bg-orange-500 hover:bg-orange-600 text-white rounded-xl"
                        : "rounded-xl"
                    }
                    onClick={() =>
                      setFriendState((prev) => {
                        if (prev === "none") return "pending";
                        if (prev === "pending") return "friends";
                        return "friends";
                      })
                    }
                  >
                    {friendState === "none"
                      ? t("addFriend")
                      : friendState === "pending"
                      ? t("pendingFriend")
                      : t("friends")}
                  </Button>
                  <Button
                    type="button"
                    variant={isFollowing ? "outline" : "default"}
                    className={
                      isFollowing
                        ? "rounded-xl"
                        : "bg-gray-900 hover:bg-black text-white rounded-xl"
                    }
                    onClick={() => setIsFollowing((prev) => !prev)}
                  >
                    {isFollowing ? t("following") : t("follow")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {isOwnProfile && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.03 }}
            className="bg-white rounded-3xl p-6 shadow-md border border-orange-50"
          >
            <h2 className="text-base font-bold text-gray-800 mb-4">{t("location")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0 w-full">
                <Select
                  open={countrySelectOpen}
                  onOpenChange={(open) => {
                    setCountrySelectOpen(open);
                    if (!open) setCountryQuery("");
                  }}
                  value={country || "__none__"}
                  onValueChange={(value) => setCountry(value === "__none__" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectCountry")} />
                  </SelectTrigger>
                  <SelectContent
                    stickyTop={
                      <input
                        value={countryQuery}
                        onChange={(e) => setCountryQuery(e.target.value)}
                        placeholder={t("searchCountry")}
                        className="w-full rounded-md border border-orange-200 bg-orange-50/40 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    }
                  >
                    <SelectItem value="__none__">{t("selectCountry")}</SelectItem>
                    {filteredCountryOptions.map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        {option.label} ({option.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("city")}
                maxLength={80}
                className="rounded-xl border border-orange-200 bg-orange-50/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            {locationError ? (
              <p className="mt-2 text-xs text-red-500">{locationError}</p>
            ) : null}
            <Button
              type="button"
              onClick={saveLocation}
              disabled={locationSaving}
              className="mt-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white"
            >
              {locationSaving ? t("saving") : t("saveLocation")}
            </Button>
          </motion.section>
        )}

        {/* ── Stats grid ─────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <h2 className="text-base font-bold text-gray-700 mb-3 px-1">{t("stats")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard emoji="🎮" label={t("gamesPlayed")} value={stats.total} />
            <StatCard emoji="🏆" label={t("wins")} value={stats.wins} />
            <StatCard
              emoji="📊"
              label={t("winRate")}
              value={`${stats.win_rate}%`}
            />
            <StatCard emoji="🤝" label={t("draws")} value={stats.draws} />
          </div>
        </motion.section>

        {/* ── Badges ─────────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="bg-white rounded-3xl p-6 shadow-md border border-orange-50"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-gray-800">{t("badges")}</h2>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
              {t("badgesProgress", { earned: earnedBadgesCount, total: badges.length })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {badges.map((badge) => {
              const earned = Boolean(badge.earned_at);
              return (
                <div
                  key={badge.id}
                  className={`rounded-2xl border p-3 transition-colors ${
                    earned
                      ? "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${
                        earned ? "bg-white shadow-sm" : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {earned ? badge.icon : <Lock className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-bold ${
                          earned ? "text-gray-900" : "text-gray-500"
                        }`}
                      >
                        {badge.name}
                      </p>
                      <p
                        className={`mt-0.5 text-xs leading-relaxed ${
                          earned ? "text-gray-600" : "text-gray-400"
                        }`}
                      >
                        {badge.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* ── Recent games ───────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="bg-white rounded-3xl p-6 shadow-md border border-orange-50"
        >
          <h2 className="text-base font-bold text-gray-800 mb-4">
            {t("recentGames")}
          </h2>

          {recentGames.length === 0 ? (
            <div className="text-center py-10">
              <span className="text-4xl">♟️</span>
              <p className="mt-3 text-gray-400 text-sm">{t("noCompletedGames")}</p>
              <Button
                onClick={() => router.push("/lobby")}
                className="mt-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold"
              >
                {t("startGame")}
              </Button>
            </div>
          ) : (
            <ul ref={inviteMenuRef} className="space-y-3">
              {recentGames.map((game, i) => (
                <motion.li
                  key={game.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.04 }}
                >
                  <Link
                    href={`/game/${game.id}`}
                    className="flex items-center gap-3 p-3 rounded-2xl hover:bg-orange-50 transition-colors group"
                  >
                    {/* Opponent + quick invite menu */}
                    <div className="relative flex items-center gap-3">
                      {game.opponent ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setInviteMenuForGame((current) =>
                              current === game.id ? null : game.id
                            );
                          }}
                          className="flex items-center gap-3 px-3 py-2 rounded-2xl transition-colors hover:bg-orange-100/80 cursor-pointer"
                        >
                          <SmallAvatar
                            avatarUrl={game.opponent.avatar_url}
                            username={game.opponent.username}
                          />
                          <div className="min-w-0 text-left">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {game.opponent.username}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatTimeControl(game.time_control, t)} ·{" "}
                              {formatDate(game.played_at, locale)}
                            </p>
                          </div>
                        </button>
                      ) : (
                        <>
                          <div className="w-9 h-9 rounded-full bg-gray-100 ring-2 ring-gray-200 flex items-center justify-center text-gray-400 text-xs font-bold flex-shrink-0">
                            ?
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {t("unknownOpponent")}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatTimeControl(game.time_control, t)} ·{" "}
                              {formatDate(game.played_at, locale)}
                            </p>
                          </div>
                        </>
                      )}

                      {inviteMenuForGame === game.id && (
                        <div className="absolute left-0 top-full mt-2 z-20 min-w-[180px] rounded-xl border border-orange-100 bg-white p-1.5 shadow-lg">
                          {game.opponent?.id &&
                            (() => {
                              const status = getPopoverFriendStatus(game);
                              if (status === "none") {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void sendFriendRequest(game.opponent?.id ?? "");
                                    }}
                                    disabled={
                                      friendRequestByUserId[game.opponent.id] === "loading"
                                    }
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-orange-50 disabled:opacity-70"
                                  >
                                    {friendRequestByUserId[game.opponent.id] === "loading"
                                      ? t("sendingFriendRequest")
                                      : t("addFriend")}
                                  </button>
                                );
                              }

                              const label =
                                status === "friends"
                                  ? t("friends")
                                  : status === "pending"
                                  ? t("friendRequestSent")
                                  : status === "declined_by_you"
                                  ? t("declinedByYou")
                                  : t("declinedByThem");
                              return (
                                <div className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-500 bg-gray-50">
                                  {label}
                                </div>
                              );
                            })()}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const params = new URLSearchParams({
                                opponentId: game.opponent?.id ?? "",
                                opponentName: game.opponent?.username ?? "",
                              });
                              router.push(`/lobby?${params.toString()}`);
                            }}
                            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-orange-50"
                          >
                            {t("inviteToNewGame")}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      <ResultBadge result={game.result} />
                      <span className="text-gray-300 group-hover:text-orange-400 transition-colors text-lg leading-none ml-1">
                        →
                      </span>
                    </div>
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>
    </div>
  );
}
