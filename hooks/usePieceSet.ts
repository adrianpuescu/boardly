"use client";

import { useState, useCallback, useEffect } from "react";
import type { PieceSet } from "@/lib/chess/pieces";

const STORAGE_KEY = "boardly-piece-set";
const DEFAULT_SET: PieceSet = "california";

export function usePieceSet() {
  const [pieceSet, setPieceSetState] = useState<PieceSet>(DEFAULT_SET);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as PieceSet | null;
      if (saved) setPieceSetState(saved);
    } catch {
      // localStorage unavailable (SSR / private browsing)
    }
  }, []);

  const setPieceSet = useCallback((set: PieceSet) => {
    setPieceSetState(set);
    try {
      localStorage.setItem(STORAGE_KEY, set);
    } catch {
      // ignore
    }
  }, []);

  return { pieceSet, setPieceSet };
}
