export const GUEST_GAMES_STORAGE_KEY = "boardly-guest-games";
export const GUEST_GAMES_LIMIT = 1;

export function getGuestGamesCount(): number {
  if (typeof window === "undefined") return 0;

  try {
    const raw = window.localStorage.getItem(GUEST_GAMES_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function incrementGuestGamesCount(): number {
  const next = getGuestGamesCount() + 1;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(GUEST_GAMES_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage failures in private mode, etc.
    }
  }

  return next;
}

export function guestReachedGameLimit(): boolean {
  return getGuestGamesCount() >= GUEST_GAMES_LIMIT;
}
