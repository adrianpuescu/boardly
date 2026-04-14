"use client";

import { useEffect, useRef, useState } from "react";
import { Grid2x2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ALL_BOARD_THEMES,
  BOARD_THEME_COLORS,
  type BoardTheme,
} from "@/lib/chess/boardThemes";

interface Props {
  boardTheme: BoardTheme;
  onChange: (theme: BoardTheme) => void;
}

export function BoardThemePicker({ boardTheme, onChange }: Props) {
  const t = useTranslations("game");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("chooseBoardTheme")}
        aria-label={t("chooseBoardTheme")}
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-colors ${
          open
            ? "bg-orange-100 border-orange-300 text-orange-600"
            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300"
        }`}
      >
        <Grid2x2 className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 bg-white border border-gray-100 rounded-2xl shadow-xl shadow-black/10 overflow-hidden p-3">
          <div className="grid grid-cols-4 gap-2">
            {ALL_BOARD_THEMES.map((theme) => {
              const colors = BOARD_THEME_COLORS[theme];
              const active = theme === boardTheme;
              return (
                <button
                  key={theme}
                  type="button"
                  onClick={() => {
                    onChange(theme);
                    setOpen(false);
                  }}
                  className={`p-1.5 rounded-xl transition-colors ${
                    active
                      ? "bg-orange-100 ring-2 ring-orange-400"
                      : "hover:bg-gray-50"
                  }`}
                  title={t(`boardThemes.${theme}`)}
                >
                  <div className="grid grid-cols-2 w-full h-8 rounded-md overflow-hidden border border-gray-200">
                    <span style={{ backgroundColor: colors.light }} />
                    <span style={{ backgroundColor: colors.dark }} />
                  </div>
                  <span className="mt-1.5 block text-[10px] font-semibold text-gray-600 text-center capitalize">
                    {t(`boardThemes.${theme}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
