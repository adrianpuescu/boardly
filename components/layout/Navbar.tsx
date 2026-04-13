"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/types";

interface Props {
  currentUser: CurrentUser;
}

export function Navbar({ currentUser }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [avatarError, setAvatarError] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = currentUser.email.slice(0, 2).toUpperCase();
  const showAvatar = !!currentUser.avatar_url && !avatarError;

  return (
    <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-orange-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <span className="text-2xl select-none" aria-hidden="true">♞</span>
          <span
            className="text-xl font-black text-gray-900"
            style={{ fontFamily: "var(--font-nunito), sans-serif", letterSpacing: "-0.5px" }}
          >
            Boardly
          </span>
        </button>

        {/* User area */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-sm font-medium text-gray-800">
            {currentUser.email}
          </span>

          {showAvatar ? (
            <div className="relative w-9 h-9 rounded-full ring-2 ring-orange-200 overflow-hidden flex-shrink-0">
              <Image
                src={currentUser.avatar_url!}
                alt="avatar"
                fill
                sizes="36px"
                className="object-cover"
                onError={() => setAvatarError(true)}
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-orange-500 ring-2 ring-orange-200 flex items-center justify-center text-white text-sm font-bold select-none flex-shrink-0">
              {initials}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="rounded-xl border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
          >
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  );
}
