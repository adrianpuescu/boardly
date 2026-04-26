"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { BellIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, es, ro } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import type { CurrentUser } from "@/lib/types";

interface Props {
  currentUser: CurrentUser;
}

type NotificationType =
  | "your_turn"
  | "game_over"
  | "invite"
  | "rematch_offer"
  | "game_started"
  | "friend_request"
  | "badge_earned";

interface NotificationItem {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  sent_at: string;
  read_at: string | null;
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
  const pathname = usePathname();
  const t = useTranslations("nav");
  const nt = useTranslations("notifications");
  const currentLocale = useLocale();
  const supabase = useMemo(() => createClient(), []);

  const [openProfile, setOpenProfile] = useState(false);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [locale, setLocale] = useState(currentLocale);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [processingNotificationId, setProcessingNotificationId] = useState<string | null>(
    null
  );
  const [friendRequestResolution, setFriendRequestResolution] = useState<
    Record<string, "accepted" | "declined" | "invalid">
  >({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync locale from cookie on mount (handles SSR/client mismatch)
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (match) setLocale(match[1]);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!openProfile && !openNotifications) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenProfile(false);
        setOpenNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openProfile, openNotifications]);

  // Close on Escape
  useEffect(() => {
    if (!openProfile && !openNotifications) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenProfile(false);
        setOpenNotifications(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openProfile, openNotifications]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const activeGameId = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const gameIdx = parts.lastIndexOf("game");
    if (gameIdx === -1) return null;
    return parts[gameIdx + 1] ?? null;
  }, [pathname]);

  function formatTimeAgo(isoDate: string) {
    return formatDistanceToNow(new Date(isoDate), {
      addSuffix: true,
      locale: locale === "ro" ? ro : locale === "es" ? es : enUS,
    });
  }

  async function fetchNotifications() {
    setLoadingNotifications(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications?: NotificationItem[] };
      setNotifications(data.notifications ?? []);
    } finally {
      setLoadingNotifications(false);
    }
  }

  async function markNotificationAsRead(notificationId: string) {
    const target = notifications.find((n) => n.id === notificationId);
    if (!target || target.read_at) return;

    const now = new Date().toISOString();
    const senderId =
      target.type === "friend_request"
        ? String(target.payload.fromUserId ?? "")
        : "";
    const relatedIds =
      target.type === "friend_request" && senderId
        ? notifications
            .filter(
              (notification) =>
                !notification.read_at &&
                notification.type === "friend_request" &&
                String(notification.payload.fromUserId ?? "") === senderId
            )
            .map((notification) => notification.id)
        : [notificationId];
    const idsToMark = relatedIds.length > 0 ? relatedIds : [notificationId];

    setNotifications((prev) =>
      prev.map((notification) =>
        idsToMark.includes(notification.id)
          ? { ...notification, read_at: now }
          : notification
      )
    );

    await Promise.all(
      idsToMark.map((id) =>
        fetch(`/api/notifications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read_at: now }),
        })
      )
    );
  }

  async function markRelatedFriendRequestNotificationsAsRead(
    notification: NotificationItem,
    readAt: string
  ) {
    const senderId = String(notification.payload.fromUserId ?? "");
    if (!senderId) {
      await fetch(`/api/notifications/${notification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read_at: readAt }),
      });
      return;
    }

    const idsToMark = notifications
      .filter(
        (n) =>
          !n.read_at &&
          n.type === "friend_request" &&
          String(n.payload.fromUserId ?? "") === senderId
      )
      .map((n) => n.id);

    await Promise.all(
      (idsToMark.length > 0 ? idsToMark : [notification.id]).map((id) =>
        fetch(`/api/notifications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read_at: readAt }),
        })
      )
    );
  }

  function dispatchFriendRequestResolvedEvent() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("friendRequestResolved"));
  }

  async function markAllAsRead() {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((notification) => ({ ...notification, read_at: now }))
    );

    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read_at: now }),
    });
  }

  async function dismissCurrentGameYourTurnAlerts(gameId: string) {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((notification) => {
        const notificationGameId = String(notification.payload.game_id ?? "");
        if (
          notification.type === "your_turn" &&
          !notification.read_at &&
          notificationGameId === gameId
        ) {
          return { ...notification, read_at: now };
        }
        return notification;
      })
    );

    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read_at: now, gameId }),
    });
  }

  async function handleFriendRequestAction(
    notification: NotificationItem,
    action: "accept" | "decline"
  ) {
    const friendshipId = String(notification.payload.friendshipId ?? "");
    if (!friendshipId) return;

    const now = new Date().toISOString();
    const resolution = action === "accept" ? "accepted" : "declined";
    setFriendRequestResolution((prev) => ({
      ...prev,
      [notification.id]: resolution,
    }));
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read_at: now } : n))
    );

    setProcessingNotificationId(notification.id);
    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId, action }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setFriendRequestResolution((prev) => ({
            ...prev,
            [notification.id]: "invalid",
          }));
          await markRelatedFriendRequestNotificationsAsRead(notification, now);
          dispatchFriendRequestResolvedEvent();
          return;
        }
        setFriendRequestResolution((prev) => {
          const next = { ...prev };
          delete next[notification.id];
          return next;
        });
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read_at: notification.read_at } : n
          )
        );
        return;
      }

      await markRelatedFriendRequestNotificationsAsRead(notification, now);
      dispatchFriendRequestResolvedEvent();
    } finally {
      setProcessingNotificationId(null);
    }
  }

  useEffect(() => {
    void fetchNotifications();
    const channel = supabase
      .channel(`notifications:${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          void fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser.id, supabase]);

  useEffect(() => {
    if (!activeGameId) return;

    const hasUnreadCurrentGameYourTurn = notifications.some((notification) => {
      if (notification.type !== "your_turn" || notification.read_at) return false;
      return String(notification.payload.game_id ?? "") === activeGameId;
    });

    if (!hasUnreadCurrentGameYourTurn) return;
    void dismissCurrentGameYourTurnAlerts(activeGameId);
  }, [activeGameId, notifications]);

  function switchLocale(next: string) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    setLocale(next);
    setOpenProfile(false);
    setOpenNotifications(false);
    router.refresh();
  }

  async function handleSignOut() {
    setOpenProfile(false);
    setOpenNotifications(false);
    await supabase.auth.signOut();
    router.push("/login");
  }

  function getNotificationBody(notification: NotificationItem) {
    if (notification.type === "your_turn") {
      return nt("yourTurn", {
        opponent: String(notification.payload.opponent_name ?? nt("opponentFallback")),
      });
    }
    if (notification.type === "game_over") {
      return nt("gameOver", {
        opponent: String(notification.payload.opponent_name ?? nt("opponentFallback")),
        result: String(notification.payload.result ?? nt("resultFallback")),
      });
    }
    if (notification.type === "invite") {
      return nt("invite", {
        name: String(notification.payload.name ?? nt("opponentFallback")),
      });
    }
    if (notification.type === "friend_request") {
      return nt("friendRequest", {
        username: String(
          notification.payload.fromUsername ?? nt("opponentFallback")
        ),
      });
    }
    if (notification.type === "game_started") {
      return nt("gameStarted", {
        opponent: String(notification.payload.opponent_name ?? nt("opponentFallback")),
      });
    }
    if (notification.type === "badge_earned") {
      return nt("badgeEarned", {
        name: String(notification.payload.badgeName ?? "Badge"),
        icon: String(notification.payload.badgeIcon ?? "🏅"),
      });
    }
    return nt("rematchOffer", {
      name: String(notification.payload.name ?? nt("opponentFallback")),
    });
  }

  function getNotificationAction(notification: NotificationItem) {
    if (notification.type === "friend_request") {
      return null;
    }
    if (notification.type === "your_turn") {
      return {
        href: `/game/${String(notification.payload.game_id ?? "")}`,
        label: nt("playNow"),
      };
    }
    if (notification.type === "invite") {
      return {
        href: `/join/${String(notification.payload.token ?? "")}`,
        label: nt("acceptInvite"),
      };
    }
    if (notification.type === "badge_earned") {
      return null;
    }
    return {
      href: `/game/${String(notification.payload.game_id ?? "")}`,
      label: nt("viewGame"),
    };
  }

  return (
    <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-orange-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <button
          type="button"
          onClick={() => router.push(currentUser.isGuest ? "/" : "/dashboard")}
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

        <div className="relative flex items-center gap-2" ref={dropdownRef}>
          <button
            onClick={() => {
              setOpenNotifications((v) => !v);
              setOpenProfile(false);
            }}
            aria-haspopup="true"
            aria-expanded={openNotifications}
            title={nt("title")}
            className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-all ${
              openNotifications
                ? "bg-orange-100 text-orange-600 ring-2 ring-orange-400 ring-offset-2"
                : "bg-orange-50 text-orange-500 hover:bg-orange-100 hover:text-orange-600"
            }`}
          >
            <BellIcon className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {openNotifications && (
            <div
              role="menu"
              className="absolute right-0 top-11 w-80 rounded-2xl bg-white border border-gray-100 shadow-xl shadow-black/10 z-50 animate-fade-up overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-orange-100 bg-orange-50/40">
                <p className="text-sm font-semibold text-gray-800">{nt("title")}</p>
                <button
                  onClick={markAllAsRead}
                  disabled={unreadCount === 0}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700 disabled:text-gray-300 disabled:cursor-not-allowed"
                >
                  {nt("markAllAsRead")}
                </button>
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {loadingNotifications && notifications.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-gray-500">{nt("loading")}</p>
                ) : notifications.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-gray-500">{nt("empty")}</p>
                ) : (
                  notifications.map((notification) => {
                    const action = getNotificationAction(notification);
                    return (
                      <div
                        key={notification.id}
                        onClick={() => {
                          if (notification.type === "friend_request") return;
                          void markNotificationAsRead(notification.id);
                        }}
                        className={`px-4 py-3 border-b border-gray-100/90 transition-colors cursor-pointer ${
                          notification.read_at
                            ? "bg-white"
                            : "bg-orange-50/40 border-l-2 border-l-orange-300"
                        }`}
                      >
                        <p className="text-sm text-gray-700 leading-5">
                          {getNotificationBody(notification)}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {formatTimeAgo(notification.sent_at)}
                          </span>
                          {notification.type === "friend_request" ? (
                            friendRequestResolution[notification.id] ? (
                              <span
                                className={`text-xs font-semibold ${
                                  friendRequestResolution[notification.id] === "accepted"
                                    ? "text-green-600"
                                    : "text-gray-500"
                                }`}
                              >
                                {friendRequestResolution[notification.id] === "accepted"
                                  ? nt("friendRequestAccepted")
                                  : friendRequestResolution[notification.id] === "declined"
                                  ? nt("friendRequestDeclined")
                                  : nt("friendRequestInvalid")}
                              </span>
                            ) : (
                              notification.read_at ? null : (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={processingNotificationId === notification.id}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void handleFriendRequestAction(notification, "accept");
                                    }}
                                    className="rounded-md bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                                  >
                                    {nt("acceptFriendRequest")}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={processingNotificationId === notification.id}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void handleFriendRequestAction(notification, "decline");
                                    }}
                                    className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                                  >
                                    {nt("declineFriendRequest")}
                                  </button>
                                </div>
                              )
                            )
                          ) : action ? (
                            <Link
                              href={action.href}
                              onClick={() => {
                                void markNotificationAsRead(notification.id);
                                setOpenNotifications(false);
                              }}
                              className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                            >
                              {action.label}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Profile icon trigger + dropdown */}
          <button
            onClick={() => {
              setOpenProfile((v) => !v);
              setOpenNotifications(false);
            }}
            aria-haspopup="true"
            aria-expanded={openProfile}
            title={t("viewProfile")}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${
              openProfile
                ? "bg-orange-100 text-orange-600 ring-2 ring-orange-400 ring-offset-2"
                : "bg-orange-50 text-orange-500 hover:bg-orange-100 hover:text-orange-600"
            }`}
          >
            <UserIcon />
          </button>

          {/* Dropdown card */}
          {openProfile && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2.5 w-56 rounded-2xl bg-white border border-gray-100 shadow-xl shadow-black/10 py-1.5 z-50 animate-fade-up"
            >
              {/* Email header */}
              <div className="px-4 py-2.5">
                <p className="text-xs font-medium text-gray-400 truncate">{currentUser.email}</p>
                <p className="mt-1 text-xs font-semibold text-orange-600">
                  ELO: {currentUser.elo_rating ?? 1200}
                </p>
              </div>

              <div className="h-px bg-gray-100 mx-2 my-1" />

              {/* Profile */}
              <button
                role="menuitem"
                onClick={() => { setOpenProfile(false); router.push("/profile"); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
              >
                <span className="text-gray-400 group-hover:text-orange-500">
                  <UserIcon />
                </span>
                {t("profile")}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setOpenProfile(false);
                  router.push("/friends");
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
              >
                <span className="text-gray-400">👥</span>
                {t("friends")}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setOpenProfile(false);
                  router.push("/rankings");
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
              >
                <span className="text-gray-400">🏆</span>
                {t("rankings")}
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
                <button
                  role="menuitem"
                  onClick={() => switchLocale("es")}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                >
                  <span className="text-base leading-none">🇪🇸</span>
                  <span className="flex-1 text-left font-medium">Español</span>
                  {locale === "es" && <Check />}
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
