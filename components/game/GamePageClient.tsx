"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import type { Square, PieceSymbol } from "chess.js";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import type { GameResult } from "@/hooks/useGameRealtime";
import type { GamePageData, CurrentUser } from "@/lib/types";

interface Props {
  game: GamePageData;
  currentUser: CurrentUser;
}

// ── Time formatting ───────────────────────────────────────────────────────────
function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// ── Chess timer ───────────────────────────────────────────────────────────────
function ChessTimer({
  remainingMs,
  turnStartedAt,
  isActive,
  onExpire,
}: {
  remainingMs: number;
  turnStartedAt: string | null;
  isActive: boolean;
  onExpire?: () => void;
}) {
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // Reset expired flag each time the turn changes
  useEffect(() => {
    expiredRef.current = false;
  }, [turnStartedAt, remainingMs]);

  const calcRemaining = useCallback(() => {
    if (!isActive || !turnStartedAt) return remainingMs;
    const elapsed = Date.now() - new Date(turnStartedAt).getTime();
    return Math.max(0, remainingMs - elapsed);
  }, [isActive, turnStartedAt, remainingMs]);

  const [displayMs, setDisplayMs] = useState(calcRemaining);

  // Sync immediately when props change (new turn / new state from realtime)
  useEffect(() => {
    setDisplayMs(calcRemaining());
  }, [calcRemaining]);

  // Tick every second while it's this player's turn
  useEffect(() => {
    if (!isActive || !turnStartedAt) return;

    const interval = setInterval(() => {
      const next = calcRemaining();
      setDisplayMs(next);
      if (next === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, turnStartedAt, calcRemaining]);

  const isLow = displayMs > 0 && displayMs < 30_000;

  return (
    <span
      className={`font-mono font-bold tabular-nums text-sm transition-colors ${
        isLow && isActive
          ? "text-red-500 animate-pulse"
          : isActive
          ? "text-orange-500"
          : "text-gray-400"
      }`}
    >
      {formatTime(displayMs)}
    </span>
  );
}

// ── Player strip ─────────────────────────────────────────────────────────────
function PlayerStrip({
  username,
  avatarUrl,
  color,
  isCurrentUser,
  isTheirTurn,
  timer,
}: {
  username: string;
  avatarUrl: string | null;
  color: "white" | "black";
  isCurrentUser: boolean;
  isTheirTurn: boolean;
  timer?: React.ReactNode;
}) {
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ${
        isCurrentUser
          ? "bg-orange-50 border-orange-200"
          : "bg-white border-gray-100"
      }`}
    >
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={username}
            className="w-10 h-10 rounded-full ring-2 ring-orange-100 object-cover"
          />
        ) : (
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ring-2 ${
              isCurrentUser
                ? "bg-orange-500 ring-orange-200 text-white"
                : "bg-gray-200 ring-gray-100 text-gray-600"
            }`}
          >
            {initials}
          </div>
        )}
        {/* Turn indicator dot */}
        {isTheirTurn && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 ring-2 ring-white" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900 text-sm truncate">
          {username}
          {isCurrentUser && (
            <span className="ml-1.5 text-xs font-normal text-orange-500">
              (you)
            </span>
          )}
        </p>
        <p className="text-xs text-gray-400">
          {color === "white" ? "♔ White" : "♚ Black"}
        </p>
      </div>

      {/* Right side: timer + turn badge */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {timer && (
          <div
            className={`px-2.5 py-1 rounded-xl border text-xs font-medium ${
              isTheirTurn
                ? "bg-orange-50 border-orange-200"
                : "bg-gray-50 border-gray-100"
            }`}
          >
            {timer}
          </div>
        )}
        {isTheirTurn && (
          <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            {isCurrentUser ? "Your turn!" : "Thinking…"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Status banner ─────────────────────────────────────────────────────────────
function StatusBanner({
  status,
  currentTurn,
  myColor,
  submitting,
}: {
  status: GamePageData["status"];
  currentTurn: "white" | "black";
  myColor: "white" | "black";
  submitting: boolean;
}) {
  if (status === "waiting") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-xl text-sm text-gray-500 font-medium">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        Waiting for opponent
      </div>
    );
  }

  if (status === "completed" || status === "abandoned") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-xl text-sm text-gray-500 font-medium">
        Game ended
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium">
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Submitting…
      </div>
    );
  }

  const isMyTurn = currentTurn === myColor;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold ${
        isMyTurn
          ? "bg-green-50 text-green-700 border border-green-200"
          : "bg-blue-50 text-blue-600 border border-blue-100"
      }`}
    >
      {isMyTurn ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Your turn!
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          Opponent&apos;s turn
        </>
      )}
    </div>
  );
}

// ── Game over modal ───────────────────────────────────────────────────────────
function GameOverModal({
  result,
  iWon,
  isDraw,
  onPlayAgain,
  onDashboard,
}: {
  result: GameResult | string | null;
  iWon: boolean;
  isDraw: boolean;
  onPlayAgain: () => void;
  onDashboard: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.75, opacity: 0, y: 32 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 320 }}
        className="bg-white rounded-3xl p-8 max-w-xs w-full shadow-2xl text-center"
      >
        {result === "timeout" ? (
          <>
            <div className="text-6xl mb-4 select-none">{iWon ? "⏰" : "⌛"}</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
              {iWon ? "You won on time!" : "Time's up!"}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {iWon
                ? "Your opponent ran out of time."
                : "Your clock ran out. Better luck next time!"}
            </p>
          </>
        ) : isDraw ? (
          <>
            <div className="text-6xl mb-4 select-none">🤝</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
              It&apos;s a Draw!
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {result === "stalemate"
                ? "Stalemate — no legal moves left."
                : "Well played by both sides!"}
            </p>
          </>
        ) : iWon ? (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.3, 1] }}
              transition={{ delay: 0.15, duration: 0.5, ease: "backOut" }}
              className="text-6xl mb-4 select-none"
            >
              🎉
            </motion.div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
              You won!
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              Outstanding! Your opponent never saw it coming.
            </p>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4 select-none">😔</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
              You lost
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              Every master was once a beginner — come back stronger!
            </p>
          </>
        )}

        <div className="flex flex-col gap-3">
          <Button
            onClick={onPlayAgain}
            className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-md"
          >
            Play again 🎲
          </Button>
          <Button
            variant="outline"
            onClick={onDashboard}
            className="w-full rounded-xl border-gray-200 text-gray-600"
          >
            Back to dashboard
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function GamePageClient({ game, currentUser }: Props) {
  const router = useRouter();
  const boardControls = useAnimation();

  const {
    fen,
    setFen,
    gameStatus,
    gameOver: realtimeGameOver,
    setGameOver,
    gameResult: realtimeGameResult,
    setGameResult,
    winnerId: realtimeWinnerId,
    setWinnerId,
    timerState,
  } = useGameRealtime(
    game.id,
    game.state.fen,
    game.status,
    {
      turn_started_at: game.state.turn_started_at,
      white_time_ms: game.state.white_time_ms,
      black_time_ms: game.state.black_time_ms,
    }
  );

  const [submitting, setSubmitting] = useState(false);

  // ── Game-over resolution ─────────────────────────────────────────────────
  const isAlreadyOver =
    game.status === "completed" || game.status === "abandoned";

  const showModal = isAlreadyOver || realtimeGameOver;

  const displayResult: string | null =
    realtimeGameResult ?? game.state.result ?? null;
  const displayWinnerId: string | null =
    realtimeWinnerId ?? game.winner_id ?? null;

  const isDraw =
    displayResult === "draw" || displayResult === "stalemate";
  const iWon =
    !isDraw && displayWinnerId !== null && displayWinnerId === currentUser.id;

  // ── Board interactivity ──────────────────────────────────────────────────
  const opponentColor: "white" | "black" =
    game.my_color === "white" ? "black" : "white";

  const fenTurn = fen.split(" ")[1] === "b" ? "black" : "white";
  const isMyTurn = fenTurn === game.my_color;

  const canSubmitMove = isMyTurn && !submitting && !showModal;

  async function shake() {
    await boardControls.start({
      x: [0, -10, 10, -10, 10, -6, 6, -3, 3, 0],
      transition: { duration: 0.45, ease: "easeInOut" },
    });
  }

  // ── Timeout handler ──────────────────────────────────────────────────────
  const handleTimeout = useCallback(async () => {
    if (showModal) return;
    try {
      const res = await fetch(`/api/moves/${game.id}/timeout`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as {
          winnerId?: string;
          loserId?: string;
        };
        setGameOver(true);
        setGameResult(null);
        setWinnerId(data.winnerId ?? null);
      }
    } catch (err) {
      console.error("[timer] timeout request failed:", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, showModal]);

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      console.log("[onPieceDrop]", sourceSquare, "->", targetSquare, "| isMyTurn:", isMyTurn, "| canSubmitMove:", canSubmitMove);
      if (!canSubmitMove) return false;

      const chess = new Chess(fen);
      let newFen: string;

      try {
        chess.move({
          from: sourceSquare as Square,
          to: targetSquare as Square,
          promotion: "q" as PieceSymbol,
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
            gameOver?: boolean;
            result?: string;
            winnerId?: string | null;
            error?: string;
          };

          if (!res.ok) {
            setFen(prevFen);
            void shake();
          } else {
            if (data.fen) setFen(data.fen);

            if (data.gameOver) {
              setGameOver(true);
              setGameResult(
                (data.result as import("@/hooks/useGameRealtime").GameResult) ??
                  null
              );
              setWinnerId(data.winnerId ?? null);
            }
          }
        })
        .catch(() => {
          setFen(prevFen);
          void shake();
        })
        .finally(() => {
          setSubmitting(false);
        });

      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canSubmitMove, isMyTurn, fen, game.id]
  );

  const opponentUsername = game.opponent?.username ?? "Waiting…";
  const timeControlType = game.time_control?.type;
  const hasTimer = timeControlType === "per_turn" || timeControlType === "per_game";

  // Resolved timer state: prefer realtime updates, fall back to initial props
  const resolvedTimerState = {
    turn_started_at: timerState.turn_started_at ?? game.state.turn_started_at,
    white_time_ms: timerState.white_time_ms ?? game.state.white_time_ms,
    black_time_ms: timerState.black_time_ms ?? game.state.black_time_ms,
  };

  // For per_turn: each player gets the same fresh allocation each turn
  const perTurnMs = (game.time_control?.minutes ?? 1) * 60 * 1000;

  // Build timer nodes for each player
  function buildTimer(playerColor: "white" | "black"): React.ReactNode {
    if (!hasTimer || showModal) return undefined;

    const isThisPlayersTurn = fenTurn === playerColor && gameStatus === "active";
    const turnStartedAt = resolvedTimerState.turn_started_at ?? null;

    if (timeControlType === "per_turn") {
      return (
        <ChessTimer
          remainingMs={perTurnMs}
          turnStartedAt={isThisPlayersTurn ? turnStartedAt : null}
          isActive={isThisPlayersTurn}
          onExpire={handleTimeout}
        />
      );
    }

    // per_game
    const remainingMs =
      playerColor === "white"
        ? (resolvedTimerState.white_time_ms ?? perTurnMs)
        : (resolvedTimerState.black_time_ms ?? perTurnMs);

    return (
      <ChessTimer
        remainingMs={remainingMs}
        turnStartedAt={isThisPlayersTurn ? turnStartedAt : null}
        isActive={isThisPlayersTurn}
        onExpire={handleTimeout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex flex-col">
      <Navbar currentUser={currentUser} />

      <main className="flex-1 flex flex-col items-center px-4 py-6 gap-4">
        {/* Back + status row */}
        <div className="w-full max-w-[600px] flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-sm font-medium">Games</span>
          </button>

          <StatusBanner
            status={gameStatus as GamePageData["status"]}
            currentTurn={fenTurn}
            myColor={game.my_color}
            submitting={submitting}
          />
        </div>

        {/* Opponent strip — shown at top (they play "above" us) */}
        <div className="w-full max-w-[600px]">
          <PlayerStrip
            username={opponentUsername}
            avatarUrl={game.opponent?.avatar_url ?? null}
            color={opponentColor}
            isCurrentUser={false}
            isTheirTurn={fenTurn === opponentColor && gameStatus === "active"}
            timer={buildTimer(opponentColor)}
          />
        </div>

        {/* Chess board with shake animation wrapper */}
        <motion.div
          animate={boardControls}
          className="w-full max-w-[600px] rounded-2xl overflow-hidden shadow-xl ring-1 ring-orange-100"
        >
          <Chessboard
            options={{
              position: fen,
              boardOrientation: game.my_color,
              canDragPiece: ({ piece }) => {
                const isWhitePiece = piece.pieceType.startsWith("w");
                return game.my_color === "white" ? isWhitePiece : !isWhitePiece;
              },
              onPieceDrop: ({ sourceSquare, targetSquare }) => {
                console.log("[onPieceDrop]", sourceSquare, "->", targetSquare ?? "off-board");
                if (!targetSquare) return false;
                return handlePieceDrop(sourceSquare, targetSquare);
              },
              lightSquareStyle: { backgroundColor: "#F0D9B5" },
              darkSquareStyle: { backgroundColor: "#B58863" },
              boardStyle: { borderRadius: "0", boxShadow: "none" },
            }}
          />
        </motion.div>

        {/* Current user strip — shown at bottom */}
        <div className="w-full max-w-[600px]">
          <PlayerStrip
            username={currentUser.email.split("@")[0]}
            avatarUrl={currentUser.avatar_url}
            color={game.my_color}
            isCurrentUser
            isTheirTurn={isMyTurn}
            timer={buildTimer(game.my_color)}
          />
        </div>
      </main>

      {/* Game over modal */}
      <AnimatePresence>
        {showModal && (
          <GameOverModal
            result={displayResult}
            iWon={iWon}
            isDraw={isDraw}
            onPlayAgain={() => router.push("/lobby")}
            onDashboard={() => router.push("/dashboard")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
