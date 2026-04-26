"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import dynamic from "next/dynamic";
import Image from "next/image";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { enUS, es, ro } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import type { DashboardGame } from "@/lib/types";
import { usePieceSet } from "@/hooks/usePieceSet";
import { useBoardTheme } from "@/hooks/useBoardTheme";
import { buildPieces } from "@/lib/chess/pieces";
import { getBoardThemeStyles } from "@/lib/chess/boardThemes";
import {
  getCheckHighlight,
  getLastMoveSquaresFromMoves,
  getSquareStyles,
} from "@/lib/chess/squareHighlight";
import type { MoveRecord } from "@/hooks/useGameRealtime";

// Chessboard is client-only (no SSR)
const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false, loading: () => <div className="w-full h-full bg-amber-100 animate-pulse" /> }
);

interface Props {
  game: DashboardGame;
}

export function GameCard({ game }: Props) {
  const router = useRouter();
  const t = useTranslations("gameCard");
  const locale = useLocale();
  const [avatarError, setAvatarError] = useState(false);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [notationSizePx, setNotationSizePx] = useState(8);
  const { pieceSet } = usePieceSet(game.id);
  const { boardTheme } = useBoardTheme(game.id);
  const boardStyles = getBoardThemeStyles(boardTheme);
  const customPieces = buildPieces(pieceSet);

  const [moves, setMoves] = useState<MoveRecord[]>([]);

  useEffect(() => {
    fetch(`/api/moves/${game.id}`)
      .then((r) => r.json())
      .then((data: { moves?: MoveRecord[] }) => {
        if (data.moves) setMoves(data.moves);
      })
      .catch(() => {});
  }, [game.id]);

  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      // Scale notation with board width (dashboard card mini-board baseline).
      const size = Math.round(width / 16);
      setNotationSizePx(Math.max(7, Math.min(10, size)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fen = game.state?.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const lastMove = useMemo(
    () => getLastMoveSquaresFromMoves(moves),
    [moves]
  );

  const { inCheck, kingSquare } = useMemo(
    () => getCheckHighlight(fen),
    [fen]
  );

  const squareStyles = useMemo(
    () => getSquareStyles(lastMove, inCheck, kingSquare),
    [lastMove, inCheck, kingSquare]
  );

  const isMyTurn =
    game.status === "active" && game.state?.turn === game.my_color;
  const isWaiting = game.status === "waiting";

  const timeControlLabels: Record<string, string> = {
    unlimited: t("unlimited"),
    per_turn: t("perTurn"),
    per_game: t("perGame"),
    time_based: t("timeBased"),
    turn_based: t("turnBased"),
  };

  const timeLabel =
    timeControlLabels[game.time_control?.type] ??
    game.time_control?.type ??
    t("unlimited");

  const opponentName = game.opponent?.username ?? t("waitingForOpponent") + "…";
  const opponentInitials = opponentName.slice(0, 2).toUpperCase();

  const ago = formatDistanceToNow(new Date(game.created_at), {
    addSuffix: true,
    locale: locale === "ro" ? ro : locale === "es" ? es : enUS,
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
      className="h-full bg-white rounded-3xl shadow-md hover:shadow-xl transition-shadow cursor-pointer overflow-hidden border border-orange-50 flex flex-col"
    >
      {/* Mini board preview */}
      <div className="relative flex items-center justify-center overflow-hidden select-none"
           style={{ height: "148px", background: "linear-gradient(160deg, #FFF8F0 0%, #F0E8DC 100%)" }}>
        {/* Actual board — pointer-events-none keeps it non-interactive */}
        <div ref={boardContainerRef} className="pointer-events-none" style={{ width: 120, height: 120 }}>
          <Chessboard
            options={{
              position: fen,
              boardOrientation: game.my_color,
              pieces: customPieces,
              allowDragging: false,
              lightSquareStyle: boardStyles.lightSquareStyle,
              darkSquareStyle: boardStyles.darkSquareStyle,
              lightSquareNotationStyle: boardStyles.lightSquareNotationStyle,
              darkSquareNotationStyle: boardStyles.darkSquareNotationStyle,
              alphaNotationStyle: { fontSize: `${notationSizePx}px`, fontWeight: "600" },
              numericNotationStyle: { fontSize: `${notationSizePx}px`, fontWeight: "600" },
              squareStyles,
            }}
          />
        </div>

        {/* Color badge */}
        <span className="absolute top-2 right-2 flex items-center gap-1 text-xs font-semibold bg-white/80 backdrop-blur-sm text-gray-700 rounded-full px-2.5 py-0.5 shadow-sm">
          <span className="text-base chess-sym">{game.my_color === "white" ? "♔" : "♚"}</span>
          {game.my_color === "white" ? t("white") : t("black")}
        </span>

        {/* Turn indicator stripe */}
        {isMyTurn && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-emerald-500" />
        )}
      </div>

      {/* Card body */}
      <div className="px-4 pt-4 pb-2.5 flex-1 flex flex-col gap-3">
        {/* Status badge */}
        {isMyTurn ? (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-sm font-semibold text-green-600">
              {t("yourTurn")}
            </span>
          </div>
        ) : isWaiting ? (
          <Badge
            variant="secondary"
            className="text-xs bg-gray-100 text-gray-500 border-0 rounded-full"
          >
            {t("waitingForOpponent")}
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="text-xs bg-blue-50 text-blue-500 border-0 rounded-full"
          >
            {t("opponentsTurn")}
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
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-800 truncate">{opponentName}</p>
              {typeof game.opponent?.elo_rating === "number" && (
                <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                  {game.opponent.elo_rating}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">{t("opponent")}</p>
          </div>
        </div>

        <div className="min-h-[20px]">
          {game.name ? (
            <p className="min-w-0 flex items-center gap-1 text-xs italic text-gray-500 truncate">
              <span aria-hidden>🏷️</span>
              <span className="truncate">
                {game.name.length > 30 ? `${game.name.slice(0, 30)}...` : game.name}
              </span>
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between border-t border-gray-50 pt-3">
          <span className="text-xs text-gray-400">{timeLabel}</span>
          <span className="text-xs text-gray-400">{ago}</span>
        </div>
      </div>
    </motion.div>
  );
}
