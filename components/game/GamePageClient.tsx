"use client";

import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import type { Square, PieceSymbol } from "chess.js";
import { motion, AnimatePresence, animate } from "framer-motion";
import {
  ArrowLeft,
  ChevronUp,
  Flag,
  Handshake,
  Link2,
  X,
  XCircle,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useGameRealtime } from "@/hooks/useGameRealtime";
import { usePieceSet } from "@/hooks/usePieceSet";
import { useBoardTheme } from "@/hooks/useBoardTheme";
import { buildPieces, type PieceRenderObject } from "@/lib/chess/pieces";
import { getBoardThemeStyles } from "@/lib/chess/boardThemes";
import {
  getCheckHighlight,
  getLastMoveSquaresFromMoves,
  getSquareStyles,
  INITIAL_FEN,
  type LastMoveSquares,
} from "@/lib/chess/squareHighlight";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { GameSettings } from "@/components/game/GameSettings";
import type { GameResult, MoveRecord } from "@/hooks/useGameRealtime";
import type { GamePageData, CurrentUser } from "@/lib/types";
import {
  getCapturedPieces,
  type CapturedPieces,
} from "@/lib/chess/capturedPieces";
import { cn, isNextImageCompatibleSrc } from "@/lib/utils";
import { getGuestGamesCount, GUEST_GAMES_LIMIT } from "@/lib/guestLimits";
import { BOARDLY_BOT_USERNAME } from "@/lib/chess/boardlyBot";
import {
  disposeSharedStockfishEngine,
  getSharedStockfishEngine,
  parseUciMove,
} from "@/lib/chess/stockfish";
import type { AwardedBadge } from "@/lib/badges/types";

function mergeEarnedBadges(
  prev: AwardedBadge[],
  incoming: AwardedBadge[] | undefined
): AwardedBadge[] {
  if (!incoming?.length) return prev;
  const seen = new Set(prev.map((b) => b.id));
  const out = [...prev];
  for (const b of incoming) {
    if (!seen.has(b.id)) {
      seen.add(b.id);
      out.push(b);
    }
  }
  return out;
}

/** Tiled fractal noise for CRT-style static (SVG filter). */
const REPLAY_TV_NOISE_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>'
  );

type PromotionPiece = "q" | "r" | "b" | "n";

function botDifficultyMsgKey(
  level: number
):
  | "botDifficultyBeginner"
  | "botDifficultyEasy"
  | "botDifficultyMedium"
  | "botDifficultyHard" {
  if (level === 1) return "botDifficultyBeginner";
  if (level <= 4) return "botDifficultyEasy";
  if (level <= 10) return "botDifficultyMedium";
  return "botDifficultyHard";
}

function needsPromotionChoice(fen: string, from: Square, to: Square): boolean {
  const chess = new Chess(fen);
  const moves = chess.moves({ square: from, verbose: true });
  return moves.some((m) => m.to === to && m.promotion !== undefined);
}

type Sfx = Pick<
  ReturnType<typeof useSoundEffects>,
  "playMove" | "playCapture" | "playCheck" | "playDraw" | "playGameOver"
>;

function playPieceMoveSounds(prevFen: string, san: string, sfx: Sfx): void {
  const c = new Chess(prevFen);
  const mv = c.move(san);
  if (!mv) return;
  if (c.isCheckmate()) return;
  if (mv.captured) void sfx.playCapture();
  else if (c.inCheck()) void sfx.playCheck();
  else void sfx.playMove();
}

