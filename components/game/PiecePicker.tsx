"use client";

import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { ALL_PIECE_SETS, PIECE_SET_LABELS } from "@/lib/chess/pieces";
import type { PieceSet } from "@/lib/chess/pieces";

interface Props {
  current: PieceSet;
  onChange: (set: PieceSet) => void;
}

export function PiecePicker({ current, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Choose piece style"
        className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-colors ${
          open
            ? "bg-orange-100 border-orange-300 text-orange-600"
            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300"
        }`}
      >
        <Palette className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 bg-white border border-gray-100 rounded-2xl shadow-xl shadow-black/10 p-3 grid grid-cols-5 gap-2">
          {ALL_PIECE_SETS.map((set) => {
            const active = set === current;
            return (
              <button
                key={set}
                onClick={() => { onChange(set); }}
                title={PIECE_SET_LABELS[set]}
                className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-colors ${
                  active
                    ? "bg-orange-100 ring-2 ring-orange-400"
                    : "hover:bg-gray-50"
                }`}
              >
                {/* Knight preview */}
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
  );
}
