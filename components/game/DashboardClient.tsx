"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { LayoutGrid, LayoutDashboard } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { GameCard } from "@/components/game/GameCard";
import { MultiBoardView } from "@/components/game/MultiBoardView";
import { Button } from "@/components/ui/button";
import type { DashboardGame, CurrentUser } from "@/lib/types";

type ViewMode = "grid" | "multiboard";
const VIEW_MODE_KEY = "boardly-dashboard-view";

interface Props {
  games: DashboardGame[];
  currentUser: CurrentUser;
}

function EmptyState({ onNewGame }: { onNewGame: () => void }) {
  const t = useTranslations("dashboard");

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center justify-center py-20 text-center relative"
    >
      {/* Floating chess pieces decoration */}
      <div className="relative mb-8">
        {/* Outer ring */}
        <div className="w-36 h-36 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center shadow-inner">
          {/* Subtle board grid inside the circle */}
          <div className="absolute inset-4 rounded-full overflow-hidden opacity-20">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: "repeating-conic-gradient(#92400e 0% 25%, transparent 0% 50%)",
                backgroundSize: "20px 20px",
              }}
            />
          </div>

          {/* Knight piece */}
          <span
            className="relative z-10 text-6xl animate-float select-none"
            style={{ filter: "drop-shadow(0 4px 8px rgba(234,88,12,0.25))" }}
          >
            ♞
          </span>
        </div>

        {/* Orbiting dots */}
        <span className="absolute top-0 right-2 text-xl animate-bounce" style={{ animationDelay: "0.1s" }}>♙</span>
        <span className="absolute bottom-1 left-0 text-base animate-bounce" style={{ animationDelay: "0.4s" }}>♗</span>
        <span className="absolute top-4 left-0 text-sm animate-bounce text-amber-400" style={{ animationDelay: "0.7s" }}>★</span>
      </div>

      <h2
        className="text-3xl font-black text-gray-800 mb-3 tracking-tight"
        style={{ fontFamily: "var(--font-nunito), sans-serif" }}
      >
        {t("noGamesTitle")}
      </h2>
      <p className="text-gray-500 mb-8 max-w-xs leading-relaxed text-base">
        {t("noGamesDesc")}
      </p>

      <Button
        onClick={onNewGame}
        className="rounded-2xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold px-8 py-3 text-base shadow-lg shadow-orange-200 hover:shadow-xl hover:shadow-orange-200 transition-all"
        style={{ fontFamily: "var(--font-nunito), sans-serif" }}
      >
        {t("startFirstGame")}
      </Button>

      {/* Decorative scattered pieces */}
      <div className="flex gap-4 mt-10 text-gray-200 text-3xl select-none pointer-events-none" aria-hidden="true">
        <span>♜</span><span>♝</span><span>♛</span><span>♝</span><span>♜</span>
      </div>
    </motion.div>
  );
}

export function DashboardClient({ games, currentUser }: Props) {
  const router = useRouter();
  const t = useTranslations("dashboard");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null;
      if (saved === "grid" || saved === "multiboard") setViewMode(saved);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="min-h-screen relative"
      style={{ background: "#FAF7F2" }}
    >
      {/* Knight watermark */}
      <span
        className="fixed bottom-0 right-0 select-none pointer-events-none"
        aria-hidden="true"
        style={{ fontSize: 400, lineHeight: 1, opacity: 0.04, transform: "translate(10%, 10%)" }}
      >
        ♞
      </span>

      <Navbar currentUser={currentUser} />

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Heading row */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between gap-3 mb-8"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-1">
              <span className="text-2xl sm:text-3xl chess-sym select-none flex-shrink-0" aria-hidden="true">♟</span>
              <h1
                className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight truncate"
                style={{ fontFamily: "var(--font-nunito), sans-serif" }}
              >
                {t("title")}
              </h1>
            </div>
            <p className="text-gray-500 text-sm pl-8 sm:pl-9 truncate">
              {games.length === 0
                ? t("readyToPlay")
                : t("gamesInProgress", { count: games.length })}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* View toggle — only shown when there are games */}
            {games.length > 0 && (
              <div className="flex items-center bg-white border border-gray-200 rounded-xl p-0.5 shadow-sm">
                <button
                  onClick={() => switchView("grid")}
                  aria-label={t("gridView")}
                  title={t("gridView")}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === "grid"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => switchView("multiboard")}
                  aria-label={t("multiBoardView")}
                  title={t("multiBoardView")}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === "multiboard"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                </button>
              </div>
            )}

            <Button
              onClick={() => router.push("/lobby")}
              className="rounded-2xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold px-4 sm:px-5 min-h-[44px] shadow-md shadow-orange-200 hover:shadow-lg transition-all"
              style={{ fontFamily: "var(--font-nunito), sans-serif" }}
            >
              <span className="hidden sm:inline">{t("newGame")}</span>
              <span className="sm:hidden">{t("newGameShort")}</span>
            </Button>
          </div>
        </motion.div>

        {/* Empty state */}
        {games.length === 0 ? (
          <EmptyState onNewGame={() => router.push("/lobby")} />
        ) : viewMode === "multiboard" ? (
          /* Multi-board view */
          <MultiBoardView
            games={games}
            onShowAll={() => switchView("grid")}
          />
        ) : (
          /* Game grid */
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.08 } },
            }}
          >
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                currentUser={currentUser}
              />
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