function playGameEndFromChessResult(
  result: string | null | undefined,
  winnerId: string | null | undefined,
  myId: string,
  sfx: Sfx
): void {
  if (result === "stalemate" || result === "draw") {
    void sfx.playDraw();
    return;
  }
  if (result === "checkmate") {
    void sfx.playGameOver(winnerId === myId ? "win" : "loss");
    return;
  }
  void sfx.playDraw();
}

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
  moveCount,
  isBoardlyBot,
  difficultyLabel,
}: {
  username: string;
  avatarUrl: string | null;
  color: "white" | "black";
  isCurrentUser: boolean;
  isTheirTurn: boolean;
  timer?: React.ReactNode;
  moveCount: number;
  /** Robot avatar + styling for the Stockfish opponent row. */
  isBoardlyBot?: boolean;
  /** Short translated preset label (Easy / Medium / …). */
  difficultyLabel?: string | null;
}) {
  const t = useTranslations("game");
  const initials = username.slice(0, 2).toUpperCase();
  const [avatarError, setAvatarError] = useState(false);
  const showAvatar =
    !!avatarUrl && !avatarError && isNextImageCompatibleSrc(avatarUrl);

  return (
    <div
      className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-2xl border transition-colors ${
        isCurrentUser
          ? "bg-orange-50 border-orange-200"
          : "bg-white border-gray-100"
      }`}
    >
      <div className="relative flex-shrink-0">
        {isBoardlyBot ? (
          <div className="w-10 h-10 rounded-full ring-2 ring-violet-200 bg-violet-50 flex items-center justify-center text-xl select-none">
            🤖
          </div>
        ) : showAvatar ? (
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
        ) : avatarUrl && !isNextImageCompatibleSrc(avatarUrl) ? (
          <div className="w-10 h-10 rounded-full ring-2 ring-orange-100 bg-orange-50 flex items-center justify-center text-xl select-none">
            {avatarUrl}
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
        <p className="font-semibold text-gray-900 text-sm truncate flex flex-wrap items-center gap-1.5">
          <span className="truncate">{username}</span>
          {isBoardlyBot && difficultyLabel ? (
            <Badge
              variant="secondary"
              className="shrink-0 text-[10px] font-semibold px-2 py-0 bg-violet-100 text-violet-800 border-violet-200"
            >
              {difficultyLabel}
            </Badge>
          ) : null}
          {isCurrentUser && (
            <span className="text-xs font-normal text-orange-500">{t("you")}</span>
          )}
          <span className="text-xs font-normal text-gray-400 tabular-nums">{moveCount}</span>
        </p>
        <p className="flex items-center gap-1 text-xs text-gray-400">
          <span className="text-base chess-sym">{color === "white" ? "♔" : "♚"}</span>
          {color === "white" ? t("white") : t("black")}
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
            {isCurrentUser ? t("yourTurn") : t("thinking")}
          </span>
        )}
      </div>
    </div>
  );
}

const CAPTURED_ORDER: Array<{
  key: keyof CapturedPieces;
  code: "P" | "B" | "N" | "R" | "Q";
}> = [
  { key: "pawns", code: "P" },
  { key: "bishops", code: "B" },
  { key: "knights", code: "N" },
  { key: "rooks", code: "R" },
  { key: "queens", code: "Q" },
];

function CapturedPiecesStrip({
  captured,
  capturedByColor,
  capturedPoints,
  customPieces,
}: {
  captured: CapturedPieces;
  capturedByColor: "white" | "black";
  /** Sum of material values for pieces this player has captured (no comparison to opponent). */
  capturedPoints: number;
  customPieces: PieceRenderObject;
}) {
  const capturedPieceColor = capturedByColor === "white" ? "b" : "w";

  return (
    <div className="h-6 flex items-center justify-end gap-1.5 pr-1">
      <div className="flex items-center gap-1">
        {CAPTURED_ORDER.map(({ key, code }) => {
          const count = captured[key];
          if (count <= 0) return null;
          const pieceCode = `${capturedPieceColor}${code}`;
          return (
            <div key={key} className="flex items-center -space-x-1">
              {Array.from({ length: count }).map((_, idx) => (
                <div
                  key={`${key}-${idx}`}
                  className="w-5 h-5 sm:w-6 sm:h-6 opacity-75"
                >
                  {customPieces[pieceCode]?.({
                    svgStyle: { width: "100%", height: "100%" },
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <span className="text-xs font-medium text-gray-500 tabular-nums min-w-[1ch]">
        {capturedPoints}
      </span>
    </div>
  );
}

// ── Status banner ─────────────────────────────────────────────────────────────
function StatusBanner({
  status,
  currentTurn,
  myColor,
  submitting,
  vsBot,
  botThinking,
}: {
  status: GamePageData["status"];
  currentTurn: "white" | "black";
  myColor: "white" | "black";
  submitting: boolean;
  vsBot?: boolean;
  botThinking?: boolean;
}) {
  const t = useTranslations("game");

  if (status === "waiting") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-xl text-sm text-gray-500 font-medium">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        {t("waitingForOpponent")}
      </div>
    );
  }

  if (status === "completed" || status === "abandoned") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-xl text-sm text-gray-500 font-medium">
        {t("gameEnded")}
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
        {t("submitting")}
      </div>
    );
  }

  if (vsBot && botThinking && status === "active") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-xl text-sm font-semibold">
        <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        {t("botThinking")}
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
          {t("yourTurn")}
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          {t("opponentsTurn")}
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
  opponentOnline,
  rematchDeclined,
  rematchWaiting,
  onRematch,
  rematchLoading,
  onDashboard,
  onInviteToNewGame,
  onReviewGame,
  canReviewGame,
  exitGameLabel,
  reviewGameLabel,
  isGuest,
  guestCanPlayMore,
  onCreateAccount,
  onPlayAsGuest,
  vsBot,
  badgesEarned,
}: {
  result: GameResult | string | null;
  iWon: boolean;
  isDraw: boolean;
  opponentOnline: boolean;
  rematchDeclined: boolean;
  rematchWaiting: boolean;
  onRematch: () => void;
  rematchLoading: boolean;
  onDashboard: () => void;
  onInviteToNewGame?: () => void;
  onReviewGame?: () => void;
  canReviewGame?: boolean;
  /** When set (e.g. guests), replaces "Back to dashboard" button text. */
  exitGameLabel?: string;
  reviewGameLabel: string;
  isGuest?: boolean;
  guestCanPlayMore?: boolean;
  onCreateAccount?: () => void;
  onPlayAsGuest?: () => void;
  /** Bot opponent: rematch always available, no presence / invite UI. */
  vsBot?: boolean;
  badgesEarned?: AwardedBadge[];
}) {
  const t = useTranslations("gameOver");
  const rematchDisabled = vsBot
    ? rematchLoading
    : rematchLoading || !opponentOnline || rematchDeclined || rematchWaiting;
  const rematchTitle = vsBot
    ? undefined
    : !opponentOnline
      ? t("opponentLeftRematch")
      : rematchDeclined
        ? t("rematchDeclinedHint")
        : undefined;

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(_isOpen, eventDetails) => {
        if (!_isOpen) {
          eventDetails.preventUnmountOnClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/50 supports-backdrop-filter:backdrop-blur-sm"
        className="max-w-xs w-full gap-0 border-0 bg-transparent p-0 text-gray-900 shadow-none ring-0 sm:max-w-xs data-open:animate-none data-closed:animate-none"
      >
        <motion.div
          initial={{ scale: 0.75, opacity: 0, y: 32 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 320 }}
          className="bg-white rounded-3xl p-8 text-center shadow-2xl"
        >
        {result === "timeout" ? (
          <>
            <div className="text-6xl mb-4 select-none">{iWon ? "⏰" : "⌛"}</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
              {iWon ? t("wonOnTime") : t("timesUp")}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {iWon ? t("opponentRanOutOfTime") : t("clockRanOut")}
            </p>
          </>
        ) : result === "resignation" ? (
          <>
            <div className="text-6xl mb-4 select-none">{iWon ? "🏳️" : "🏆"}</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
              {iWon ? t("opponentResigned") : t("youResigned")}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {iWon ? t("opponentThrewTowel") : t("discretion")}
            </p>
          </>
        ) : isDraw ? (
          <>
            <div className="text-6xl mb-4 select-none">🤝</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
              {t("draw")}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {result === "stalemate" ? t("stalemate") : t("wellPlayed")}
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
              {t("youWon")}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {t("outstanding")}
            </p>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4 select-none">😔</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
              {t("youLost")}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {t("everyMasterDesc")}
            </p>
          </>
        )}

        {/* Only badges newly awarded this game — omit section when API returned none */}
        {badgesEarned && badgesEarned.length > 0 ? (
          <div className="mb-6 rounded-2xl border border-violet-100 bg-violet-50/80 px-4 py-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 mb-2">
              {t("badgesEarnedTitle")}
            </p>
            <ul className="space-y-1.5">
              {badgesEarned.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-2 text-sm font-medium text-gray-800"
                >
                  <span className="text-lg shrink-0" aria-hidden>
                    {b.icon}
                  </span>
                  <span>{b.name}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {isGuest ? (
            <>
              <p className="text-sm text-gray-600 mb-1">
                {t("guestPromptTitle")}
              </p>
              <Button
                type="button"
                onClick={onCreateAccount}
                className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-md"
              >
                {t("guestPromptCreateAccount")}
              </Button>
              {guestCanPlayMore && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onPlayAsGuest}
                  className="w-full rounded-xl border-gray-200 text-gray-700"
                >
                  {t("guestPromptPlayAsGuest")}
                </Button>
              )}
            </>
          ) : rematchWaiting && !vsBot ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-orange-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                {t("waitingForRematchAccept")}
              </p>
              {canReviewGame && onReviewGame && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onReviewGame}
                  disabled={rematchLoading}
                  className="w-full rounded-xl border-violet-200 text-violet-800 hover:bg-violet-50"
                >
                  {reviewGameLabel}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={onDashboard}
                className="w-full rounded-xl border-gray-200 text-gray-600"
              >
                {exitGameLabel ?? t("backToDashboard")}
              </Button>
            </div>
          ) : (
            <>
              {rematchDeclined && !vsBot && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  {t("rematchDeclinedMessage")}
                </p>
              )}
              <Button
                type="button"
                onClick={onRematch}
                disabled={rematchLoading || rematchDisabled}
                title={rematchTitle}
                className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-md disabled:opacity-50 disabled:pointer-events-auto"
              >
                {rematchLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      />
                    </svg>
                    {t("rematchCreating")}
                  </span>
                ) : (
                  t("rematch")
                )}
              </Button>
              {!vsBot && !opponentOnline && !rematchDeclined && (
                <p className="text-xs text-gray-500">{t("opponentLeftRematch")}</p>
              )}
              {!vsBot && !opponentOnline && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onInviteToNewGame}
                  disabled={rematchLoading}
                  className="w-full rounded-xl border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  Invite to a new game
                </Button>
              )}
              {canReviewGame && onReviewGame && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onReviewGame}
                  disabled={rematchLoading}
                  className="w-full rounded-xl border-violet-200 text-violet-800 hover:bg-violet-50"
                >
                  {reviewGameLabel}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={onDashboard}
                disabled={rematchLoading}
                className="w-full rounded-xl border-gray-200 text-gray-600"
              >
                {exitGameLabel ?? t("backToDashboard")}
              </Button>
            </>
          )}
        </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

// ── Guest account banner ─────────────────────────────────────────────────────
function GuestPlayingBanner({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("game");

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="w-full max-w-[900px] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-2xl bg-amber-50/90 border border-amber-200/80 text-sm text-amber-950 shadow-sm"
    >
      <p className="flex-1 text-center sm:text-left leading-snug">{t("guestBanner")}</p>
      <div className="flex items-center justify-center gap-2 flex-shrink-0">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-semibold h-9 px-4 shadow-sm transition-colors"
        >
          {t("guestBannerSignUp")}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-amber-800/70 hover:bg-amber-100/80 transition-colors"
          aria-label={t("guestBannerDismiss")}
        >
          <XCircle className="w-5 h-5" />
        </button>
      </div>
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
  const t = useTranslations("resign");

  return (
    <AlertDialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !loading) onCancel();
      }}
    >
      <AlertDialogContent
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-sm"
        className="max-w-xs gap-0 border-0 p-0 text-center text-gray-900 shadow-xl ring-0 data-open:animate-none data-closed:animate-none sm:max-w-xs"
        size="default"
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 24, stiffness: 340 }}
          className="rounded-2xl bg-white p-6"
        >
          <div className="text-4xl mb-3">🏳️</div>
          <AlertDialogHeader className="text-center sm:text-center">
            <AlertDialogTitle className="text-lg font-bold text-gray-900">
              {t("title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500">
              {t("desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-xl border-gray-200 text-gray-600"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 rounded-xl bg-red-500 font-semibold text-white hover:bg-red-600"
            >
              {loading ? t("resigning") : t("confirm")}
            </Button>
          </div>
        </motion.div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Pawn promotion (modal styled like the rest of the app) ───────────────────
function PromotionDialog({
  myColor,
  customPieces,
  onSelect,
  onCancel,
}: {
  myColor: "white" | "black";
  customPieces: PieceRenderObject;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("game");
  const prefix = myColor === "white" ? "w" : "b";
  const choices: {
    piece: PromotionPiece;
    code: string;
    label: "promoteQueen" | "promoteRook" | "promoteBishop" | "promoteKnight";
  }[] = [
    { piece: "q", code: `${prefix}Q`, label: "promoteQueen" },
    { piece: "r", code: `${prefix}R`, label: "promoteRook" },
    { piece: "b", code: `${prefix}B`, label: "promoteBishop" },
    { piece: "n", code: `${prefix}N`, label: "promoteKnight" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[50] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promotion-dialog-title"
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 360 }}
        className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-orange-100"
      >
        <h3
          id="promotion-dialog-title"
          className="text-lg font-bold text-gray-900 text-center mb-1"
        >
          {t("promotionTitle")}
        </h3>
        <p className="text-sm text-gray-500 text-center mb-5">{t("promotionDesc")}</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {choices.map(({ piece, code, label }) => (
            <button
              key={piece}
              type="button"
              onClick={() => onSelect(piece)}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-orange-100 bg-orange-50/40 hover:bg-orange-50 hover:border-orange-200 active:scale-[0.98] transition-all py-4 px-2"
            >
              <div className="w-14 h-14 flex items-center justify-center">
                {customPieces[code]?.({
                  svgStyle: { width: "100%", height: "100%" },
                })}
              </div>
              <span className="text-xs font-semibold text-gray-700">{t(label)}</span>
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="w-full rounded-xl border-gray-200 text-gray-600"
        >
          {t("promotionCancel")}
        </Button>
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

function MoveHistoryNavButtons({
  viewPlyIndex,
  movesLength,
  onPrev,
  onNext,
  className,
  /** Slightly larger tap targets — use next to the mobile Moves button. */
  compact,
}: {
  viewPlyIndex: number;
  movesLength: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations("game");
  const btn = compact
    ? "inline-flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0 rounded-xl border border-gray-200 bg-white text-lg font-semibold text-gray-800 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
    : "inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border border-gray-200 bg-white text-lg font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className={cn("flex items-center gap-1 justify-center", className)}>
      <button
        type="button"
        className={btn}
        onClick={onPrev}
        disabled={viewPlyIndex <= 0}
        aria-label={t("replayPrev")}
        title={t("replayPrev")}
      >
        ←
      </button>
      <button
        type="button"
        className={btn}
        onClick={onNext}
        disabled={viewPlyIndex >= movesLength}
        aria-label={t("replayNext")}
        title={t("replayNext")}
      >
        →
      </button>
    </div>
  );
}

function MoveHistoryPanel({
  moves,
  className,
  hideHeader,
  highlightHalfMoveIndex,
  onSelectHalfMove,
  headerNav,
  headerEnd,
  headerVariant = "sidebar",
}: {
  moves: MoveRecord[];
  className?: string;
  hideHeader?: boolean;
  /**
   * Omitted: highlight the latest half-move (live play).
   * `null`: no half-move highlighted (e.g. replay at start position).
   * `number`: highlight `moves[index]` (replay scrubber).
   */
  highlightHalfMoveIndex?: number | null;
  /** Jump review to the position after this half-move (`moves[index]`). */
  onSelectHalfMove?: (halfMoveIndex: number) => void;
  /** e.g. prev/next replay controls — same row as the Moves title (desktop sidebar + mobile sheet). */
  headerNav?: ReactNode;
  /** e.g. close button on mobile moves sheet. */
  headerEnd?: ReactNode;
  /** `sheet`: larger title/padding for the bottom sheet. */
  headerVariant?: "sidebar" | "sheet";
}) {
  const t = useTranslations("game");
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);
  const pairs = buildMovePairs(moves);

  const useExplicitHighlight = highlightHalfMoveIndex !== undefined;

  // Live play: keep scrolled to bottom on new moves. Replay: scroll active row into view.
  useEffect(() => {
    if (useExplicitHighlight) {
      activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moves.length, useExplicitHighlight, highlightHalfMoveIndex]);

  return (
    <div
      className={`flex min-h-0 max-h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white ${className ?? ""}`}
    >
      {!hideHeader && (
        <div
          className={cn(
            "border-b border-gray-100 flex-shrink-0 flex items-center justify-between gap-2 min-h-[44px]",
            headerVariant === "sheet" ? "px-5 py-3" : "px-4 py-3"
          )}
        >
          <h3
            className={cn(
              "truncate min-w-0 flex-1",
              headerVariant === "sheet"
                ? "text-base font-bold text-gray-900"
                : "text-sm font-semibold text-gray-700"
            )}
          >
            {t("moves")}
            {moves.length > 0 && (
              <span
                className={cn(
                  "ml-1.5 font-normal text-gray-400 tabular-nums",
                  headerVariant === "sheet" ? "text-sm" : "text-xs"
                )}
              >
                ({moves.length})
              </span>
            )}
          </h3>
          {(headerNav || headerEnd) && (
            <div className="flex shrink-0 items-center gap-2">
              {headerNav}
              {headerEnd}
            </div>
          )}
        </div>
      )}
      <div className="min-h-0 max-h-full flex-1 overflow-x-hidden overflow-y-auto p-2">
        {pairs.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">{t("noMovesYet")}</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="w-6 px-2 pb-1.5 text-left" />
                <th className="px-2 pb-1.5 text-left font-semibold text-gray-400 tracking-wide uppercase text-[10px] w-1/2">
                  {t("white")}
                </th>
                <th className="px-2 pb-1.5 text-left font-semibold text-gray-400 tracking-wide uppercase text-[10px] w-1/2">
                  {t("black")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair, idx) => {
                const isLastPair = idx === pairs.length - 1;
                const whiteMoveIndex = idx * 2;
                const blackMoveIndex = idx * 2 + 1;

                let whiteIsLatest: boolean;
                let blackIsLatest: boolean;
                if (useExplicitHighlight) {
                  whiteIsLatest =
                    highlightHalfMoveIndex !== null &&
                    highlightHalfMoveIndex === whiteMoveIndex;
                  blackIsLatest =
                    highlightHalfMoveIndex !== null &&
                    highlightHalfMoveIndex === blackMoveIndex;
                } else {
                  whiteIsLatest = isLastPair && pair.black === null;
                  blackIsLatest = isLastPair && pair.black !== null;
                }

                const rowIsActive = whiteIsLatest || blackIsLatest;
                const interactive = !!onSelectHalfMove;
                const whiteBtnClass = `inline-block w-full px-1.5 py-0.5 font-mono font-semibold rounded text-left transition-colors ${
                  whiteIsLatest
                    ? "bg-orange-200 text-orange-800"
                    : interactive
                    ? "text-gray-800 hover:bg-orange-50/80 cursor-pointer"
                    : "text-gray-800"
                }`;
                const blackBtnClass = (hasMove: boolean) =>
                  `inline-block w-full px-1.5 py-0.5 font-mono font-medium rounded text-left transition-colors ${
                    blackIsLatest
                      ? "bg-orange-200 text-orange-800"
                      : !hasMove
                      ? "text-gray-400"
                      : interactive
                      ? "text-gray-800 hover:bg-orange-50/80 cursor-pointer"
                      : "text-gray-800"
                  }`;
                return (
                  <tr
                    key={pair.moveNumber}
                    ref={rowIsActive ? activeRowRef : undefined}
                    className={idx % 2 === 0 ? "bg-gray-50/60" : ""}
                  >
                    <td className="w-6 px-2 py-1 text-gray-300 font-medium select-none tabular-nums">
                      {pair.moveNumber}.
                    </td>
                    <td className="px-1 py-0.5 w-1/2">
                      {interactive ? (
                        <button
                          type="button"
                          onClick={() => onSelectHalfMove(whiteMoveIndex)}
                          className={whiteBtnClass}
                          aria-label={t("replayGoToMove", { san: pair.white })}
                        >
                          {pair.white}
                        </button>
                      ) : (
                        <span
                          className={`inline-block w-full px-1.5 py-0.5 font-mono font-semibold rounded ${
                            whiteIsLatest
                              ? "bg-orange-200 text-orange-800"
                              : "text-gray-800"
                          }`}
                        >
                          {pair.white}
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-0.5 w-1/2">
                      {pair.black == null ? (
                        <span className="inline-block w-full px-1.5 py-0.5 font-mono font-medium rounded text-gray-400" />
                      ) : interactive ? (
                        <button
                          type="button"
                          onClick={() => onSelectHalfMove(blackMoveIndex)}
                          className={blackBtnClass(true)}
                          aria-label={t("replayGoToMove", { san: pair.black })}
                        >
                          {pair.black}
                        </button>
                      ) : (
                        <span
                          className={`inline-block w-full px-1.5 py-0.5 font-mono font-medium rounded ${
                            blackIsLatest
                              ? "bg-orange-200 text-orange-800"
                              : "text-gray-800"
                          }`}
                        >
                          {pair.black}
                        </span>
                      )}
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
  const t = useTranslations("drawOffer");

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl text-sm"
    >
      <span className="text-xl">🤝</span>
      <p className="flex-1 text-blue-800 font-medium">
        {t("opponentOffers")}
      </p>
      <button
        onClick={onDecline}
        disabled={loading}
        className="px-3 py-1 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
      >
        {t("decline")}
      </button>
      <button
        onClick={onAccept}
        disabled={loading}
        className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {loading ? "…" : t("accept")}
      </button>
    </motion.div>
  );
}

// ── Rematch offer (broadcast, above game-over modal) ─────────────────────────
function RematchOfferBanner({
  onAccept,
  onDecline,
  loading,
}: {
  onAccept: () => void;
  onDecline: () => void;
  loading: boolean;
}) {
  const t = useTranslations("rematchOffer");

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="fixed left-1/2 top-20 z-[60] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 flex items-center gap-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-2xl text-sm shadow-lg"
    >
      <span className="text-xl" aria-hidden>
        ♟️
      </span>
      <p className="flex-1 text-violet-900 font-medium">{t("opponentWantsRematch")}</p>
      <button
        type="button"
        onClick={onDecline}
        disabled={loading}
        className="px-3 py-1 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
      >
        {t("decline")}
      </button>
      <button
        type="button"
        onClick={onAccept}
        disabled={loading}
        className="px-3 py-1 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
      >
        {loading ? "…" : t("accept")}
      </button>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function GamePageClient({ game, currentUser }: Props) {
  const router = useRouter();
  const t = useTranslations("game");
  const tGameOver = useTranslations("gameOver");
  const tDrawOffer = useTranslations("drawOffer");
  /** Box-shadow only (no translate) so @dnd-kit drag coordinates stay aligned with the board. */
  const boardShakeHostRef = useRef<HTMLDivElement | null>(null);

  const shake = useCallback(async () => {
    const el = boardShakeHostRef.current;
    if (!el) return;
    const base =
      "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(254, 243, 199, 1)";
    await animate(
      el,
      {
        boxShadow: [
          base,
          "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 4px rgba(239, 68, 68, 0.45)",
          "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 2px rgba(239, 68, 68, 0.25)",
          base,
        ],
      },
      { duration: 0.45, ease: "easeInOut" }
    );
  }, []);

  const shakeRef = useRef(shake);
  shakeRef.current = shake;

  const [showGuestBanner, setShowGuestBanner] = useState(false);
  const [guestGamesCount, setGuestGamesCount] = useState(0);
  useEffect(() => {
    if (!currentUser.isGuest) return;
    try {
      const dismissed = localStorage.getItem(
        `boardly_guest_banner_dismissed:${currentUser.id}`
      );
      setShowGuestBanner(!dismissed);
    } catch {
      setShowGuestBanner(true);
    }
  }, [currentUser.id, currentUser.isGuest]);

  useEffect(() => {
    if (!currentUser.isGuest) return;
    setGuestGamesCount(getGuestGamesCount());
  }, [currentUser.isGuest]);

  function dismissGuestBanner() {
    try {
      localStorage.setItem(
        `boardly_guest_banner_dismissed:${currentUser.id}`,
        "1"
      );
    } catch {
      /* ignore */
    }
    setShowGuestBanner(false);
  }

  const pendingRematchGameIdRef = useRef<string | null>(null);
  const [incomingRematchGameId, setIncomingRematchGameId] = useState<
    string | null
  >(null);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const [rematchDeclined, setRematchDeclined] = useState(false);
  const [rematchRespondLoading, setRematchRespondLoading] = useState(false);

  useEffect(() => {
    pendingRematchGameIdRef.current = null;
    setIncomingRematchGameId(null);
    setRematchWaiting(false);
    setRematchDeclined(false);
  }, [game.id]);

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
    drawOfferedBy,
    setDrawOfferedBy,
    opponentOnline,
    sendRematchOffer,
    sendRematchAccept,
    sendRematchDecline,
  } = useGameRealtime(
    game.id,
    game.state.fen,
    game.status,
    {
      turn_started_at: game.state.turn_started_at,
      white_time_ms: game.state.white_time_ms,
      black_time_ms: game.state.black_time_ms,
    },
    {
      userId: currentUser.id,
      opponentId: game.opponent?.id ?? null,
      onRematchOffer: (p) => {
        if (p.fromUserId === currentUser.id) return;
        setIncomingRematchGameId(p.newGameId);
      },
      onRematchAccept: (p) => {
        if (p.fromUserId === currentUser.id) return;
        if (p.newGameId === pendingRematchGameIdRef.current) {
          router.push(`/game/${p.newGameId}`);
        }
      },
      onRematchDecline: async () => {
        const id = pendingRematchGameIdRef.current;
        setRematchWaiting(false);
        setRematchDeclined(true);
        pendingRematchGameIdRef.current = null;
        if (id) {
          try {
            await fetch(`/api/games/${id}/decline-rematch`, { method: "POST" });
          } catch {
            /* ignore */
          }
        }
      },
    }
  );

  const {
    pieceSet,
    gamePieceSet,
    globalPieceSet,
    setGamePieceSet,
    setGlobalPieceSet,
    clearGamePieceSet,
  } = usePieceSet(game.id);
  const {
    boardTheme,
    gameBoardTheme,
    globalBoardTheme,
    setGameBoardTheme,
    setGlobalBoardTheme,
    clearGameBoardTheme,
  } = useBoardTheme(game.id);
  const boardStyles = getBoardThemeStyles(boardTheme);
  const customPieces = buildPieces(pieceSet);

  const sfx = useSoundEffects();
  const sfxRef = useRef(sfx);
  sfxRef.current = sfx;

  /** Avoid duplicate end-game sounds (local action + realtime update). */
  const endSoundPlayedRef = useRef(false);
  useEffect(() => {
    endSoundPlayedRef.current = false;
  }, [game.id]);

  const [submitting, setSubmitting] = useState(false);
  const [showResignDialog, setShowResignDialog] = useState(false);
  const [resignLoading, setResignLoading] = useState(false);
  const [drawLoading, setDrawLoading] = useState(false);
  const [badgesEarnedThisGame, setBadgesEarnedThisGame] = useState<
    AwardedBadge[]
  >([]);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [movesSheetOpen, setMovesSheetOpen] = useState(false);
  const [promotionAt, setPromotionAt] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [gameName, setGameName] = useState(game.name ?? "");
  const [draftGameName, setDraftGameName] = useState(game.name ?? "");
  const [isEditingGameName, setIsEditingGameName] = useState(false);
  const [savingGameName, setSavingGameName] = useState(false);

  /**
   * Ply count after which the board shows live `fen` (0 = start, `moves.length` = current).
   */
  const [viewPlyIndex, setViewPlyIndex] = useState(0);
  const prevMovesLenRef = useRef(0);
  /** Bot POST path can force one animated ply (see chessboardAnimMs). */
  const shouldAnimateNextMoveRef = useRef(false);
  /** Last `displayFen` committed (updated in layout); used to detect external position changes. */
  const prevDisplayFenRef = useRef(game.state.fen);
  /** Optimistic local line: `setFen` is deferred; skip anim until React `fen` matches this. */
  const playerPendingLocalFenRef = useRef<string | null>(null);
  /**
   * Supabase often delivers `games` UPDATE right after `moves` INSERT; a second React render
   * would pass `animationDurationInMs: 0` for the same FEN and react-chessboard cancels the
   * in-flight piece animation. Hold duration > 0 briefly for that stable `displayFen`.
   */
  const persistBoardAnimUntilRef = useRef(0);
  const persistBoardAnimFenRef = useRef<string | null>(null);
  /** Invalidates deferred `setFen` from `applyMove` if the server rejects before the microtask runs. */
  const liveFenApplyGenRef = useRef(0);
  /** Live-position board FEN passed to Chessboard; updated synchronously on legal drops (+ bump). */
  const boardPositionRef = useRef(game.state.fen);
  const [, bumpChessboardRender] = useReducer((x: number) => x + 1, 0);
  const prevAtLivePositionRef = useRef(false);

  const [pendingLastMove, setPendingLastMove] = useState<LastMoveSquares | null>(
    null
  );

  useEffect(() => {
    prevMovesLenRef.current = 0;
    setViewPlyIndex(0);
    prevDisplayFenRef.current = game.state.fen;
    playerPendingLocalFenRef.current = null;
    persistBoardAnimUntilRef.current = 0;
    persistBoardAnimFenRef.current = null;
    shouldAnimateNextMoveRef.current = false;
    liveFenApplyGenRef.current++;
    boardPositionRef.current = game.state.fen;
    prevAtLivePositionRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset board only when switching games (avoid resetting mid-game on every fen tick)
  }, [game.id]);

  useEffect(() => {
    setBadgesEarnedThisGame([]);
  }, [game.id]);

  useEffect(() => {
    const initialName = game.name ?? "";
    setGameName(initialName);
    setDraftGameName(initialName);
    setIsEditingGameName(false);
    setSavingGameName(false);
  }, [game.id, game.name]);

  useEffect(() => {
    const prev = prevMovesLenRef.current;
    if (moves.length > prev) {
      setViewPlyIndex(moves.length);
    } else {
      setViewPlyIndex((i) => Math.min(i, moves.length));
    }
    prevMovesLenRef.current = moves.length;
  }, [moves.length]);

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

  const atLivePosition = viewPlyIndex === moves.length;

  const historyFen = useMemo(() => {
    if (viewPlyIndex <= 0) return INITIAL_FEN;
    return moves[viewPlyIndex - 1]?.fen_after ?? INITIAL_FEN;
  }, [viewPlyIndex, moves]);

  const awaitingPlayerFenCommit =
    playerPendingLocalFenRef.current !== null &&
    fen !== playerPendingLocalFenRef.current;

  if (
    atLivePosition &&
    !awaitingPlayerFenCommit &&
    fen !== boardPositionRef.current
  ) {
    boardPositionRef.current = fen;
  }

  const displayFen =
    moves.length > 0 && !atLivePosition ? historyFen : boardPositionRef.current;

  const historyLastMove = useMemo(() => {
    if (atLivePosition || viewPlyIndex === 0) return null;
    return getLastMoveSquaresFromMoves(
      moves.slice(0, viewPlyIndex),
      INITIAL_FEN
    );
  }, [atLivePosition, viewPlyIndex, moves]);

  const effectiveLastMove = atLivePosition ? lastMove : historyLastMove;

  const { inCheck, kingSquare } = useMemo(
    () => getCheckHighlight(displayFen),
    [displayFen]
  );

  const squareStyles = useMemo(
    () => getSquareStyles(effectiveLastMove, inCheck, kingSquare),
    [effectiveLastMove, inCheck, kingSquare]
  );

  /** While browsing past moves, return to the live position (e.g. user tries to drag or clicks). */
  const snapToLiveIfBrowsingHistory = useCallback(() => {
    if (!atLivePosition) {
      setViewPlyIndex(moves.length);
    }
  }, [atLivePosition, moves.length]);

  useEffect(() => {
    if (moves.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.getAttribute("contenteditable") === "true")
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setViewPlyIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setViewPlyIndex((i) => Math.min(moves.length, i + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moves.length]);

  // Opponent moves (and sync’d batches): play once per new move, skip initial history load
  const movesSyncRef = useRef({ ready: false, prevLen: 0 });
  useEffect(() => {
    if (!movesSyncRef.current.ready) {
      if (moves.length > 0) {
        movesSyncRef.current = { ready: true, prevLen: moves.length };
      }
      return;
    }
    if (moves.length < movesSyncRef.current.prevLen) {
      movesSyncRef.current.prevLen = moves.length;
      return;
    }
    if (moves.length === movesSyncRef.current.prevLen) return;

    const base = movesSyncRef.current.prevLen;
    const chunk = moves.slice(base);
    movesSyncRef.current.prevLen = moves.length;

    const api = sfxRef.current;
    for (let i = 0; i < chunk.length; i++) {
      const m = chunk[i];
      if (m.user_id === currentUser.id) continue;

      const idx = base + i;
      const prevFen = idx === 0 ? INITIAL_FEN : moves[idx - 1].fen_after;
      const after = new Chess(m.fen_after);

      if (after.isGameOver()) {
        if (!endSoundPlayedRef.current) {
          endSoundPlayedRef.current = true;
          if (after.isCheckmate()) {
            void api.playGameOver(m.user_id === currentUser.id ? "win" : "loss");
          } else {
            void api.playDraw();
          }
        }
        continue;
      }

      playPieceMoveSounds(prevFen, m.move_san, api);
    }
  }, [moves, currentUser.id]);

  // ── Game-over resolution ─────────────────────────────────────────────────
  const isAlreadyOver =
    game.status === "completed" || game.status === "abandoned";

  const showModal = isAlreadyOver || realtimeGameOver;
  /** Hide while scrubbing so the board stays visible (same as former replay mode). */
  const showGameOverModal =
    showModal && viewPlyIndex === moves.length;

  const displayResult: string | null =
    realtimeGameResult ?? game.state.result ?? null;
  const displayWinnerId: string | null =
    realtimeWinnerId ?? game.winner_id ?? null;

  const isDraw =
    displayResult === "draw" || displayResult === "stalemate";
  const iWon =
    !isDraw && displayWinnerId !== null && displayWinnerId === currentUser.id;

  // Opponent resigned via games row update (no new move in the same event)
  useEffect(() => {
    if (!realtimeGameOver || endSoundPlayedRef.current) return;
    const r = realtimeGameResult ?? game.state.result;
    if (r !== "resignation") return;
    endSoundPlayedRef.current = true;
    const win = displayWinnerId === currentUser.id;
    void sfxRef.current.playGameOver(win ? "win" : "loss");
  }, [realtimeGameOver, realtimeGameResult, game.state.result, displayWinnerId, currentUser.id]);

  // ── Board interactivity ──────────────────────────────────────────────────
  const opponentColor: "white" | "black" =
    game.my_color === "white" ? "black" : "white";
  const whitePlayerId =
    game.my_color === "white" ? currentUser.id : (game.opponent?.id ?? null);
  const blackPlayerId =
    game.my_color === "black" ? currentUser.id : (game.opponent?.id ?? null);

  const moveCounts = useMemo(() => {
    let white = 0;
    let black = 0;
    for (const move of moves) {
      if (move.user_id === whitePlayerId) white += 1;
      else if (move.user_id === blackPlayerId) black += 1;
    }
    return { white, black };
  }, [moves, whitePlayerId, blackPlayerId]);

  const capturedState = useMemo(() => getCapturedPieces(displayFen), [displayFen]);

  const fenTurn = fen.split(" ")[1] === "b" ? "black" : "white";
  const visualTurn =
    displayFen.split(" ")[1] === "b" ? "black" : "white";
  const isMyTurn = fenTurn === game.my_color;

  const canSubmitMove =
    isMyTurn && !submitting && !showModal && atLivePosition;
  const isActiveGame = gameStatus === "active";

  // If you're already on this game with the tab visible, don't leave an unread "your turn" in the bell.
  useEffect(() => {
    if (!isMyTurn || !isActiveGame || showModal) return;

    function dismissYourTurnBell() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      });
    }

    dismissYourTurnBell();
    document.addEventListener("visibilitychange", dismissYourTurnBell);
    return () => document.removeEventListener("visibilitychange", dismissYourTurnBell);
  }, [isMyTurn, isActiveGame, showModal, game.id]);

  // Draw offer is pending from opponent when it was offered by someone else
  const opponentOfferedDraw =
    !!drawOfferedBy && drawOfferedBy !== currentUser.id;
  const iOfferedDraw =
    !!drawOfferedBy && drawOfferedBy === currentUser.id;

  const vsBotGame = !!game.state.vs_bot;
  const fenRef = useRef(fen);
  fenRef.current = fen;
  const [botThinking, setBotThinking] = useState(false);
  useEffect(() => {
    setBotThinking(false);
  }, [game.id]);

  /** One Stockfish reply per distinct `(game, FEN)` while side to move is the bot. */
  const botScheduledTriggerKeyRef = useRef<string | null>(null);
  /** Invalidates in-flight bot async when the effect cleans up (Strict Mode / deps churn). */
  const botTurnEffectSeqRef = useRef(0);
  const botSkillLevel = game.state.bot_difficulty ?? 10;

  /** No piece drag while awaiting server/bot or on the opponent's clock (live position only). */
  const boardPiecesLocked =
    !atLivePosition ||
    showModal ||
    promotionAt != null ||
    submitting ||
    botThinking ||
    !isMyTurn;

  const prevDisplay = prevDisplayFenRef.current;
  const displayChanged = displayFen !== prevDisplay;
  const isPlayerOptimisticDisplay =
    playerPendingLocalFenRef.current !== null &&
    displayFen === playerPendingLocalFenRef.current;

  const animateExternalMove =
    atLivePosition && displayChanged && !isPlayerOptimisticDisplay;

  const animClock =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  if (
    persistBoardAnimFenRef.current !== null &&
    displayFen !== persistBoardAnimFenRef.current
  ) {
    persistBoardAnimUntilRef.current = 0;
    persistBoardAnimFenRef.current = null;
  }

  const baseChessboardAnimMs =
    sfx.respectReducedMotion
      ? 0
      : shouldAnimateNextMoveRef.current || animateExternalMove
        ? 150
        : 0;

  if (baseChessboardAnimMs > 0) {
    persistBoardAnimUntilRef.current = animClock + 175;
    persistBoardAnimFenRef.current = displayFen;
  }

  const chessboardAnimMs =
    sfx.respectReducedMotion
      ? 0
      : Math.max(
          baseChessboardAnimMs,
          animClock < persistBoardAnimUntilRef.current &&
            persistBoardAnimFenRef.current === displayFen
            ? 150
            : 0
        );

  useLayoutEffect(() => {
    if (
      playerPendingLocalFenRef.current !== null &&
      fen === playerPendingLocalFenRef.current
    ) {
      playerPendingLocalFenRef.current = null;
    }
    prevDisplayFenRef.current = displayFen;
  }, [fen, displayFen]);

  useLayoutEffect(() => {
    const enteredLive = atLivePosition && !prevAtLivePositionRef.current;
    prevAtLivePositionRef.current = atLivePosition;
    if (enteredLive) {
      boardPositionRef.current = fen;
      bumpChessboardRender();
    }
  }, [atLivePosition, fen]);

  useLayoutEffect(() => {
    shouldAnimateNextMoveRef.current = false;
  });

  useEffect(() => {
    return () => {
      disposeSharedStockfishEngine();
    };
  }, [game.id]);

  useEffect(() => {
    let cancelled = false;

    if (!vsBotGame || gameStatus !== "active" || showModal || !atLivePosition) {
      botScheduledTriggerKeyRef.current = null;
      return undefined;
    }
    if (promotionAt) return undefined;

    if (fenTurn !== opponentColor) {
      botScheduledTriggerKeyRef.current = null;
      return undefined;
    }

    const triggerKey = `${game.id}:${fen}`;
    if (botScheduledTriggerKeyRef.current === triggerKey) {
      return undefined;
    }

    const seq = ++botTurnEffectSeqRef.current;
    botScheduledTriggerKeyRef.current = triggerKey;

    setBotThinking(true);

    const prevFenForSound = fenRef.current;
    const delayMs = 500 + Math.floor(Math.random() * 1501);

    void (async () => {
      try {
        await new Promise((r) => setTimeout(r, delayMs));
        if (cancelled || seq !== botTurnEffectSeqRef.current) return;

        const chessNow = new Chess(fenRef.current);
        const turnNow = chessNow.turn() === "w" ? "white" : "black";
        if (turnNow !== opponentColor || chessNow.isGameOver()) return;

        const engine = getSharedStockfishEngine();
        try {
          await engine.init();
        } catch (e) {
          console.error("[Bot] engine.init() failed:", e);
          throw e;
        }

        engine.setDifficulty(botSkillLevel);

        const fenForEngine = fenRef.current;
        const uci = await engine.getBestMove(fenForEngine);

        const { from: bf, to: bt, promotion: bp } = parseUciMove(uci);

        if (cancelled || seq !== botTurnEffectSeqRef.current) return;

        const res = await fetch(`/api/moves/${game.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: bf,
            to: bt,
            ...(bp ? { promotion: bp } : {}),
            asBot: true,
          }),
        });

        const data = (await res.json()) as {
          success?: boolean;
          fen?: string;
          san?: string;
          gameOver?: boolean;
          result?: string;
          winnerId?: string | null;
          newBadges?: AwardedBadge[];
          error?: string;
        };

        if (!res.ok) {
          botScheduledTriggerKeyRef.current = null;
          void shakeRef.current();
          return;
        }

        setPendingLastMove({
          from: bf as Square,
          to: bt as Square,
        });

        const fenBeforeApply = fenRef.current;
        if (data.fen && data.fen !== fenBeforeApply) {
          shouldAnimateNextMoveRef.current = true;
          boardPositionRef.current = data.fen;
          flushSync(() => {
            bumpChessboardRender();
          });
          setFen(data.fen);
        }

        const api = sfxRef.current;
        if (data.san) {
          if (data.gameOver) {
            if (!endSoundPlayedRef.current) {
              endSoundPlayedRef.current = true;
              playGameEndFromChessResult(
                data.result,
                data.winnerId,
                currentUser.id,
                api
              );
            }
          } else {
            playPieceMoveSounds(prevFenForSound, data.san, api);
          }
        }

        if (data.gameOver) {
          setBadgesEarnedThisGame((prev) =>
            mergeEarnedBadges(prev, data.newBadges)
          );
          setGameOver(true);
          setGameResult(
            (data.result as import("@/hooks/useGameRealtime").GameResult) ?? null
          );
          setWinnerId(data.winnerId ?? null);
        }
      } catch (err) {
        console.error("[Bot] Error:", err);
        botScheduledTriggerKeyRef.current = null;
        void shakeRef.current();
      } finally {
        setBotThinking(false);
      }
    })();

    return () => {
      cancelled = true;
      botScheduledTriggerKeyRef.current = null;
    };
  }, [
    vsBotGame,
    botSkillLevel,
    game.id,
    gameStatus,
    showModal,
    atLivePosition,
    promotionAt,
    fenTurn,
    fen,
    opponentColor,
    setFen,
    currentUser.id,
    setGameOver,
    setGameResult,
    setWinnerId,
  ]);

  // ── Timeout handler ──────────────────────────────────────────────────────
  const handleTimeout = useCallback(async () => {
    if (showModal) return;
    try {
      const res = await fetch(`/api/moves/${game.id}/timeout`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as {
          winnerId?: string;
          loserId?: string;
          newBadges?: AwardedBadge[];
        };
        if (!endSoundPlayedRef.current) {
          endSoundPlayedRef.current = true;
          const win = data.winnerId === currentUser.id;
          void sfxRef.current.playGameOver(win ? "win" : "loss");
        }
        setBadgesEarnedThisGame((prev) =>
          mergeEarnedBadges(prev, data.newBadges)
        );
        setGameOver(true);
        setGameResult(null);
        setWinnerId(data.winnerId ?? null);
      }
    } catch (err) {
      console.error("[timer] timeout request failed:", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, showModal]);

  const applyMove = useCallback(
    (sourceSquare: string, targetSquare: string, promotion?: PromotionPiece) => {
      if (!canSubmitMove) return false;

      shouldAnimateNextMoveRef.current = false;

      const chess = new Chess(fen);
      let newFen: string;

      try {
        chess.move({
          from: sourceSquare as Square,
          to: targetSquare as Square,
          ...(promotion ? { promotion: promotion as PieceSymbol } : {}),
        });
        newFen = chess.fen();
      } catch {
        void shake();
        return false;
      }

      const prevFen = fen;
      /**
       * react-chessboard v5: defer `setFen` so `handleDragEnd` can set
       * `manuallyDroppedPieceAndSquare` before the controlled `position` prop commits
       * (see ChessboardProvider useEffect([position]) in react-chessboard).
       * Separately: mutate `boardPositionRef` + `flushSync(bumpChessboardRender)` so this
       * render reads the post-drop FEN from the ref in the same turn as `onPieceDrop`,
       * avoiding a frame where React still passes the old position string.
       */
      const gen = ++liveFenApplyGenRef.current;
      playerPendingLocalFenRef.current = newFen;
      boardPositionRef.current = newFen;
      flushSync(() => {
        bumpChessboardRender();
      });
      queueMicrotask(() => {
        if (gen !== liveFenApplyGenRef.current) return;
        setFen(newFen);
      });
      setSubmitting(true);

      const chessAfter = new Chess(newFen);
      if (vsBotGame && !chessAfter.isGameOver()) {
        const stm = chessAfter.turn() === "w" ? "white" : "black";
        if (stm === opponentColor) {
          setBotThinking(true);
        }
      }

      fetch(`/api/moves/${game.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: sourceSquare,
          to: targetSquare,
          ...(promotion ? { promotion } : {}),
        }),
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            success?: boolean;
            fen?: string;
            san?: string;
            gameOver?: boolean;
            result?: string;
            winnerId?: string | null;
            newBadges?: AwardedBadge[];
            error?: string;
          };

          if (!res.ok) {
            liveFenApplyGenRef.current++;
            playerPendingLocalFenRef.current = null;
            prevDisplayFenRef.current = prevFen;
            boardPositionRef.current = prevFen;
            flushSync(() => {
              bumpChessboardRender();
            });
            setFen(prevFen);
            setBotThinking(false);
            void shake();
          } else {
            setPendingLastMove({
              from: sourceSquare as Square,
              to: targetSquare as Square,
            });
            if (data.fen && data.fen !== newFen) {
              playerPendingLocalFenRef.current = null;
              prevDisplayFenRef.current = data.fen;
              boardPositionRef.current = data.fen;
              flushSync(() => {
                bumpChessboardRender();
              });
              setFen(data.fen);
            }

            const api = sfxRef.current;
            if (data.san) {
              if (data.gameOver) {
                if (!endSoundPlayedRef.current) {
                  endSoundPlayedRef.current = true;
                  playGameEndFromChessResult(
                    data.result,
                    data.winnerId,
                    currentUser.id,
                    api
                  );
                }
              } else {
                playPieceMoveSounds(prevFen, data.san, api);
              }
            }

            if (data.gameOver) {
              setBotThinking(false);
              setBadgesEarnedThisGame((prev) =>
                mergeEarnedBadges(prev, data.newBadges)
              );
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
          liveFenApplyGenRef.current++;
          playerPendingLocalFenRef.current = null;
          prevDisplayFenRef.current = prevFen;
          boardPositionRef.current = prevFen;
          flushSync(() => {
            bumpChessboardRender();
          });
          setFen(prevFen);
          setBotThinking(false);
          setPendingLastMove(null);
          void shake();
        })
        .finally(() => {
          setSubmitting(false);
        });

      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canSubmitMove, fen, game.id]
  );

  const handlePieceDropBoard = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      shouldAnimateNextMoveRef.current = false;
      if (!atLivePosition || !targetSquare) return false;
      if (!canSubmitMove) return false;

      if (
        needsPromotionChoice(fen, sourceSquare as Square, targetSquare as Square)
      ) {
        setPromotionAt({ from: sourceSquare, to: targetSquare });
        return false;
      }

      return applyMove(sourceSquare, targetSquare);
    },
    [atLivePosition, canSubmitMove, fen, applyMove]
  );

  // ── Resign ───────────────────────────────────────────────────────────────
  const handleResign = async () => {
    setResignLoading(true);
    try {
      const res = await fetch(`/api/games/${game.id}/resign`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as {
          winnerId?: string | null;
          newBadges?: AwardedBadge[];
        };
        if (!endSoundPlayedRef.current) {
          endSoundPlayedRef.current = true;
          const win = data.winnerId === currentUser.id;
          void sfxRef.current.playGameOver(win ? "win" : "loss");
        }
        setBadgesEarnedThisGame((prev) =>
          mergeEarnedBadges(prev, data.newBadges)
        );
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
  const handleRematch = async () => {
    const vsBotRematch = !!game.state.vs_bot;
    if (
      !vsBotRematch &&
      (!opponentOnline || rematchDeclined || rematchWaiting)
    ) {
      return;
    }
    if (vsBotRematch && rematchLoading) return;

    setRematchLoading(true);
    try {
      const res = await fetch("/api/games/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalGameId: game.id }),
      });
      const data = (await res.json()) as { gameId?: string; error?: string };
      if (!res.ok || !data.gameId) {
        console.error("[rematch]", data.error ?? res.status);
        return;
      }
      if (vsBotRematch) {
        router.push(`/game/${data.gameId}`);
        return;
      }
      pendingRematchGameIdRef.current = data.gameId;
      await sendRematchOffer(data.gameId, currentUser.id);
      setRematchWaiting(true);
    } catch (err) {
      console.error("[rematch]", err);
    } finally {
      setRematchLoading(false);
    }
  };

  const handleAcceptRematchOffer = async () => {
    const gid = incomingRematchGameId;
    if (!gid) return;
    setRematchRespondLoading(true);
    try {
      await sendRematchAccept(gid, currentUser.id);
      router.push(`/game/${gid}`);
    } catch (err) {
      console.error("[rematch accept]", err);
    } finally {
      setRematchRespondLoading(false);
      setIncomingRematchGameId(null);
    }
  };

  const handleDeclineRematchOffer = async () => {
    const gid = incomingRematchGameId;
    if (!gid) return;
    setRematchRespondLoading(true);
    try {
      await fetch(`/api/games/${gid}/decline-rematch`, { method: "POST" });
      await sendRematchDecline(currentUser.id);
    } catch (err) {
      console.error("[rematch decline]", err);
    } finally {
      setIncomingRematchGameId(null);
      setRematchRespondLoading(false);
    }
  };

  const handleDrawAction = async (action: "offer" | "accept" | "decline") => {
    setDrawLoading(true);
    try {
      const res = await fetch(`/api/games/${game.id}/draw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      let data = {} as {
        success?: boolean;
        botResponse?: "accepted" | "declined";
        drawCompleted?: boolean;
        newBadges?: AwardedBadge[];
      };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* non-JSON error body */
      }
      if (!res.ok) return;

      const drawFinished =
        action === "accept" ||
        (action === "offer" &&
          data.drawCompleted &&
          data.botResponse === "accepted");

      if (drawFinished) {
        if (!endSoundPlayedRef.current) {
          endSoundPlayedRef.current = true;
          void sfxRef.current.playDraw();
        }
        setBadgesEarnedThisGame((prev) =>
          mergeEarnedBadges(prev, data.newBadges)
        );
        setGameOver(true);
        setGameResult("draw");
        setWinnerId(null);
        setDrawOfferedBy(null);
        return;
      }

      if (action === "decline") {
        setDrawOfferedBy(null);
        return;
      }

      if (action === "offer") {
        if (data.botResponse === "declined") {
          setDrawOfferedBy(null);
          return;
        }
        setDrawOfferedBy(currentUser.id);
      }
    } catch (err) {
      console.error("[draw]", err);
    } finally {
      setDrawLoading(false);
    }
  };

  const opponentUsername =
    game.opponent?.username ??
    (vsBotGame ? BOARDLY_BOT_USERNAME : t("waitingForOpponent") + "…");
  const botDifficultyBadge =
    vsBotGame && typeof game.state.bot_difficulty === "number"
      ? t(botDifficultyMsgKey(game.state.bot_difficulty))
      : null;
  const canEditGameName =
    game.created_by != null
      ? game.created_by === currentUser.id
      : game.my_color === "white";
  const timeControlType = game.time_control?.type;
  const hasTimer = timeControlType === "per_turn" || timeControlType === "per_game";

  const showShareInvite =
    gameStatus === "waiting" && !vsBotGame && canEditGameName;

  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false);

  const copyInviteLink = useCallback(async () => {
    setInviteLinkLoading(true);
    try {
      const res = await fetch(`/api/games/${game.id}/invite`);
      const data = (await res.json()) as { inviteUrl?: string };
      if (!res.ok || !data.inviteUrl) return;
      await navigator.clipboard.writeText(data.inviteUrl);
      setInviteLinkCopied(true);
      window.setTimeout(() => setInviteLinkCopied(false), 2500);
    } catch {
      /* clipboard or network */
    } finally {
      setInviteLinkLoading(false);
    }
  }, [game.id]);

  const startEditingGameName = useCallback(() => {
    if (!canEditGameName || savingGameName) return;
    setDraftGameName(gameName);
    setIsEditingGameName(true);
  }, [canEditGameName, savingGameName, gameName]);

  const cancelEditingGameName = useCallback(() => {
    setDraftGameName(gameName);
    setIsEditingGameName(false);
  }, [gameName]);

  const submitGameName = useCallback(async () => {
    if (!canEditGameName || savingGameName) return;
    const nextName = draftGameName.trim();
    if (nextName === gameName) {
      setDraftGameName(gameName);
      setIsEditingGameName(false);
      return;
    }
    setSavingGameName(true);
    try {
      const res = await fetch(`/api/games/${game.id}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = (await res.json()) as { name?: string; error?: string };
      if (!res.ok) {
        console.error("[game-name]", data.error ?? "Failed to update game name");
        setDraftGameName(gameName);
        setIsEditingGameName(false);
        return;
      }
      const savedName = data.name ?? "";
      setGameName(savedName);
      setDraftGameName(savedName);
      setIsEditingGameName(false);
    } catch (err) {
      console.error("[game-name]", err);
      setDraftGameName(gameName);
      setIsEditingGameName(false);
    } finally {
      setSavingGameName(false);
    }
  }, [canEditGameName, savingGameName, draftGameName, gameName, game.id]);

  // Resolved timer state: prefer realtime updates, fall back to initial props
  const resolvedTimerState = {
    turn_started_at: timerState.turn_started_at ?? game.state.turn_started_at,
    white_time_ms: timerState.white_time_ms ?? game.state.white_time_ms,
    black_time_ms: timerState.black_time_ms ?? game.state.black_time_ms,
  };

  // For per_turn: each player gets the same fresh allocation each turn
  const perTurnMs = (game.time_control?.minutes ?? 1) * 60 * 1000;

  const startReplay = useCallback(() => {
    if (moves.length === 0) return;
    setViewPlyIndex(0);
  }, [moves.length]);

  const guestCanPlayMore = guestGamesCount < GUEST_GAMES_LIMIT;

  // Build timer nodes for each player
  function buildTimer(playerColor: "white" | "black"): React.ReactNode {
    if (!hasTimer || showModal || !atLivePosition) return undefined;

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

      <AnimatePresence>
        {currentUser.isGuest && showGuestBanner && (
          <div className="w-full flex justify-center px-4 pt-4">
            <GuestPlayingBanner onDismiss={dismissGuestBanner} />
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && incomingRematchGameId && (
          <RematchOfferBanner
            onAccept={handleAcceptRematchOffer}
            onDecline={handleDeclineRematchOffer}
            loading={rematchRespondLoading}
          />
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col items-center px-4 py-6 gap-4">
        {/* Board + move history: side-by-side on desktop, stacked on mobile */}
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-center">
          {/* Board column */}
          <div className="flex min-h-0 w-full max-w-[600px] flex-col gap-3">
            {/* Back + status row — inside board column so it aligns with board edges */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push(currentUser.isGuest ? "/" : "/dashboard")
                }
                className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-sm font-medium">{t("games")}</span>
              </button>

              {atLivePosition ? (
                <div className="flex flex-1 min-w-0 items-center gap-2 flex-wrap">
                  <StatusBanner
                    status={gameStatus as GamePageData["status"]}
                    currentTurn={fenTurn}
                    myColor={game.my_color}
                    submitting={submitting}
                    vsBot={vsBotGame}
                    botThinking={botThinking}
                  />
                  {showShareInvite && (
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      disabled={inviteLinkLoading}
                      className={cn(
                        "inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50",
                        inviteLinkCopied
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
                      )}
                    >
                      <Link2 className="w-4 h-4 shrink-0" aria-hidden />
                      {inviteLinkCopied ? t("inviteLinkCopied") : t("shareInviteLink")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-[36px]" aria-hidden />
              )}

              <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                <GameSettings
                  gameId={game.id}
                  gamePieceSet={gamePieceSet}
                  globalPieceSet={globalPieceSet}
                  onChangeGamePieceSet={setGamePieceSet}
                  onChangeGlobalPieceSet={setGlobalPieceSet}
                  onClearGamePieceSet={clearGamePieceSet}
                  gameBoardTheme={gameBoardTheme}
                  globalBoardTheme={globalBoardTheme}
                  onChangeGameBoardTheme={setGameBoardTheme}
                  onChangeGlobalBoardTheme={setGlobalBoardTheme}
                  onClearGameBoardTheme={clearGameBoardTheme}
                  canEditGameName={canEditGameName}
                  gameName={gameName}
                  draftGameName={draftGameName}
                  isEditingGameName={isEditingGameName}
                  savingGameName={savingGameName}
                  onStartEditingGameName={startEditingGameName}
                  onDraftGameNameChange={setDraftGameName}
                  onSubmitGameName={submitGameName}
                  onCancelEditingGameName={cancelEditingGameName}
                  soundEnabled={sfx.soundEnabled}
                  soundSystemMuted={sfx.respectReducedMotion}
                  onToggleSound={() => {
                    void sfx.primeAudio();
                    sfx.toggleSound();
                  }}
                />
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
            <CapturedPiecesStrip
              captured={capturedState[opponentColor]}
              capturedByColor={opponentColor}
              capturedPoints={
                opponentColor === "white"
                  ? capturedState.whitePoints
                  : capturedState.blackPoints
              }
              customPieces={customPieces}
            />
            <PlayerStrip
              username={opponentUsername}
              avatarUrl={game.opponent?.avatar_url ?? null}
              color={opponentColor}
              isCurrentUser={false}
              isTheirTurn={
                !atLivePosition
                  ? visualTurn === opponentColor
                  : fenTurn === opponentColor && gameStatus === "active"
              }
              timer={buildTimer(opponentColor)}
              moveCount={moveCounts[opponentColor]}
              isBoardlyBot={vsBotGame}
              difficultyLabel={botDifficultyBadge}
            />
            {/* Chess board — plain wrapper (no CSS translate on ancestor) so drag overlay stays aligned */}
            <div
              ref={boardShakeHostRef}
              className="w-full rounded-2xl overflow-hidden shadow-xl ring-1 ring-orange-100 relative"
            >
              <div
                className={cn(
                  "transition-[filter] duration-500 ease-in-out motion-reduce:transition-none",
                  atLivePosition
                    ? "blur-0 grayscale-0 brightness-[1] contrast-[1]"
                    : "grayscale brightness-[1.05] contrast-[1.08] blur-[1.25px] motion-reduce:blur-0 motion-reduce:grayscale-0 motion-reduce:saturate-[0.75]"
                )}
              >
                <Chessboard
                  options={{
                    id: `board-${game.id}`,
                    position: displayFen,
                    boardOrientation: game.my_color,
                    pieces: customPieces,
                    showAnimations: chessboardAnimMs > 0,
                    animationDurationInMs: chessboardAnimMs,
                    allowDragOffBoard: true,
                    allowDragging: !boardPiecesLocked,
                    canDragPiece: ({ piece }) => {
                      if (boardPiecesLocked) return false;
                      const isWhitePiece = piece.pieceType.startsWith("w");
                      return game.my_color === "white" ? isWhitePiece : !isWhitePiece;
                    },
                    onPieceDrop: handlePieceDropBoard,
                    onSquareClick: snapToLiveIfBrowsingHistory,
                    onPieceClick: snapToLiveIfBrowsingHistory,
                    onPieceDrag: () => {
                      snapToLiveIfBrowsingHistory();
                    },
                    onSquareMouseDown: ({ piece }) => {
                      if (!atLivePosition && piece) {
                        setViewPlyIndex(moves.length);
                      }
                    },
                    lightSquareStyle: boardStyles.lightSquareStyle,
                    darkSquareStyle: boardStyles.darkSquareStyle,
                    lightSquareNotationStyle: boardStyles.lightSquareNotationStyle,
                    darkSquareNotationStyle: boardStyles.darkSquareNotationStyle,
                    squareStyles,
                    boardStyle: { borderRadius: "0", boxShadow: "none" },
                  }}
                />
              </div>
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 z-[2] rounded-2xl transition-opacity duration-500 ease-in-out motion-reduce:transition-none",
                  atLivePosition ? "opacity-0" : "opacity-100"
                )}
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-950/[0.07] via-transparent to-slate-950/[0.06] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.14)]" />
                {/* TV static + scanlines (old CRT feel) */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-[0.32] mix-blend-soft-light motion-reduce:opacity-[0.14]"
                  style={{
                    backgroundImage: `url("${REPLAY_TV_NOISE_DATA_URL}")`,
                    backgroundSize: "96px 96px",
                  }}
                />
                <div className="absolute inset-0 rounded-2xl opacity-[0.14] mix-blend-multiply motion-reduce:opacity-[0.06] [background:repeating-linear-gradient(to_bottom,transparent_0px,transparent_1px,rgba(0,0,0,0.22)_1px,rgba(0,0,0,0.22)_3px)]" />
                {/* CRT-style vignette (lighter tube edges) */}
                <div className="absolute inset-0 rounded-2xl [box-shadow:inset_0_0_56px_32px_rgba(0,0,0,0.22)] motion-reduce:[box-shadow:inset_0_0_48px_28px_rgba(0,0,0,0.14)]" />
                <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_96%_90%_at_50%_50%,transparent_40%,rgba(0,0,0,0.2)_100%)] mix-blend-multiply opacity-90 motion-reduce:opacity-55" />
              </div>
            </div>

            {/* Current user strip — shown at bottom */}
            <PlayerStrip
              username={currentUser.username}
              avatarUrl={currentUser.avatar_url}
              color={game.my_color}
              isCurrentUser
              isTheirTurn={
                !atLivePosition ? visualTurn === game.my_color : isMyTurn
              }
              timer={buildTimer(game.my_color)}
              moveCount={moveCounts[game.my_color]}
            />
            <CapturedPiecesStrip
              captured={capturedState[game.my_color]}
              capturedByColor={game.my_color}
              capturedPoints={
                game.my_color === "white"
                  ? capturedState.whitePoints
                  : capturedState.blackPoints
              }
              customPieces={customPieces}
            />

            {/* Resign + Draw + Moves row */}
            <div className="flex flex-wrap items-center gap-2">
              {isActiveGame && !showModal && (
                <>
                  <button
                    onClick={() => setShowResignDialog(true)}
                    disabled={resignLoading}
                    className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-red-500 border border-red-200 hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-40"
                  >
                    <Flag className="w-4 h-4" />
                    <span>{t("resign")}</span>
                  </button>
                  <button
                    onClick={() =>
                      iOfferedDraw ? undefined : handleDrawAction("offer")
                    }
                    disabled={drawLoading || iOfferedDraw || opponentOfferedDraw}
                    className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      iOfferedDraw
                        ? tDrawOffer("drawOfferSent")
                        : opponentOfferedDraw
                        ? tDrawOffer("opponentAlreadyOffered")
                        : tDrawOffer("offerDraw")
                    }
                  >
                    <Handshake className="w-4 h-4" />
                    <span className="hidden sm:inline">{iOfferedDraw ? t("drawOffered") : t("offerDraw")}</span>
                    <span className="sm:hidden">{iOfferedDraw ? t("offered") : t("draw")}</span>
                  </button>
                </>
              )}

              {/* Mobile: prev/next + Moves — sheet stays readable (no heavy backdrop blur) */}
              <div className="ml-auto flex items-center gap-1.5 lg:hidden">
                {moves.length > 0 && (
                  <MoveHistoryNavButtons
                    compact
                    className="justify-end shrink-0"
                    viewPlyIndex={viewPlyIndex}
                    movesLength={moves.length}
                    onPrev={() =>
                      setViewPlyIndex((i) => Math.max(0, i - 1))
                    }
                    onNext={() =>
                      setViewPlyIndex((i) => Math.min(moves.length, i + 1))
                    }
                  />
                )}
                <button
                  type="button"
                  onClick={() => setMovesSheetOpen(true)}
                  className="flex shrink-0 items-center justify-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                  {t("moves")}
                  {moves.length > 0 && (
                    <span className="ml-0.5 text-gray-400 font-normal text-xs">
                      ({moves.length})
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Desktop: move history — stretch with column; scroll inside panel only */}
          <div
            className="hidden max-h-full min-h-0 w-52 shrink-0 flex-col overflow-hidden lg:flex"
            style={{ maxHeight: "calc(100vh - 120px)" }}
          >
            <MoveHistoryPanel
              moves={moves}
              className="flex h-full max-h-full min-h-0 flex-1 flex-col"
              highlightHalfMoveIndex={
                !atLivePosition
                  ? viewPlyIndex === 0
                    ? null
                    : viewPlyIndex - 1
                  : undefined
              }
              onSelectHalfMove={(halfIdx) =>
                setViewPlyIndex(halfIdx + 1)
              }
              headerNav={
                moves.length > 0 ? (
                  <MoveHistoryNavButtons
                    className="justify-end"
                    viewPlyIndex={viewPlyIndex}
                    movesLength={moves.length}
                    onPrev={() =>
                      setViewPlyIndex((i) => Math.max(0, i - 1))
                    }
                    onNext={() =>
                      setViewPlyIndex((i) => Math.min(moves.length, i + 1))
                    }
                  />
                ) : null
              }
            />
          </div>
        </div>
      </main>

      {/* Game over modal */}
      <AnimatePresence>
        {showGameOverModal && (
          <GameOverModal
            result={displayResult}
            iWon={iWon}
            isDraw={isDraw}
            opponentOnline={opponentOnline}
            rematchDeclined={rematchDeclined}
            rematchWaiting={rematchWaiting}
            vsBot={vsBotGame}
            badgesEarned={
              badgesEarnedThisGame.length > 0 ? badgesEarnedThisGame : undefined
            }
            onRematch={handleRematch}
            rematchLoading={rematchLoading}
            onDashboard={() => {
              if (currentUser.isGuest) {
                router.push("/login");
                return;
              }
              router.push("/dashboard");
              if (vsBotGame) {
                queueMicrotask(() => router.refresh());
              }
            }}
            canReviewGame={moves.length > 0}
            onReviewGame={startReplay}
            reviewGameLabel={t("replayReview")}
            isGuest={currentUser.isGuest}
            guestCanPlayMore={guestCanPlayMore}
            onCreateAccount={() => router.push("/login")}
            onPlayAsGuest={() => router.push("/lobby")}
            onInviteToNewGame={
              () => {
                const params = new URLSearchParams();
                if (game.opponent?.id) params.set("opponentId", game.opponent.id);
                const opponentNameForInvite =
                  game.opponent?.username ??
                  (game.status === "completed" || game.status === "abandoned"
                    ? "previous opponent"
                    : "");
                if (opponentNameForInvite) params.set("opponentName", opponentNameForInvite);
                const query = params.toString();
                router.push(query ? `/lobby?${query}` : "/lobby");
              }
            }
            exitGameLabel={
              currentUser.isGuest ? tGameOver("createAccount") : undefined
            }
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

      {/* Pawn promotion */}
      <AnimatePresence>
        {promotionAt && (
          <PromotionDialog
            myColor={game.my_color}
            customPieces={customPieces}
            onSelect={(piece) => {
              const { from, to } = promotionAt;
              setPromotionAt(null);
              applyMove(from, to, piece);
            }}
            onCancel={() => setPromotionAt(null)}
          />
        )}
      </AnimatePresence>

      {/* Mobile: move history — bottom sheet */}
      <Sheet
        open={movesSheetOpen}
        onOpenChange={setMovesSheetOpen}
        modal
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          overlayClassName="lg:hidden fixed inset-0 z-30 bg-black/20"
          className="lg:hidden z-40 flex max-h-[70vh] flex-col gap-0 rounded-t-3xl border-0 bg-white p-0 pt-0 shadow-2xl"
        >
          <div className="flex flex-shrink-0 justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>
          <MoveHistoryPanel
            moves={moves}
            className="flex max-h-full min-h-0 flex-1 flex-col rounded-none border-0"
            headerVariant="sheet"
            highlightHalfMoveIndex={
              !atLivePosition
                ? viewPlyIndex === 0
                  ? null
                  : viewPlyIndex - 1
                : undefined
            }
            onSelectHalfMove={(halfIdx) => setViewPlyIndex(halfIdx + 1)}
            headerEnd={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setMovesSheetOpen(false)}
                className="h-8 w-8 shrink-0 rounded-full"
                aria-label={t("closeMovesSheet")}
              >
                <X className="h-4 w-4 text-gray-500" />
              </Button>
            }
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
