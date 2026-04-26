"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { BellIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, es, ro } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  // Sync locale from cookie on mount (handles SSR/client mismatch)
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (match) setLocale(match[1]);
  }, []);

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
    router.refresh();
  }

  async function handleSignOut() {
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
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(currentUser.isGuest ? "/" : "/dashboard")}
          className="h-auto gap-1.5 p-0 font-normal hover:opacity-80"
        >
          <span className="text-2xl chess-sym select-none" aria-hidden="true">♞</span>
          <span
            className="text-xl font-black text-gray-900"
            style={{ fontFamily: "var(--font-nunito), sans-serif", letterSpacing: "-0.5px" }}
          >
            Boardly
          </span>
        </Button>

        <div className="relative flex items-center gap-2">
          <Popover
            open={openNotifications}
            onOpenChange={(open) => {
              setOpenNotifications(open);
              if (open) setOpenProfile(false);
            }}
          >
            <PopoverTrigger
              className={`relative flex h-9 w-9 items-center justify-center rounded-full border-0 transition-all outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                openNotifications
                  ? "bg-orange-100 text-orange-600 ring-2 ring-orange-400 ring-offset-2"
                  : "bg-orange-50 text-orange-500 hover:bg-orange-100 hover:text-orange-600"
              }`}
              aria-label={nt("title")}
            >
              <BellIcon className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              sideOffset={8}
              className="w-80 max-w-[min(20rem,calc(100vw-2rem))] flex-col gap-0 rounded-2xl border border-gray-100 bg-white p-0 text-gray-900 shadow-xl shadow-black/10"
            >
              <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50/40 px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{nt("title")}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={markAllAsRead}
                  disabled={unreadCount === 0}
                  className="h-auto px-2 py-1 text-xs font-medium text-orange-600 hover:text-orange-700 disabled:text-gray-300"
                >
                  {nt("markAllAsRead")}
                </Button>
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
                                  <Button
                                    type="button"
                                    size="xs"
                                    disabled={processingNotificationId === notification.id}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void handleFriendRequestAction(notification, "accept");
                                    }}
                                    className="h-7 rounded-md bg-orange-500 px-2.5 text-[11px] font-semibold text-white hover:bg-orange-600"
                                  >
                                    {nt("acceptFriendRequest")}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    disabled={processingNotificationId === notification.id}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void handleFriendRequestAction(notification, "decline");
                                    }}
                                    className="h-7 rounded-md border-gray-200 px-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                                  >
                                    {nt("declineFriendRequest")}
                                  </Button>
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
            </PopoverContent>
          </Popover>

          <DropdownMenu
            open={openProfile}
            onOpenChange={(open) => {
              setOpenProfile(open);
              if (open) setOpenNotifications(false);
            }}
          >
            <DropdownMenuTrigger
              className={`flex h-9 w-9 items-center justify-center rounded-full border-0 transition-all outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                openProfile
                  ? "bg-orange-100 text-orange-600 ring-2 ring-orange-400 ring-offset-2"
                  : "bg-orange-50 text-orange-500 hover:bg-orange-100 hover:text-orange-600"
              }`}
              aria-label={t("viewProfile")}
            >
              <UserIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={8}
              className="w-56 max-w-[min(14rem,calc(100vw-2rem))] gap-0 rounded-2xl border border-gray-100 bg-white p-0 py-1.5 text-gray-900 shadow-xl shadow-black/10"
            >
              <div className="px-4 py-2.5">
                <p className="truncate text-xs font-medium text-gray-400">{currentUser.email}</p>
                <p className="mt-1 text-xs font-semibold text-orange-600">
                  ELO: {currentUser.elo_rating ?? 1200}
                </p>
              </div>

              <DropdownMenuSeparator className="my-1 bg-gray-100" />

              <DropdownMenuItem
                onClick={() => {
                  setOpenProfile(false);
                  router.push("/profile");
                }}
                className="cursor-pointer gap-3 rounded-none px-4 py-2.5 text-sm font-medium text-gray-700 focus:bg-orange-50 focus:text-orange-600"
              >
                <span className="text-gray-400">
                  <UserIcon />
                </span>
                {t("profile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setOpenProfile(false);
                  router.push("/friends");
                }}
                className="cursor-pointer gap-3 rounded-none px-4 py-2.5 text-sm font-medium text-gray-700 focus:bg-orange-50 focus:text-orange-600"
              >
                <span className="text-gray-400">👥</span>
                {t("friends")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setOpenProfile(false);
                  router.push("/rankings");
                }}
                className="cursor-pointer gap-3 rounded-none px-4 py-2.5 text-sm font-medium text-gray-700 focus:bg-orange-50 focus:text-orange-600"
              >
                <span className="text-gray-400">🏆</span>
                {t("rankings")}
              </DropdownMenuItem>

              <DropdownMenuGroup className="px-2 pt-1 pb-0.5">
                <DropdownMenuLabel className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {t("language")}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={locale}
                  onValueChange={(v) => {
                    switchLocale(v);
                  }}
                >
                  <DropdownMenuRadioItem
                    value="en"
                    className="cursor-pointer gap-3 rounded-xl px-2 py-2 pl-2 text-sm"
                  >
                    <span className="text-base leading-none">🇬🇧</span>
                    <span className="flex-1 text-left font-medium">English</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="ro"
                    className="cursor-pointer gap-3 rounded-xl px-2 py-2 pl-2 text-sm"
                  >
                    <span className="text-base leading-none">🇷🇴</span>
                    <span className="flex-1 text-left font-medium">Română</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="es"
                    className="cursor-pointer gap-3 rounded-xl px-2 py-2 pl-2 text-sm"
                  >
                    <span className="text-base leading-none">🇪🇸</span>
                    <span className="flex-1 text-left font-medium">Español</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>

              <DropdownMenuSeparator className="my-1 bg-gray-100" />

              <DropdownMenuItem
                variant="destructive"
                onClick={handleSignOut}
                className="cursor-pointer gap-3 rounded-b-2xl rounded-t-none px-4 py-2.5 text-sm font-medium"
              >
                <SignOutIcon />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </div>
    </nav>
  );
}
