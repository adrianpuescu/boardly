"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type GameResult = "checkmate" | "stalemate" | "draw" | null;

export function useGameRealtime(
  gameId: string,
  initialFen: string = INITIAL_FEN,
  initialStatus: string = "waiting"
) {
  const [fen, setFen] = useState(initialFen);
  const [gameStatus, setGameStatus] = useState(initialStatus);
  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);

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
      // Game row updated → catch status changes (e.g. opponent checkmates)
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
            state: { fen?: string; result?: string };
          };

          setGameStatus(updated.status);

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
  };
}
