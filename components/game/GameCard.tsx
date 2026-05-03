"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import dynamic from "next/dynamic";
import Image from "next/image";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { enUS, es, ro } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import type { CurrentUser, DashboardGame } from "@/lib/types";
import { getMyGameResult } from "@/lib/dashboard/myGameResult";
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
import { isNextImageCompatibleSrc } from "@/lib/utils";

// Chessboard is client-only (no SSR)
const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false, loading: () => <div className="w-full h-full bg-amber-100 animate-pulse" /> }
);

interface Props {
  game: DashboardGame;
  currentUser: CurrentUser;
}

export function GameCard({ game, currentUser }: Props) {
  const router = useRouter();
  const t = useTranslations("gameCard");
  const tDashboard = useTranslations("dashboard");
  const locale = useLocale();
  const [avatarError, setAvatarError] = useState(false);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [notationSizePx, setNotationSizePx] = useState(8);
  const { pieceSet } = usePieceSet(game.id);
  const { boardTheme } = useBoardTheme(game.id);
  const boardStyles = getBoardThemeStyles(boardTheme);
  const customPieces = buildPieces(pieceSet);

  const [moves, setMoves] = useState<MoveRecord[]>([]);

  const canEditName =
    game.created_by != null
      ? game.created_by === currentUser.id
      : game.my_color === "white";

  const [gameName, setGameName] = useState(game.name ?? "");
  const [draftName, setDraftName] = useState(game.name ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [isTitleHovering, setIsTitleHovering] = useState(false);
  const [showHoverCaret, setShowHoverCaret] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initial = game.name ?? "";
    setGameName(initial);
    setDraftName(initial);
    setIsEditingName(false);
    setSavingName(false);
  }, [game.id, game.name]);

  useEffect(() => {
    if (!isEditingName) return;
    const id = requestAnimationFrame(() => {
      const el = nameInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [isEditingName]);

  useEffect(() => {
    if (!isTitleHovering || isEditingName || !canEditName || savingName) {
      setShowHoverCaret(false);
      return;
    }
    setShowHoverCaret(true);
    const id = window.setInterval(() => {
      setShowHoverCaret((v) => !v);
    }, 500);
    return () => window.clearInterval(id);
  }, [isTitleHovering, isEditingName, canEditName, savingName]);

  const startEditingName = useCallback(() => {
    if (!canEditName || savingName) return;
    setDraftName(gameName);
    setIsEditingName(true);
  }, [canEditName, savingName, gameName]);

  const cancelEditingName = useCallback(() => {
    setDraftName(gameName);
    setIsEditingName(false);
  }, [gameName]);

  const submitName = useCallback(async () => {
    if (!canEditName || savingName) return;
    const next = draftName.trim();
    if (next === gameName) {
      setDraftName(gameName);
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/games/${game.id}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const data = (await res.json()) as { name?: string; error?: string };
      if (!res.ok) {
        console.error("[game-name]", data.error ?? "Failed to update game name");
        setDraftName(gameName);
        setIsEditingName(false);
        return;
      }
      const saved = data.name ?? "";
      setGameName(saved);
      setDraftName(saved);
      setIsEditingName(false);
      router.refresh();
    } catch (err) {
      console.error("[game-name]", err);
      setDraftName(gameName);
      setIsEditingName(false);
    } finally {
      setSavingName(false);
    }
  }, [canEditName, savingName, draftName, gameName, game.id, router]);

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

  const isTerminal =
    game.status === "completed" || game.status === "abandoned";
  const myResult = useMemo(
    () => getMyGameResult(game, currentUser.id),
    [game, currentUser.id]
  );
  const isMyTurn =
    !isTerminal &&
    game.status === "active" &&
    game.state?.turn === game.my_color;
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

  const titleTextClass = gameName.trim()
    ? "text-base font-extrabold tracking-tight text-gray-800"
    : "text-base font-bold tracking-tight text-gray-500/90";

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
      {/* Game name/title — fixed h-9 so layout stays stable when editing */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 min-w-0 flex items-center gap-3">
        {canEditName ? (
          <div
            className="min-w-0 flex-1 h-9"
            onClick={(e) => e.stopPropagation()}
          >
            {isEditingName ? (
              <input
                ref={nameInputRef}
                maxLength={50}
                value={draftName}
                placeholder={tDashboard("untitledGame")}
                disabled={savingName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => void submitName()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitName();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditingName();
                  }
                }}
                className={
                  "h-9 w-full min-w-0 max-w-full cursor-text border-0 bg-transparent p-0 shadow-none " +
                  "text-base font-extrabold tracking-tight text-gray-800 caret-gray-800 " +
                  "placeholder:font-bold placeholder:tracking-tight placeholder:text-gray-500/80 " +
                  "outline-none ring-0 focus:outline-none focus:ring-0 " +
                  "focus-visible:outline-none focus-visible:ring-0 disabled:opacity-60"
                }
              />
            ) : (
              <button
                type="button"
                onClick={startEditingName}
                disabled={savingName}
                onMouseEnter={() => setIsTitleHovering(true)}
                onMouseLeave={() => setIsTitleHovering(false)}
                className="flex w-full h-9 min-w-0 cursor-text items-center text-left disabled:opacity-60"
              >
                <span className={`min-w-0 max-w-full inline-flex items-center ${titleTextClass}`}>
                  <span className="truncate">
                    {gameName.trim() || tDashboard("untitledGame")}
                  </span>
                  {showHoverCaret && (
                    <span
                      aria-hidden
                      className={`ml-0.5 -translate-y-[1px] leading-none ${
                        gameName.trim() ? "text-gray-800" : "text-gray-500/70"
                      }`}
                    >
                      |
                    </span>
                  )}
                </span>
              </button>
            )}
          </div>
        ) : (
          <p
            className={`h-9 min-w-0 flex-1 flex items-center truncate ${titleTextClass}`}
          >
            {gameName.trim() || tDashboard("untitledGame")}
          </p>
        )}
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold bg-gray-50 text-gray-600 rounded-full px-3 py-1 border border-gray-200 shrink-0 shadow-sm">
          <span className="text-lg chess-sym leading-none">{game.my_color === "white" ? "♔" : "♚"}</span>
          {game.my_color === "white" ? t("white") : t("black")}
        </span>
      </div>

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

        {/* Turn indicator stripe */}
        {isMyTurn && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-emerald-500" />
        )}
      </div>

      {/* Card body */}
      <div className="px-4 pt-4 pb-2.5 flex-1 flex flex-col gap-3">
        {/* Fixed-height slot so opponent row stays aligned across game states */}
        <div className="min-h-[44px] flex items-center shrink-0">
          {isMyTurn ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-sm font-semibold text-green-600 leading-snug">
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
          ) : isTerminal ? (
            myResult ? (
              <span
                className={
                  myResult === "win"
                    ? "inline-flex items-center text-[11px] font-black uppercase tracking-[0.12em] rounded-full px-3 py-1 border border-emerald-200 bg-emerald-50 text-emerald-800 leading-none"
                    : myResult === "loss"
                      ? "inline-flex items-center text-[11px] font-black uppercase tracking-[0.12em] rounded-full px-3 py-1 border border-red-200 bg-red-50 text-red-800 leading-none"
                      : "inline-flex items-center text-[11px] font-black uppercase tracking-[0.12em] rounded-full px-3 py-1 border border-slate-200 bg-slate-100 text-slate-800 leading-none"
                }
              >
                {myResult === "win"
                  ? t("resultWon")
                  : myResult === "loss"
                    ? t("resultLost")
                    : t("resultDraw")}
              </span>
            ) : (
              <Badge
                variant="secondary"
                className="text-xs bg-violet-50 text-violet-700 border-0 rounded-full"
              >
                {game.status === "abandoned" ? t("abandoned") : t("completed")}
              </Badge>
            )
          ) : (
            <Badge
              variant="secondary"
              className="text-xs bg-blue-50 text-blue-500 border-0 rounded-full"
            >
              {t("opponentsTurn")}
            </Badge>
          )}
        </div>

        {/* Opponent */}
        <div className="flex items-center gap-2.5">
          {game.opponent?.avatar_url &&
          !avatarError &&
          isNextImageCompatibleSrc(game.opponent.avatar_url) ? (
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
          ) : game.opponent?.avatar_url &&
            !isNextImageCompatibleSrc(game.opponent.avatar_url) ? (
            <div className="w-8 h-8 rounded-full bg-orange-100 ring-1 ring-orange-100 flex items-center justify-center text-lg leading-none flex-shrink-0 select-none">
              {game.opponent.avatar_url}
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

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between border-t border-gray-50 pt-3">
          <span className="text-xs text-gray-400">{timeLabel}</span>
          <span className="text-xs text-gray-400">{ago}</span>
        </div>
      </div>
    </motion.div>
  );
}
