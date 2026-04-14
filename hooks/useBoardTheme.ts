"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BOARD_THEME_COLORS, type BoardTheme } from "@/lib/chess/boardThemes";

const STORAGE_KEY = "boardly-board-theme";
const DEFAULT_THEME: BoardTheme = "classic";

function isValidBoardTheme(value: string | null | undefined): value is BoardTheme {
  return !!value && value in BOARD_THEME_COLORS;
}

export function useBoardTheme(gameId?: string) {
  const [globalBoardTheme, setGlobalState] = useState<BoardTheme>(DEFAULT_THEME);
  const [gameBoardTheme, setGameState] = useState<BoardTheme | null>(null);
  const [loadingGame, setLoadingGame] = useState(!!gameId);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isValidBoardTheme(saved)) {
        setGlobalState(saved);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    if (!gameId) {
      setGameState(null);
      setLoadingGame(false);
      return;
    }
    setLoadingGame(true);
    const supabase = createClient();
    void Promise.resolve(
      supabase
        .from("user_game_preferences")
        .select("board_theme")
        .eq("game_id", gameId)
        .maybeSingle()
    )
      .then(({ data, error }) => {
        if (error) {
          console.error("[useBoardTheme] load game pref error:", error.message);
          return;
        }
        setGameState(isValidBoardTheme(data?.board_theme) ? (data!.board_theme as BoardTheme) : null);
      })
      .finally(() => setLoadingGame(false));
  }, [gameId]);

  const boardTheme = gameBoardTheme ?? globalBoardTheme;

  const setGlobalBoardTheme = useCallback((theme: BoardTheme) => {
    setGlobalState(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore storage failures
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase
        .from("users")
        .update({ default_board_theme: theme })
        .eq("id", session.user.id)
        .then(({ error }) => {
          if (error) console.error("[useBoardTheme] global profile sync error:", error.message);
        });
    });
  }, []);

  const setGameBoardTheme = useCallback(
    (theme: BoardTheme) => {
      if (!gameId) return;
      setGameState(theme);
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          console.warn("[useBoardTheme] no active session — cannot save game pref");
          return;
        }
        supabase
          .from("user_game_preferences")
          .upsert(
            { user_id: session.user.id, game_id: gameId, board_theme: theme },
            { onConflict: "user_id,game_id" }
          )
          .then(({ error }) => {
            if (error) console.error("[useBoardTheme] save game pref error:", error.message);
          });
      });
    },
    [gameId]
  );

  const clearGameBoardTheme = useCallback(() => {
    if (!gameId) return;
    setGameState(null);
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase
        .from("user_game_preferences")
        .select("piece_set")
        .eq("user_id", session.user.id)
        .eq("game_id", gameId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) console.error("[useBoardTheme] clear game pref error:", error.message);
          if (data?.piece_set) {
            return supabase
              .from("user_game_preferences")
              .update({ board_theme: null })
              .eq("user_id", session.user.id)
              .eq("game_id", gameId)
              .then(({ error: updateError }) => {
                if (updateError) {
                  console.error("[useBoardTheme] clear game pref error:", updateError.message);
                }
              });
          }
          return supabase
            .from("user_game_preferences")
            .delete()
            .eq("user_id", session.user.id)
            .eq("game_id", gameId)
            .then(({ error: deleteError }) => {
              if (deleteError) {
                console.error("[useBoardTheme] clear game pref error:", deleteError.message);
              }
            });
        });
    });
  }, [gameId]);

  // Backward-compatible alias
  const setBoardTheme = setGlobalBoardTheme;

  return {
    boardTheme,
    gameBoardTheme,
    globalBoardTheme,
    loadingGame,
    setGlobalBoardTheme,
    setGameBoardTheme,
    clearGameBoardTheme,
    /** @deprecated use setGlobalBoardTheme */
    setBoardTheme,
  };
}
