"use client";

import { useEffect, useState } from "react";
import { BOARD_THEME_COLORS, type BoardTheme } from "@/lib/chess/boardThemes";

const STORAGE_KEY = "boardly-board-theme";
const DEFAULT_THEME: BoardTheme = "classic";

function isValidBoardTheme(value: string | null | undefined): value is BoardTheme {
  return !!value && value in BOARD_THEME_COLORS;
}

export function useBoardTheme() {
  const [boardTheme, setBoardThemeState] = useState<BoardTheme>(DEFAULT_THEME);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isValidBoardTheme(saved)) {
        setBoardThemeState(saved);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const setBoardTheme = (theme: BoardTheme) => {
    setBoardThemeState(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore storage failures
    }
  };

  return { boardTheme, setBoardTheme };
}
