"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { CurrentUser } from "@/lib/types";

interface Props {
  currentUser: CurrentUser;
}

function Check() {
  return (
    <svg className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10H3m0 0 3-3m-3 3 3 3M8 5V3.5A1.5 1.5 0 0 1 9.5 2h7A1.5 1.5 0 0 1 18 3.5v13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 8 16.5V15" />
    </svg>
  );
}

export function Navbar({ currentUser }: Props) {
  const router = useRouter();
  const t = useTranslations("nav");
  const currentLocale = useLocale();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState(currentLocale);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync locale from cookie on mount (handles SSR/client mismatch)
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (match) setLocale(match[1]);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function switchLocale(next: string) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    setLocale(next);
    setOpen(false);
    router.refresh();
  }

  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-orange-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <span className="text-2xl chess-sym select-none" aria-hidden="true">♞</span>
          <span
            className="text-xl font-black text-gray-900"
            style={{ fontFamily: "var(--font-nunito), sans-serif", letterSpacing: "-0.5px" }}
          >
            Boardly
          </span>
        </button>

        {/* Profile icon trigger + dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={open}
            title={t("viewProfile")}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${
              open
                ? "bg-orange-100 text-orange-600 ring-2 ring-orange-400 ring-offset-2"
                : "bg-orange-50 text-orange-500 hover:bg-orange-100 hover:text-orange-600"
            }`}
          >
            <UserIcon />
          </button>

          {/* Dropdown card */}
          {open && (
            <div
              role="menu"
              className="absolute right-0 mt-2.5 w-56 rounded-2xl bg-white border border-gray-100 shadow-xl shadow-black/10 py-1.5 z-50 animate-fade-up"
            >
              {/* Email header */}
              <div className="px-4 py-2.5">
                <p className="text-xs font-medium text-gray-400 truncate">{currentUser.email}</p>
              </div>

              <div className="h-px bg-gray-100 mx-2 my-1" />

              {/* Profile */}
              <button
                role="menuitem"
                onClick={() => { setOpen(false); router.push("/profile"); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
              >
                <span className="text-gray-400 group-hover:text-orange-500">
                  <UserIcon />
                </span>
                {t("profile")}
              </button>

              {/* Language options */}
              <div className="px-2 pt-1 pb-0.5">
                <p className="px-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t("language")}
                </p>
                <button
                  role="menuitem"
                  onClick={() => switchLocale("en")}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                >
                  <span className="text-base leading-none">🇬🇧</span>
                  <span className="flex-1 text-left font-medium">English</span>
                  {locale === "en" && <Check />}
                </button>
                <button
                  role="menuitem"
                  onClick={() => switchLocale("ro")}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                >
                  <span className="text-base leading-none">🇷🇴</span>
                  <span className="flex-1 text-left font-medium">Română</span>
                  {locale === "ro" && <Check />}
                </button>
              </div>

              <div className="h-px bg-gray-100 mx-2 my-1" />

              {/* Sign out */}
              <button
                role="menuitem"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors rounded-b-2xl"
              >
                <SignOutIcon />
                {t("signOut")}
              </button>
            </div>
          )}
        </div>

      </div>
    </nav>
  );
}
