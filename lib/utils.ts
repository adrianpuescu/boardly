import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Values Next/Image accepts as `src` (emoji placeholders like "🤖" must render as text, not Image). */
export function isNextImageCompatibleSrc(src: string | null | undefined): boolean {
  const s = src?.trim();
  if (!s) return false;
  return (
    s.startsWith("/") ||
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:image/")
  );
}
