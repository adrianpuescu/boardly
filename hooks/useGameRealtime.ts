"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type GameResult = "checkmate" | "stalemate" | "draw" | null;

export interface TimerState {
  turn_started_at?: string;
  white_time_ms?: number;
  black_time_ms?: number;
}

export function useGameRealtime(
  gameId: string,
  initialFen: string = INITIAL_FEN,
  initialStatus: string = "waiting",
  initialTimerState: TimerState = {}
) {
  const [fen, setFen] = useState(initialFen);
  const [gameStatus, setGameStatus] = useState(initialStatus);
  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [timerState, setTimerState] = useState<TimerState>(initialTimerState);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`game-realtime:${gameId}`)
      // New move → update live FEN
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moves",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const move = payload.new as { fen_after: string };
          if (move.fen_after) setFen(move.fen_after);
        }
      )
      // Game row updated → catch status + timer state changes
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
            };
          };

          setGameStatus(updated.status);

          // Sync timer state from the updated game row
          setTimerState({
            turn_started_at: updated.state?.turn_started_at,
            white_time_ms: updated.state?.white_time_ms,
            black_time_ms: updated.state?.black_time_ms,
          });

          if (updated.status === "completed") {
            setGameOver(true);
            setWinnerId(updated.winner_id ?? null);

            const r = updated.state?.result;
            setGameResult(
              r === "checkmate" || r === "stalemate" || r === "draw"
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
  };
}
