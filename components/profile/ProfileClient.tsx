"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Pencil, X, Camera, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProfileStats, RecentGame } from "@/lib/types";

interface ProfileData {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

interface Props {
  profile: ProfileData;
  stats: ProfileStats;
  recentGames: RecentGame[];
  email: string;
}

const USERNAME_RE = /^[a-zA-Z0-9._]+$/;

function validateUsername(value: string): string | null {
  if (value.length < 3) return "At least 3 characters required";
  if (value.length > 20) return "Maximum 20 characters";
  if (!USERNAME_RE.test(value)) return "Only letters, numbers, dots and underscores";
  return null;
}

function formatMemberSince(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeControl(tc: { type: string; minutes?: number }): string {
  if (tc.type === "unlimited") return "Unlimited";
  if (tc.type === "per_turn") return `${tc.minutes}m / move`;
  if (tc.type === "per_game") return `${tc.minutes}m total`;
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
  const config = {
    win: { label: "Win", className: "bg-green-100 text-green-700" },
    loss: { label: "Loss", className: "bg-red-100 text-red-600" },
    draw: { label: "Draw", className: "bg-gray-100 text-gray-500" },
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
export function ProfileClient({ profile, stats, recentGames, email }: Props) {
  const router = useRouter();

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

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError("Image must be under 2 MB");
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
        setAvatarError(data.error ?? "Upload failed");
        setAvatarUrl(profile.avatar_url);
        return;
      }

      setAvatarUrl(data.avatar_url);
    } catch {
      setAvatarError("Network error. Please try again.");
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
        setEditError(data.error ?? "Failed to save username");
        return;
      }

      setUsername(data.username);
      setIsEditing(false);
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") saveUsername();
    if (e.key === "Escape") cancelEditing();
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
          <span className="text-sm font-medium">Back to dashboard</span>
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
                <button
                  title="Change avatar"
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
                {isEditing ? (
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
                ) : (
                  <button
                    onClick={startEditing}
                    className="group flex items-center gap-2"
                  >
                    <span className="text-2xl font-extrabold text-gray-900 tracking-tight">
                      {username}
                    </span>
                    <Pencil className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors" />
                  </button>
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
                Member since {formatMemberSince(profile.created_at)}
              </p>
            </div>
          </div>
        </motion.section>

        {/* ── Stats grid ─────────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <h2 className="text-base font-bold text-gray-700 mb-3 px-1">Stats</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard emoji="🎮" label="Games Played" value={stats.total} />
            <StatCard emoji="🏆" label="Wins" value={stats.wins} />
            <StatCard
              emoji="📊"
              label="Win Rate"
              value={`${stats.win_rate}%`}
            />
            <StatCard emoji="🤝" label="Draws" value={stats.draws} />
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
            Recent Games
          </h2>

          {recentGames.length === 0 ? (
            <div className="text-center py-10">
              <span className="text-4xl">♟️</span>
              <p className="mt-3 text-gray-400 text-sm">No completed games yet.</p>
              <Button
                onClick={() => router.push("/lobby")}
                className="mt-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold"
              >
                Start a game
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
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
                    {/* Opponent avatar */}
                    {game.opponent ? (
                      <SmallAvatar
                        avatarUrl={game.opponent.avatar_url}
                        username={game.opponent.username}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gray-100 ring-2 ring-gray-200 flex items-center justify-center text-gray-400 text-xs font-bold flex-shrink-0">
                        ?
                      </div>
                    )}

                    {/* Game info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {game.opponent?.username ?? "Unknown opponent"}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatTimeControl(game.time_control)} ·{" "}
                        {formatDate(game.played_at)}
                      </p>
                    </div>

                    {/* Result */}
                    <ResultBadge result={game.result} />

                    {/* Arrow */}
                    <span className="text-gray-300 group-hover:text-orange-400 transition-colors text-lg leading-none ml-1">
                      →
                    </span>
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
