export const BOARD_THEME_COLORS = {
  classic: { light: "#F0D9B5", dark: "#B58863" },
  green: { light: "#FFFFDD", dark: "#86A666" },
  blue: { light: "#DEE3E6", dark: "#8CA2AD" },
  purple: { light: "#F0E4FF", dark: "#9B72CF" },
  pink: { light: "#FFE4E8", dark: "#E8A0B0" },
  midnight: { light: "#4A4A6A", dark: "#2A2A4A" },
  wood: { light: "#F5DEB3", dark: "#8B4513" },
  coral: { light: "#FFE4D6", dark: "#D4826A" },
} as const;

export type BoardTheme = keyof typeof BOARD_THEME_COLORS;

export const ALL_BOARD_THEMES = Object.keys(BOARD_THEME_COLORS) as BoardTheme[];

export function getBoardThemeStyles(theme: BoardTheme) {
  const colors = BOARD_THEME_COLORS[theme];
  return {
    lightSquareStyle: { backgroundColor: colors.light },
    darkSquareStyle: { backgroundColor: colors.dark },
    // Keep notation color theme-aware by mirroring opposite square color.
    lightSquareNotationStyle: { color: colors.dark },
    darkSquareNotationStyle: { color: colors.light },
  };
}
