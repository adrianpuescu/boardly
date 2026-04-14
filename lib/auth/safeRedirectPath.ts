/** Only same-origin relative paths; blocks open redirects. */
export function safeAuthRedirectPath(
  nextParam: string | null,
  fallback = "/dashboard"
): string {
  const raw = nextParam?.trim() ? nextParam : fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes("://")) return fallback;
  return decoded;
}
