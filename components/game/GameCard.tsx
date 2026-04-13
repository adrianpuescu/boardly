"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { DashboardGame } from "@/lib/types";

// Chessboard is client-only (no SSR)
const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false, loading: () => <div className="w-full h-full bg-amber-100 animate-pulse" /> }
);

interface Props {
  game: DashboardGame;
}

const TIME_CONTROL_LABELS: Record<string, string> = {
  unlimited: "Unlimited ∞",
  per_turn: "Per turn ⏱",
  per_game: "Per game ⏳",
  time_based: "Timed ⏱",
  turn_based: "Turn based 🔄",
};

export function GameCard({ game }: Props) {
  const router = useRouter();
  const [avatarError, setAvatarError] = useState(false);

  const isMyTurn =
    game.status === "active" && game.state?.turn === game.my_color;
  const isWaiting = game.status === "waiting";

  const timeLabel =
    TIME_CONTROL_LABELS[game.time_control?.type] ??
    game.time_control?.type ??
    "Unlimited ∞";

  const opponentName = game.opponent?.username ?? "Waiting for opponent…";
  const opponentInitials = opponentName.slice(0, 2).toUpperCase();

  const ago = formatDistanceToNow(new Date(game.created_at), {
    addSuffix: true,
  });

  const fen = game.state?.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
      }}
      whileHover={{ scale: 1.025, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => router.push(`/game/${game.id}`)}
      className="bg-white rounded-3xl shadow-md hover:shadow-xl transition-shadow cursor-pointer overflow-hidden border border-orange-50"
    >
      {/* Mini board preview */}
      <div className="relative bg-amber-50 flex items-center justify-center overflow-hidden select-none"
           style={{ height: "148px" }}>
        {/* Very faint chess pattern in background */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "repeating-conic-gradient(#92400e 0% 25%, transparent 0% 50%)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* Actual board — pointer-events-none keeps it non-interactive */}
        <div className="pointer-events-none relative z-10" style={{ width: 120, height: 120 }}>
          <Chessboard
            options={{
              position: fen,
              boardOrientation: game.my_color,
              allowDragging: false,
            }}
          />
        </div>

        {/* Color badge */}
        <span className="absolute top-2 right-2 text-xs font-semibold bg-white/80 backdrop-blur-sm text-gray-700 rounded-full px-2.5 py-0.5 capitalize shadow-sm">
          {game.my_color === "white" ? "♔" : "♚"} {game.my_color}
        </span>

        {/* Turn indicator stripe */}
        {isMyTurn && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-emerald-500" />
        )}
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Status badge */}
        {isMyTurn ? (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-sm font-semibold text-green-600">
              Your turn!
            </span>
          </div>
        ) : isWaiting ? (
          <Badge
            variant="secondary"
            className="text-xs bg-gray-100 text-gray-500 border-0 rounded-full"
          >
            Waiting for opponent
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="text-xs bg-blue-50 text-blue-500 border-0 rounded-full"
          >
            Opponent&apos;s turn
          </Badge>
        )}

        {/* Opponent */}
        <div className="flex items-center gap-2.5">
          {game.opponent?.avatar_url && !avatarError ? (
            <div className="relative w-8 h-8 rounded-full ring-1 ring-orange-100 overflow-hidden flex-shrink-0">
              <Image
                src={game.opponent.avatar_url}
                alt={opponentName}
                fill
                sizes="32px"
                className="object-cover"
                onError={() => setAvatarError(true)}
              />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold flex-shrink-0">
              {game.opponent ? opponentInitials : "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {opponentName}
            </p>
            <p className="text-xs text-gray-400">Opponent</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-50">
          <span className="text-xs text-gray-400">{timeLabel}</span>
          <span className="text-xs text-gray-400">{ago}</span>
        </div>
      </div>
    </motion.div>
  );
}
