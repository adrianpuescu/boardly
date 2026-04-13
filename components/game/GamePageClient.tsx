"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import type { Square, PieceSymbol } from "chess.js";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { ArrowLeft, ChevronUp, Flag, Handshake, X } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import { usePieceSet } from "@/hooks/usePieceSet";
import { buildPieces } from "@/lib/chess/pieces";
import { PiecePicker } from "@/components/game/PiecePicker";
import type { GameResult, MoveRecord } from "@/hooks/useGameRealtime";
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

  // Initialize with the static prop — safe for SSR, avoids hydration mismatch.
  // The effect below immediately syncs to the real elapsed value on the client.
  const [displayMs, setDisplayMs] = useState(remainingMs);

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
      className={`font-mono font-bold tabular-nums transition-colors ${
        isActive ? "text-base sm:text-sm" : "text-sm"
      } ${
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
  const [avatarError, setAvatarError] = useState(false);
  const showAvatar = !!avatarUrl && !avatarError;

  console.log("[PlayerStrip]", username, "avatarUrl:", avatarUrl, "showAvatar:", showAvatar);

  return (
    <div
      className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-2xl border transition-colors ${
        isCurrentUser
          ? "bg-orange-50 border-orange-200"
          : "bg-white border-gray-100"
      }`}
    >
      <div className="relative flex-shrink-0">
        {showAvatar ? (
          <div className="w-10 h-10 rounded-full ring-2 ring-orange-100 overflow-hidden flex-shrink-0">
            <Image
              src={avatarUrl!}
              alt={username}
              width={40}
              height={40}
              className="w-full h-full object-cover"
              onError={() => setAvatarError(true)}
            />
          </div>
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
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {timer && (
          <div
            className={`px-2 sm:px-2.5 py-1 rounded-xl border font-medium ${
              isTheirTurn
                ? "bg-orange-50 border-orange-200"
                : "bg-gray-50 border-gray-100"
            }`}
          >
            {timer}
          </div>
        )}
        {isTheirTurn && (
          <span className="hidden sm:inline text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
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
        ) : result === "resignation" ? (
          <>
            <div className="text-6xl mb-4 select-none">{iWon ? "🏳️" : "🏆"}</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
              {iWon ? "Opponent resigned!" : "You resigned"}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {iWon
                ? "Your opponent threw in the towel."
                : "Sometimes discretion is the better part of valour."}
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

// ── Resign confirmation dialog ────────────────────────────────────────────────
function ResignDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 340 }}
        className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl text-center"
      >
        <div className="text-4xl mb-3">🏳️</div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Resign game?</h3>
        <p className="text-sm text-gray-500 mb-5">
          Your opponent will be declared the winner. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border-gray-200 text-gray-600"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold"
          >
            {loading ? "Resigning…" : "Resign"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Move history panel ────────────────────────────────────────────────────────
interface MovePair {
  moveNumber: number;
  white: string;
  black: string | null;
}

function buildMovePairs(moves: MoveRecord[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i].move_san,
      black: moves[i + 1]?.move_san ?? null,
    });
  }
  return pairs;
}

