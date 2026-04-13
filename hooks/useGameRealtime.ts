"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type GameResult = "checkmate" | "stalemate" | "draw" | "resignation" | null;

export interface TimerState {
  turn_started_at?: string;
  white_time_ms?: number;
  black_time_ms?: number;
}

export interface MoveRecord {
  id: string;
  move_san: string;
  fen_after: string;
  move_number: number;
  created_at: string;
  user_id: string;
}

export function useGameRealtime(
  gameId: string,
  initialFen: string = INITIAL_FEN,
  initialStatus: string = "waiting",
  initialTimerState: TimerState = {}
) {
  // Unique suffix per hook instance — prevents Supabase from reusing an
  // already-subscribed channel when multiple instances run for the same gameId
  // (e.g. multi-board dashboard view) or when React StrictMode double-invokes effects.
  const channelSuffix = useRef(
    `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );

  const [fen, setFen] = useState(initialFen);
  const [gameStatus, setGameStatus] = useState(initialStatus);
  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [timerState, setTimerState] = useState<TimerState>(initialTimerState);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [drawOfferedBy, setDrawOfferedBy] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/moves/${gameId}`)
      .then((r) => r.json())
      .then((data: { moves?: MoveRecord[] }) => {
        if (data.moves) setMoves(data.moves);
      })
      .catch(() => {});
  }, [gameId]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`game-realtime:${gameId}:${channelSuffix.current}`)
      // New move → update live FEN and append to move list
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moves",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const move = payload.new as MoveRecord;
          if (move.fen_after) setFen(move.fen_after);
          setMoves((prev) => {
            // Avoid duplicates (realtime can fire twice in dev)
            if (prev.some((m) => m.id === move.id)) return prev;
            return [...prev, move];
          });
        }
      )
      // Game row updated → catch status, timer state, and draw offer changes
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const updated = payload.new as {
            status: string;
            winner_id: string | null;
            state: {
              fen?: string;
              result?: string;
              turn_started_at?: string;
              white_time_ms?: number;
              black_time_ms?: number;
              draw_offered_by?: string;
            };
          };

          setGameStatus(updated.status);

          setTimerState({
            turn_started_at: updated.state?.turn_started_at,
            white_time_ms: updated.state?.white_time_ms,
            black_time_ms: updated.state?.black_time_ms,
          });

          setDrawOfferedBy(updated.state?.draw_offered_by ?? null);

          if (updated.status === "completed") {
            setGameOver(true);
            setWinnerId(updated.winner_id ?? null);

            const r = updated.state?.result;
            setGameResult(
              r === "checkmate" || r === "stalemate" || r === "draw" || r === "resignation"
                ? (r as GameResult)
                : null
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  return {
    fen,
    setFen,
    gameStatus,
    setGameStatus,
    gameOver,
    setGameOver,
    gameResult,
    setGameResult,
    winnerId,
    setWinnerId,
    timerState,
    setTimerState,
    moves,
    setMoves,
    drawOfferedBy,
    setDrawOfferedBy,
  };
}
