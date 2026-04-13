"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, X } from "lucide-react";
import { ALL_PIECE_SETS, PIECE_SET_LABELS } from "@/lib/chess/pieces";
import type { PieceSet } from "@/lib/chess/pieces";

interface Props {
  gameId?: string;
  gamePieceSet?: PieceSet | null;
  globalPieceSet: PieceSet;
  onChangeGame?: (set: PieceSet) => void;
  onChangeGlobal: (set: PieceSet) => void;
  onClearGame?: () => void;
}

type Tab = "game" | "global";

export function PiecePicker({
  gameId,
  gamePieceSet,
  globalPieceSet,
  onChangeGame,
  onChangeGlobal,
  onClearGame,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (gameId ? "game" : "global"));
  const ref = useRef<HTMLDivElement>(null);

  const hasGameId = !!gameId;
  const hasGameOverride = gamePieceSet != null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // When no gameId, always show global tab
  useEffect(() => {
    if (!hasGameId) setTab("global");
  }, [hasGameId]);

  const currentForTab: PieceSet | null =
    tab === "game" ? (gamePieceSet ?? null) : globalPieceSet;

  function handleSelect(set: PieceSet) {
    if (tab === "game") {
      onChangeGame?.(set);
    } else {
      onChangeGlobal(set);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Choose piece style"
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-colors ${
          open
            ? "bg-orange-100 border-orange-300 text-orange-600"
            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300"
        }`}
      >
        <Palette className="w-4 h-4" />
        {/* Dot indicating a game-specific override is active */}
        {hasGameOverride && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500 ring-1 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 bg-white border border-gray-100 rounded-2xl shadow-xl shadow-black/10 overflow-hidden">
          {hasGameId ? (
            /* ── Two-tab layout ─────────────────────────────────────── */
            <>
              {/* Tab bar */}
              <div className="flex border-b border-gray-100">
                <button
                  onClick={() => setTab("game")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
                    tab === "game"
                      ? "text-orange-600 border-b-2 border-orange-500 bg-orange-50/60"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  This game
                  {hasGameOverride && (
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                  )}
                </button>
                <button
                  onClick={() => setTab("global")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
                    tab === "global"
                      ? "text-orange-600 border-b-2 border-orange-500 bg-orange-50/60"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  All games
                  {!hasGameOverride && (
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                  )}
                </button>
              </div>

              {/* Context label */}
              <div className="px-3 pt-2.5 pb-1 flex items-center justify-between min-h-[28px]">
                {tab === "game" ? (
                  hasGameOverride ? (
                    <span className="text-[10px] text-orange-600 font-medium">
                      Override active — overrides your global default
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">
                      Using global default — pick to override for this game
                    </span>
                  )
                ) : (
                  <span className="text-[10px] text-gray-400">
                    Default for all games without an override
                  </span>
                )}
                {tab === "game" && hasGameOverride && onClearGame && (
                  <button
                    onClick={() => {
                      onClearGame();
                      setOpen(false);
                    }}
                    className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-red-500 transition-colors ml-2 flex-shrink-0"
                    title="Remove game override"
                  >
                    <X className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>

              {/* Piece set grid */}
              <div className="px-3 pb-3 grid grid-cols-5 gap-2">
                {ALL_PIECE_SETS.map((set) => {
                  const isActive =
                    tab === "game"
                      ? hasGameOverride && set === gamePieceSet
                      : set === globalPieceSet;
                  const isFallback =
                    tab === "game" && !hasGameOverride && set === globalPieceSet;
                  return (
                    <button
                      key={set}
                      onClick={() => handleSelect(set)}
                      title={PIECE_SET_LABELS[set]}
                      className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-colors ${
                        isActive
                          ? "bg-orange-100 ring-2 ring-orange-400"
                          : isFallback
                          ? "bg-gray-50 ring-1 ring-gray-200 opacity-60"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/pieces/${set}/wN.svg`}
                        alt={set}
                        width={36}
                        height={36}
                        draggable={false}
                        className="w-9 h-9 object-contain"
                      />
                      <span className="text-[9px] font-semibold text-gray-500 leading-none text-center w-full truncate">
                        {PIECE_SET_LABELS[set]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* ── Single-scope layout (no gameId) ────────────────────── */
            <div className="p-3 grid grid-cols-5 gap-2">
              {ALL_PIECE_SETS.map((set) => {
                const active = set === globalPieceSet;
                return (
                  <button
                    key={set}
                    onClick={() => handleSelect(set)}
                    title={PIECE_SET_LABELS[set]}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-colors ${
                      active
                        ? "bg-orange-100 ring-2 ring-orange-400"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/pieces/${set}/wN.svg`}
                      alt={set}
                      width={36}
                      height={36}
                      draggable={false}
                      className="w-9 h-9 object-contain"
                    />
                    <span className="text-[9px] font-semibold text-gray-500 leading-none text-center w-full truncate">
                      {PIECE_SET_LABELS[set]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
