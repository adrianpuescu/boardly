"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { GameCard } from "@/components/game/GameCard";
import { Button } from "@/components/ui/button";
import type { DashboardGame, CurrentUser } from "@/lib/types";


interface Props {
  games: DashboardGame[];
  currentUser: CurrentUser;
}

export function DashboardClient({ games, currentUser }: Props) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <Navbar currentUser={currentUser} />

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Heading row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Your Games
            </h1>
            <p className="mt-1 text-gray-500 text-sm">
              {games.length === 0
                ? "You have no active games yet."
                : `${games.length} active game${games.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          <Button
            onClick={() => router.push("/lobby")}
            className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 shadow-md hover:shadow-lg transition-all"
          >
            + New Game
          </Button>
        </div>

        {/* Empty state */}
        {games.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <span className="text-7xl mb-6 select-none">♟️</span>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              No active games
            </h2>
            <p className="text-gray-500 mb-8 max-w-xs">
              Challenge someone to a game and see who reigns supreme!
            </p>
            <Button
              onClick={() => router.push("/lobby")}
              className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 text-base shadow-md hover:shadow-lg transition-all"
            >
              Start your first game 🎉
            </Button>
          </motion.div>
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
              <GameCard key={game.id} game={game} />
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