function MoveHistoryPanel({
  moves,
  className,
  hideHeader,
}: {
  moves: MoveRecord[];
  className?: string;
  hideHeader?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const pairs = buildMovePairs(moves);

  // Auto-scroll to bottom on new move
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moves.length]);

  return (
    <div className={`flex flex-col bg-white border border-gray-100 rounded-2xl overflow-hidden ${className ?? ""}`}>
      {!hideHeader && (
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-700">Moves</h3>
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {pairs.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No moves yet</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="w-6 px-2 pb-1.5 text-left" />
                <th className="px-2 pb-1.5 text-left font-semibold text-gray-400 tracking-wide uppercase text-[10px] w-1/2">
                  White
                </th>
                <th className="px-2 pb-1.5 text-left font-semibold text-gray-400 tracking-wide uppercase text-[10px] w-1/2">
                  Black
                </th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair, idx) => {
                const isLastPair = idx === pairs.length - 1;
                const whiteIsLatest = isLastPair && pair.black === null;
                const blackIsLatest = isLastPair && pair.black !== null;
                return (
                  <tr
                    key={pair.moveNumber}
                    className={idx % 2 === 0 ? "bg-gray-50/60" : ""}
                  >
                    <td className="w-6 px-2 py-1 text-gray-300 font-medium select-none tabular-nums">
                      {pair.moveNumber}.
                    </td>
                    <td className="px-1 py-0.5 w-1/2">
                      <span
                        className={`inline-block w-full px-1.5 py-0.5 font-mono font-semibold rounded ${
                          whiteIsLatest
                            ? "bg-orange-200 text-orange-800"
                            : "text-gray-800"
                        }`}
                      >
                        {pair.white}
                      </span>
                    </td>
                    <td className="px-1 py-0.5 w-1/2">
                      <span
                        className={`inline-block w-full px-1.5 py-0.5 font-mono font-medium rounded ${
                          blackIsLatest
                            ? "bg-orange-200 text-orange-800"
                            : "text-gray-400"
                        }`}
                      >
                        {pair.black ?? ""}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Draw offer banner ─────────────────────────────────────────────────────────
function DrawOfferBanner({
  onAccept,
  onDecline,
  loading,
}: {
  onAccept: () => void;
  onDecline: () => void;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl text-sm"
    >
      <span className="text-xl">🤝</span>
      <p className="flex-1 text-blue-800 font-medium">
        Your opponent offers a draw
      </p>
      <button
        onClick={onDecline}
        disabled={loading}
        className="px-3 py-1 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
      >
        Decline
      </button>
      <button
        onClick={onAccept}
        disabled={loading}
        className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {loading ? "…" : "Accept"}
      </button>
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
    moves,
    setMoves,
    drawOfferedBy,
    setDrawOfferedBy,
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

  const { pieceSet, setPieceSet } = usePieceSet();
  const customPieces = buildPieces(pieceSet);

  const [submitting, setSubmitting] = useState(false);
  const [showResignDialog, setShowResignDialog] = useState(false);
  const [resignLoading, setResignLoading] = useState(false);
  const [drawLoading, setDrawLoading] = useState(false);
  const [movesSheetOpen, setMovesSheetOpen] = useState(false);

  // Fetch initial move history on load
  useEffect(() => {
    fetch(`/api/moves/${game.id}`)
      .then((r) => r.json())
      .then((data: { moves?: MoveRecord[] }) => {
        if (data.moves) setMoves(data.moves);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

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
  const isActiveGame = gameStatus === "active";

  // Draw offer is pending from opponent when it was offered by someone else
  const opponentOfferedDraw =
    !!drawOfferedBy && drawOfferedBy !== currentUser.id;
  const iOfferedDraw =
    !!drawOfferedBy && drawOfferedBy === currentUser.id;

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

  // ── Resign ───────────────────────────────────────────────────────────────
  const handleResign = async () => {
    setResignLoading(true);
    try {
      const res = await fetch(`/api/games/${game.id}/resign`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { winnerId?: string | null };
        setShowResignDialog(false);
        setGameOver(true);
        setGameResult("resignation");
        setWinnerId(data.winnerId ?? null);
      }
    } catch (err) {
      console.error("[resign]", err);
    } finally {
      setResignLoading(false);
    }
  };

  // ── Draw actions ─────────────────────────────────────────────────────────
  const handleDrawAction = async (action: "offer" | "accept" | "decline") => {
    setDrawLoading(true);
    try {
      const res = await fetch(`/api/games/${game.id}/draw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok && action === "accept") {
        setGameOver(true);
        setGameResult("draw");
        setWinnerId(null);
        setDrawOfferedBy(null);
      } else if (res.ok && action === "decline") {
        setDrawOfferedBy(null);
      } else if (res.ok && action === "offer") {
        setDrawOfferedBy(currentUser.id);
      }
    } catch (err) {
      console.error("[draw]", err);
    } finally {
      setDrawLoading(false);
    }
  };

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
        {/* Board + move history: side-by-side on desktop, stacked on mobile */}
        <div className="w-full max-w-[900px] flex flex-col lg:flex-row gap-4 items-start justify-center">
          {/* Board column */}
          <div className="w-full lg:max-w-[600px] flex flex-col gap-3">
            {/* Back + status row — inside board column so it aligns with board edges */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/dashboard")}
                className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group flex-shrink-0"
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

              <div className="ml-auto flex-shrink-0">
                <PiecePicker current={pieceSet} onChange={setPieceSet} />
              </div>
            </div>

            {/* Draw offer banner — shown when opponent offers */}
            <AnimatePresence>
              {opponentOfferedDraw && isActiveGame && !showModal && (
                <DrawOfferBanner
                  onAccept={() => handleDrawAction("accept")}
                  onDecline={() => handleDrawAction("decline")}
                  loading={drawLoading}
                />
              )}
            </AnimatePresence>

            {/* Opponent strip — shown at top (they play "above" us) */}
            <PlayerStrip
              username={opponentUsername}
              avatarUrl={game.opponent?.avatar_url ?? null}
              color={opponentColor}
              isCurrentUser={false}
              isTheirTurn={fenTurn === opponentColor && gameStatus === "active"}
              timer={buildTimer(opponentColor)}
            />

            {/* Chess board with shake animation wrapper */}
            <motion.div
              animate={boardControls}
              className="w-full rounded-2xl overflow-hidden shadow-xl ring-1 ring-orange-100"
            >
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation: game.my_color,
                  pieces: customPieces,
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
            <PlayerStrip
              username={currentUser.username}
              avatarUrl={currentUser.avatar_url}
              color={game.my_color}
              isCurrentUser
              isTheirTurn={isMyTurn}
              timer={buildTimer(game.my_color)}
            />

            {/* Resign + Draw + Moves row */}
            <div className="flex gap-2">
              {isActiveGame && !showModal && (
                <>
                  <button
                    onClick={() => setShowResignDialog(true)}
                    disabled={resignLoading}
                    className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-red-500 border border-red-200 hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-40"
                  >
                    <Flag className="w-4 h-4" />
                    <span>Resign</span>
                  </button>
                  <button
                    onClick={() =>
                      iOfferedDraw ? undefined : handleDrawAction("offer")
                    }
                    disabled={drawLoading || iOfferedDraw || opponentOfferedDraw}
                    className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      iOfferedDraw
                        ? "Draw offer sent — waiting for opponent"
                        : opponentOfferedDraw
                        ? "Opponent already offered a draw"
                        : "Offer a draw"
                    }
                  >
                    <Handshake className="w-4 h-4" />
                    <span className="hidden sm:inline">{iOfferedDraw ? "Draw offered…" : "Offer Draw"}</span>
                    <span className="sm:hidden">{iOfferedDraw ? "Offered…" : "Draw"}</span>
                  </button>
                </>
              )}

              {/* Mobile: Moves button — opens bottom sheet */}
              <button
                onClick={() => setMovesSheetOpen(true)}
                className="lg:hidden ml-auto flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <ChevronUp className="w-4 h-4 text-gray-400" />
                Moves
                {moves.length > 0 && (
                  <span className="ml-0.5 text-gray-400 font-normal text-xs">
                    ({moves.length})
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Desktop: permanent move history sidebar */}
          <div className="hidden lg:flex flex-col w-52 flex-shrink-0 self-stretch">
            <MoveHistoryPanel moves={moves} className="flex-1 min-h-[200px]" />
          </div>
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

      {/* Resign confirmation dialog */}
      <AnimatePresence>
        {showResignDialog && (
          <ResignDialog
            onConfirm={handleResign}
            onCancel={() => setShowResignDialog(false)}
            loading={resignLoading}
          />
        )}
      </AnimatePresence>

      {/* Mobile: Move history bottom sheet */}
      <AnimatePresence>
        {movesSheetOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMovesSheetOpen(false)}
              className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
                <h3 className="text-base font-bold text-gray-900">
                  Moves
                  {moves.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-400">
                      ({moves.length})
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => setMovesSheetOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <MoveHistoryPanel moves={moves} className="border-0 rounded-none h-full" hideHeader />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
