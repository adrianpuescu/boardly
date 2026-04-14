"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import {
  getCheckHighlight,
  getLastMoveSquaresFromMoves,
  getSquareStyles,
  type LastMoveSquares,
} from "@/lib/chess/squareHighlight";
import { usePieceSet } from "@/hooks/usePieceSet";
import { useBoardTheme } from "@/hooks/useBoardTheme";
import { buildPieces } from "@/lib/chess/pieces";
import { getBoardThemeStyles } from "@/lib/chess/boardThemes";
import type { DashboardGame } from "@/lib/types";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-amber-100 animate-pulse" />
    ),
  }
);

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MAX_BOARDS = 4;

interface BoardItemProps {
  game: DashboardGame;
}

function BoardItem({ game }: BoardItemProps) {
  const { pieceSet } = usePieceSet(game.id);
  const { boardTheme } = useBoardTheme(game.id);
  const boardStyles = getBoardThemeStyles(boardTheme);
  const customPieces = buildPieces(pieceSet);
  const router = useRouter();
  const t = useTranslations("game");
  const boardControls = useAnimation();

  const { fen, setFen, gameStatus, gameOver, moves } = useGameRealtime(
    game.id,
    game.state?.fen ?? INITIAL_FEN,
    game.status
  );

  const [pendingLastMove, setPendingLastMove] = useState<LastMoveSquares | null>(
    null
  );

  const lastMoveFromHistory = useMemo(
    () => getLastMoveSquaresFromMoves(moves),
    [moves]
  );

  useEffect(() => {
    if (
      lastMoveFromHistory &&
      pendingLastMove &&
      lastMoveFromHistory.from === pendingLastMove.from &&
      lastMoveFromHistory.to === pendingLastMove.to
    ) {
      setPendingLastMove(null);
    }
  }, [lastMoveFromHistory, pendingLastMove]);

  const lastMove = lastMoveFromHistory ?? pendingLastMove;

  const { inCheck, kingSquare } = useMemo(() => getCheckHighlight(fen), [fen]);

  const squareStyles = useMemo(
    () => getSquareStyles(lastMove, inCheck, kingSquare),
    [lastMove, inCheck, kingSquare]
  );

  const [submitting, setSubmitting] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [notationSizePx, setNotationSizePx] = useState(9);

  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      // Scale notation with actual mini-board size in multi-board dashboard cards.
      const size = Math.round(width / 20);
      setNotationSizePx(Math.max(7, Math.min(11, size)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Derive turn from live FEN for accuracy
  const fenTurn = fen.split(" ")[1] === "b" ? "black" : "white";
  const isActive = gameStatus === "active" && !gameOver;
  const isMyTurn = fenTurn === game.my_color && isActive;
  const canMove = isMyTurn && !submitting;

  const opponentName = game.opponent?.username ?? t("waitingForOpponent") + "…";
  const opponentInitials = game.opponent
    ? opponentName.slice(0, 2).toUpperCase()
    : "?";
  const showAvatar = !!game.opponent?.avatar_url && !avatarError;

  async function shake() {
    await boardControls.start({
      x: [0, -8, 8, -8, 8, -4, 4, -2, 2, 0],
      transition: { duration: 0.4, ease: "easeInOut" },
    });
  }

  const handlePieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!canMove || !targetSquare) return false;

      const chess = new Chess(fen);
      let newFen: string;
      try {
        chess.move({
          from: sourceSquare as Square,
          to: targetSquare as Square,
          promotion: "q",
        });
        newFen = chess.fen();
      } catch {
        void shake();
        return false;
      }

      const prevFen = fen;
      setFen(newFen);
      setSubmitting(true);

      fetch(`/api/moves/${game.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: sourceSquare, to: targetSquare }),
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            success?: boolean;
            fen?: string;
            error?: string;
          };
          if (!res.ok) {
            setFen(prevFen);
            void shake();
          } else {
            setPendingLastMove({
              from: sourceSquare as Square,
              to: targetSquare as Square,
            });
            if (data.fen) setFen(data.fen);
          }
        })
        .catch(() => {
          setFen(prevFen);
          setPendingLastMove(null);
          void shake();
        })
        .finally(() => setSubmitting(false));

      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canMove, fen, game.id]
  );

  // Visual state for the card — hover handled via Tailwind group
  const cardClass = isMyTurn
    ? "shadow-xl scale-[1.02] border-green-200"
    : isActive
    ? "shadow-md"
    : "shadow-sm opacity-70";

  return (
    <div
      className={`group flex flex-col bg-white rounded-2xl overflow-hidden border cursor-pointer transition-all duration-200 hover:ring-1 hover:ring-orange-300 hover:shadow-xl hover:scale-[1.015] ${cardClass}`}
      onClick={() => router.push(`/game/${game.id}`)}
    >
      {/* "Your turn" accent stripe */}
      {isMyTurn && (
        <div className="h-1 bg-gradient-to-r from-green-400 to-emerald-500" />
      )}

      {/* Header: opponent name + avatar */}
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 border-b min-w-0 ${
          isMyTurn ? "bg-green-50 border-green-100" : "border-gray-50"
        }`}
      >
        {/* Avatar */}
        {showAvatar ? (
          <div className="relative w-7 h-7 rounded-full ring-1 ring-orange-100 overflow-hidden flex-shrink-0">
            <Image
              src={game.opponent!.avatar_url!}
              alt={opponentName}
              fill
              sizes="28px"
              className="object-cover"
              onError={() => setAvatarError(true)}
            />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-[10px] font-bold flex-shrink-0">
            {opponentInitials}
          </div>
        )}

        <span className="text-sm font-semibold text-gray-800 truncate flex-1 min-w-0">
          {opponentName}
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
          <span className="text-base chess-sym">{game.my_color === "white" ? "♔" : "♚"}</span>
          {game.my_color === "white" ? t("white") : t("black")}
        </span>
      </div>

      {/* Board — interactive when it's my turn, view-only otherwise */}
      <motion.div
        animate={boardControls}
        ref={boardContainerRef}
        className={`relative select-none w-full aspect-square ${
          submitting ? "opacity-75" : ""
        }`}
        // Prevent card-level click from triggering navigation while using the board
        onClick={(e) => { if (isActive) e.stopPropagation(); }}
        style={{ pointerEvents: isActive ? undefined : "none" }}
      >
        <Chessboard
          options={{
            position: fen,
            boardOrientation: game.my_color,
            pieces: customPieces,
            allowDragging: canMove,
            canDragPiece: canMove
              ? ({ piece }) => {
                  const isWhite = piece.pieceType.startsWith("w");
                  return game.my_color === "white" ? isWhite : !isWhite;
                }
              : () => false,
            onPieceDrop: handlePieceDrop,
            lightSquareStyle: boardStyles.lightSquareStyle,
            darkSquareStyle: boardStyles.darkSquareStyle,
            lightSquareNotationStyle: boardStyles.lightSquareNotationStyle,
            darkSquareNotationStyle: boardStyles.darkSquareNotationStyle,
            alphaNotationStyle: { fontSize: `${notationSizePx}px`, fontWeight: "600" },
            numericNotationStyle: { fontSize: `${notationSizePx}px`, fontWeight: "600" },
            squareStyles,
            boardStyle: { borderRadius: "0", boxShadow: "none" },
          }}
        />

        {/* Submitting overlay */}
        {submitting && (
          <div className="absolute inset-0 bg-white/20 flex items-center justify-center pointer-events-none">
            <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </motion.div>

      {/* Footer: turn status */}
      <div
        className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${
          isMyTurn
            ? "bg-green-50 text-green-600"
            : isActive
            ? "bg-blue-50/60 text-blue-500"
            : "bg-gray-50 text-gray-400"
        }`}
      >
        {isMyTurn ? (
          <>
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            {t("yourTurn")}
          </>
        ) : isActive ? (
          <>
            <span className="h-2 w-2 rounded-full bg-blue-300 flex-shrink-0 inline-block" />
            {t("opponentsTurn")}
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-gray-300 flex-shrink-0 inline-block" />
            {t("waiting")}
          </>
        )}
      </div>
    </div>
  );
}

interface MultiBoardViewProps {
  games: DashboardGame[];
  onShowAll: () => void;
}

export function MultiBoardView({ games, onShowAll }: MultiBoardViewProps) {
  const tDashboard = useTranslations("dashboard");

  // Prioritise games where it's my turn
  const sorted = [...games].sort((a, b) => {
    const aMyTurn =
      a.status === "active" && a.state?.turn === a.my_color ? 0 : 1;
    const bMyTurn =
      b.status === "active" && b.state?.turn === b.my_color ? 0 : 1;
    return aMyTurn - bMyTurn;
  });

  const displayed = sorted.slice(0, MAX_BOARDS);
  const extraCount = Math.max(0, sorted.length - MAX_BOARDS);

  // Mobile: one board at a time with swipe navigation
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);

  const goTo = (next: number) => {
    setSlideDirection(next > currentIndex ? 1 : -1);
    setCurrentIndex(next);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 50 && dy < 80) {
      if (dx < 0 && currentIndex < displayed.length - 1) {
        goTo(currentIndex + 1);
      } else if (dx > 0 && currentIndex > 0) {
        goTo(currentIndex - 1);
      }
    }
  };

  return (
    <div>
      {/* ── Desktop: 2 × 2 grid ─────────────────────────────── */}
      <div className="hidden sm:grid sm:grid-cols-2 gap-6">
        {displayed.map((game) => (
          <BoardItem key={game.id} game={game} />
        ))}
      </div>

      {/* ── Mobile: single board + swipe ────────────────────── */}
      <div
        className="sm:hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: slideDirection * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDirection * -40 }}
            transition={{ duration: 0.2 }}
          >
            {displayed[currentIndex] && (
              <BoardItem
                game={displayed[currentIndex]}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation controls */}
        {displayed.length > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => goTo(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="p-1.5 rounded-full bg-white shadow border border-gray-100 disabled:opacity-30 transition-opacity"
              aria-label={tDashboard("previousGame")}
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>

            <div className="flex items-center gap-1.5">
              {displayed.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={tDashboard("goToGameN", { n: i + 1 })}
                  className={`h-2 rounded-full transition-all duration-200 ${
                    i === currentIndex ? "w-4 bg-orange-500" : "w-2 bg-gray-300"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={() =>
                goTo(Math.min(displayed.length - 1, currentIndex + 1))
              }
              disabled={currentIndex === displayed.length - 1}
              className="p-1.5 rounded-full bg-white shadow border border-gray-100 disabled:opacity-30 transition-opacity"
              aria-label={tDashboard("nextGame")}
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}
      </div>

      {/* ── "+ N more" ───────────────────────────────────────── */}
      {extraCount > 0 && (
        <div className="mt-5 flex justify-center">
          <Button
            variant="outline"
            onClick={onShowAll}
            className="rounded-2xl border-orange-200 text-orange-600 hover:bg-orange-50 font-semibold"
            style={{ fontFamily: "var(--font-nunito), sans-serif" }}
          >
            {tDashboard("moreGames", { count: extraCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
