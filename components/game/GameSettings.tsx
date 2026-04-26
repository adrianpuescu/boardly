"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, Volume2, VolumeX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ALL_PIECE_SETS, PIECE_SET_LABELS, type PieceSet } from "@/lib/chess/pieces";
import {
  ALL_BOARD_THEMES,
  BOARD_THEME_COLORS,
  type BoardTheme,
} from "@/lib/chess/boardThemes";

type Tab = "game" | "global";

interface Props {
  gameId?: string;
  gamePieceSet?: PieceSet | null;
  globalPieceSet: PieceSet;
  onChangeGamePieceSet?: (set: PieceSet) => void;
  onChangeGlobalPieceSet: (set: PieceSet) => void;
  onClearGamePieceSet?: () => void;
  gameBoardTheme?: BoardTheme | null;
  globalBoardTheme: BoardTheme;
  onChangeGameBoardTheme?: (theme: BoardTheme) => void;
  onChangeGlobalBoardTheme: (theme: BoardTheme) => void;
  onClearGameBoardTheme?: () => void;
  canEditGameName?: boolean;
  gameName?: string;
  draftGameName?: string;
  isEditingGameName?: boolean;
  savingGameName?: boolean;
  onStartEditingGameName?: () => void;
  onDraftGameNameChange?: (value: string) => void;
  onSubmitGameName?: () => void;
  onCancelEditingGameName?: () => void;
  soundEnabled?: boolean;
  soundSystemMuted?: boolean;
  onToggleSound?: () => void;
}

