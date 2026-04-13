"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALL_PIECE_SETS } from "@/lib/chess/pieces";
import type { PieceSet } from "@/lib/chess/pieces";

const STORAGE_KEY = "boardly-piece-set";
const DEFAULT_SET: PieceSet = "caliente";

function isValidPieceSet(value: string | null | undefined): value is PieceSet {
  return !!value && (ALL_PIECE_SETS as string[]).includes(value);
}

export function usePieceSet(gameId?: string) {
  const [globalPieceSet, setGlobalState] = useState<PieceSet>(DEFAULT_SET);
  const [gamePieceSet, setGameState] = useState<PieceSet | null>(null);
  const [loadingGame, setLoadingGame] = useState(!!gameId);

  // Hydrate global preference from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isValidPieceSet(saved)) setGlobalState(saved);
    } catch {
      // localStorage unavailable (SSR / private browsing)
    }
  }, []);

  // Load game-specific preference from DB when gameId changes
  useEffect(() => {
    if (!gameId) {
      setGameState(null);
      setLoadingGame(false);
      return;
    }
    setLoadingGame(true);
    const supabase = createClient();
    supabase
      .from("user_game_preferences")
      .select("piece_set")
      .eq("game_id", gameId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("[usePieceSet] load game pref error:", error.message);
          return;
        }
        setGameState(isValidPieceSet(data?.piece_set) ? (data!.piece_set as PieceSet) : null);
      })
      .finally(() => setLoadingGame(false));
  }, [gameId]);

  // Effective piece set: game-specific overrides global
  const pieceSet = gamePieceSet ?? globalPieceSet;

  const setGlobalPieceSet = useCallback((set: PieceSet) => {
    setGlobalState(set);
    try {
      localStorage.setItem(STORAGE_KEY, set);
    } catch {
      // ignore
    }
    // Fire-and-forget profile sync for cross-device persistence
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase
        .from("users")
        .update({ default_piece_set: set })
        .eq("id", session.user.id)
        .then(({ error }) => {
          if (error) console.error("[usePieceSet] global profile sync error:", error.message);
        });
    });
  }, []);

  const setGamePieceSet = useCallback(
    (set: PieceSet) => {
      if (!gameId) return;
      setGameState(set);
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          console.warn("[usePieceSet] no active session — cannot save game pref");
          return;
        }
        supabase
          .from("user_game_preferences")
          .upsert(
            { user_id: session.user.id, game_id: gameId, piece_set: set },
            { onConflict: "user_id,game_id" }
          )
          .then(({ error }) => {
            if (error) console.error("[usePieceSet] save game pref error:", error.message);
          });
      });
    },
    [gameId]
  );

  const clearGamePieceSet = useCallback(() => {
    if (!gameId) return;
    setGameState(null);
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase
        .from("user_game_preferences")
        .delete()
        .eq("user_id", session.user.id)
        .eq("game_id", gameId)
        .then(({ error }) => {
          if (error) console.error("[usePieceSet] clear game pref error:", error.message);
        });
    });
  }, [gameId]);

  // Backward-compatible alias
  const setPieceSet = setGlobalPieceSet;

  return {
    pieceSet,
    gamePieceSet,
    globalPieceSet,
    loadingGame,
    setGlobalPieceSet,
    setGamePieceSet,
    clearGamePieceSet,
    /** @deprecated use setGlobalPieceSet */
    setPieceSet,
  };
}
