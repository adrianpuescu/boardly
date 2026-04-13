"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { DashboardGame } from "@/lib/types";

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
      <div className="relative bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center h-36 select-none">
        {/* Checkerboard pattern using CSS */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-conic-gradient(#92400e 0% 25%, transparent 0% 50%)",
            backgroundSize: "24px 24px",
          }}
        />
        <span className="relative text-6xl drop-shadow-sm">♟️</span>

        {/* Color badge */}
        <span className="absolute top-2 right-2 text-xs font-semibold bg-white/70 backdrop-blur-sm text-gray-700 rounded-full px-2 py-0.5 capitalize">
          {game.my_color}
        </span>
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
          {game.opponent?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={game.opponent.avatar_url}
              alt={opponentName}
              className="w-8 h-8 rounded-full ring-1 ring-orange-100 object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-orange-700 text-xs font-bold flex-shrink-0">
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