export function GameSettings({
  gameId,
  gamePieceSet,
  globalPieceSet,
  onChangeGamePieceSet,
  onChangeGlobalPieceSet,
  onClearGamePieceSet,
  gameBoardTheme,
  globalBoardTheme,
  onChangeGameBoardTheme,
  onChangeGlobalBoardTheme,
  onClearGameBoardTheme,
  canEditGameName = false,
  gameName = "",
  draftGameName = "",
  isEditingGameName = false,
  savingGameName = false,
  onStartEditingGameName,
  onDraftGameNameChange,
  onSubmitGameName,
  onCancelEditingGameName,
  soundEnabled = false,
  soundSystemMuted = false,
  onToggleSound,
}: Props) {
  const t = useTranslations("game");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (gameId ? "game" : "global"));
  const ref = useRef<HTMLDivElement>(null);

  const hasGameId = !!gameId;
  const hasGamePieceOverride = gamePieceSet != null;
  const hasGameBoardOverride = gameBoardTheme != null;
  const hasAnyGameOverride = hasGamePieceOverride || hasGameBoardOverride;

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

  useEffect(() => {
    if (!hasGameId) setTab("global");
  }, [hasGameId]);

  function selectPieceSet(set: PieceSet) {
    if (tab === "game") onChangeGamePieceSet?.(set);
    else onChangeGlobalPieceSet(set);
  }

  function selectBoardTheme(theme: BoardTheme) {
    if (tab === "game") onChangeGameBoardTheme?.(theme);
    else onChangeGlobalBoardTheme(theme);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("gameSettingsTitle")}
        aria-label={t("gameSettingsTitle")}
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-colors ${
          open
            ? "bg-orange-100 border-orange-300 text-orange-600"
            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300"
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" />
        {hasAnyGameOverride && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500 ring-1 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[22rem] bg-white border border-gray-100 rounded-2xl shadow-xl shadow-black/10 overflow-hidden">
          {hasGameId && (
            <>
              <div className="flex border-b border-gray-100">
                <button
                  onClick={() => setTab("game")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${
                    tab === "game"
                      ? "text-orange-600 border-b-2 border-orange-500 bg-orange-50/60"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {t("thisGame")}
                  {hasAnyGameOverride && (
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
                  {t("allGames")}
                  {!hasAnyGameOverride && (
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                  )}
                </button>
              </div>
              <div className="px-3 pt-2.5 pb-1 flex items-center justify-between min-h-[28px]">
                {tab === "game" ? (
                  hasAnyGameOverride ? (
                    <span className="text-[10px] text-orange-600 font-medium">
                      {t("gameOverrideActive")}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">
                      {t("usingGlobalDefaults")}
                    </span>
                  )
                ) : (
                  <span className="text-[10px] text-gray-400">{t("globalDefaultsHint")}</span>
                )}
              </div>
            </>
          )}

          <div className="px-3 pb-3">
            {(canEditGameName || gameName.trim().length > 0) && (
              <div className="mb-3 mt-1">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                  {t("settingsGameNameSection")}
                </h4>
                {canEditGameName ? (
                  <div className="space-y-1">
                    <input
                      maxLength={50}
                      value={draftGameName}
                      placeholder={t("addNamePlaceholder")}
                      disabled={savingGameName}
                      onFocus={() => onStartEditingGameName?.()}
                      onChange={(e) => onDraftGameNameChange?.(e.target.value)}
                      onBlur={() => void onSubmitGameName?.()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void onSubmitGameName?.();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          onCancelEditingGameName?.();
                        }
                      }}
                      className="h-8 w-full rounded-md border border-orange-200 bg-orange-50/40 px-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-70"
                    />
                    <p className="h-3 text-[10px] leading-3 text-gray-400">
                      {t("editNameCount", { current: draftGameName.length, max: 50 })}
                    </p>
                  </div>
                ) : (
                  <p className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-2 text-sm leading-8 italic text-gray-600 truncate">
                    {gameName}
                  </p>
                )}
              </div>
            )}

            <div className="mb-3">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                {t("settingsSoundSection")}
              </h4>
              <button
                type="button"
                onClick={onToggleSound}
                className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="truncate">
                  {soundSystemMuted
                    ? t("soundSystemMuted")
                    : soundEnabled
                    ? t("muteSound")
                    : t("unmuteSound")}
                </span>
                {soundEnabled && !soundSystemMuted ? (
                  <Volume2 className="w-4 h-4 text-gray-500" />
                ) : (
                  <VolumeX className="w-4 h-4 text-gray-500" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between mb-2 mt-1">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                {t("settingsPiecesSection")}
              </h4>
              {tab === "game" && hasGamePieceOverride && onClearGamePieceSet && (
                <button
                  type="button"
                  onClick={onClearGamePieceSet}
                  className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                  title={t("resetThisGameSetting")}
                >
                  <X className="w-3 h-3" />
                  {t("reset")}
                </button>
              )}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {ALL_PIECE_SETS.map((set) => {
                const isActive =
                  tab === "game"
                    ? hasGamePieceOverride && set === gamePieceSet
                    : set === globalPieceSet;
                const isFallback =
                  tab === "game" && !hasGamePieceOverride && set === globalPieceSet;
                return (
                  <button
                    key={set}
                    type="button"
                    onClick={() => selectPieceSet(set)}
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

            <div className="flex items-center justify-between mb-2 mt-4">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                {t("settingsBoardSection")}
              </h4>
              {tab === "game" && hasGameBoardOverride && onClearGameBoardTheme && (
                <button
                  type="button"
                  onClick={onClearGameBoardTheme}
                  className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                  title={t("resetThisGameSetting")}
                >
                  <X className="w-3 h-3" />
                  {t("reset")}
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {ALL_BOARD_THEMES.map((theme) => {
                const colors = BOARD_THEME_COLORS[theme];
                const isActive =
                  tab === "game"
                    ? hasGameBoardOverride && theme === gameBoardTheme
                    : theme === globalBoardTheme;
                const isFallback =
                  tab === "game" && !hasGameBoardOverride && theme === globalBoardTheme;
                return (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => selectBoardTheme(theme)}
                    title={t(`boardThemes.${theme}`)}
                    className={`p-1.5 rounded-xl transition-colors ${
                      isActive
                        ? "bg-orange-100 ring-2 ring-orange-400"
                        : isFallback
                        ? "bg-gray-50 ring-1 ring-gray-200 opacity-60"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="grid grid-cols-2 w-full h-8 rounded-md overflow-hidden border border-gray-200">
                      <span style={{ backgroundColor: colors.light }} />
                      <span style={{ backgroundColor: colors.dark }} />
                    </div>
                    <span className="mt-1.5 block w-full text-[10px] font-semibold text-gray-600 text-center whitespace-nowrap overflow-hidden text-ellipsis leading-none">
                      {t(`boardThemes.${theme}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
