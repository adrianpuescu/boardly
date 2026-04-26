"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  FriendListItem,
  IncomingFriendRequest,
  OutgoingFriendRequest,
} from "@/lib/types";

interface SuggestedPlayer {
  id: string;
  username: string;
  avatar_url: string | null;
}

export function FriendsPageClient() {
  const t = useTranslations("friends");
  const router = useRouter();

  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [incoming, setIncoming] = useState<IncomingFriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingFriendRequest[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedPlayer[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  const hasAnyPending = useMemo(
    () => incoming.length > 0 || outgoing.length > 0,
    [incoming.length, outgoing.length]
  );

  async function handleRespond(friendshipId: string, action: "accept" | "decline") {
    setLoadingId(friendshipId);
    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId, action }),
      });

      if (!res.ok) return;

      const request = incoming.find((item) => item.friendshipId === friendshipId);
      setIncoming((prev) => prev.filter((item) => item.friendshipId !== friendshipId));

      if (action === "accept" && request) {
        setFriends((prev) => [
          {
            friendshipId,
            id: request.requester_id,
            username: request.username,
            avatar_url: request.avatar_url,
            status: "accepted",
            created_at: request.created_at,
            updated_at: new Date().toISOString(),
            is_online: false,
          },
          ...prev,
        ]);
      }
    } finally {
      setLoadingId(null);
    }
  }

  async function handleUnfriend(friendshipId: string) {
    setLoadingId(friendshipId);
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
      if (!res.ok) return;
      setFriends((prev) => prev.filter((friend) => friend.friendshipId !== friendshipId));
    } finally {
      setLoadingId(null);
    }
  }

  async function reloadAllData() {
    setLoadingLists(true);
    setLoadingSuggestions(true);
    try {
      const [friendsRes, suggestionsRes] = await Promise.all([
        fetch("/api/friends?includePending=1", { cache: "no-store" }),
        fetch("/api/friends/suggestions", { cache: "no-store" }),
      ]);

      if (friendsRes.ok) {
        const data = (await friendsRes.json()) as {
          friends?: FriendListItem[];
          incoming?: IncomingFriendRequest[];
          outgoing?: OutgoingFriendRequest[];
        };
        setFriends(data.friends ?? []);
        setIncoming(data.incoming ?? []);
        setOutgoing(data.outgoing ?? []);
      }

      if (suggestionsRes.ok) {
        const data = (await suggestionsRes.json()) as {
          suggestions?: SuggestedPlayer[];
        };
        setSuggestions(data.suggestions ?? []);
      }
    } finally {
      setLoadingLists(false);
      setLoadingSuggestions(false);
    }
  }

  useEffect(() => {
    void reloadAllData();
  }, []);

  useEffect(() => {
    function handleFriendRequestResolved() {
      void reloadAllData();
    }

    window.addEventListener(
      "friendRequestResolved",
      handleFriendRequestResolved as EventListener
    );
    return () => {
      window.removeEventListener(
        "friendRequestResolved",
        handleFriendRequestResolved as EventListener
      );
    };
  }, []);

  async function handleAddFriend(suggested: SuggestedPlayer) {
    setLoadingId(suggested.id);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresseeId: suggested.id }),
      });
      if (!res.ok) return;
      await reloadAllData();
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{
        background: "linear-gradient(160deg, #FAF7F2 0%, #FFF8F0 50%, #FAF7F2 100%)",
      }}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm font-medium">{t("back")}</span>
        </button>

        <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50">
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
        </section>

        <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50">
          <h2 className="text-base font-bold text-gray-800 mb-4">
            {t("suggestionsSection")}
          </h2>
          {loadingSuggestions ? (
            <p className="text-sm text-gray-500">{t("loadingSuggestions")}</p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-gray-500">{t("noSuggestions")}</p>
          ) : (
            <div className="space-y-3">
              {suggestions.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 rounded-2xl border border-orange-100 p-3"
                >
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center">
                    {player.username.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">
                    {player.username}
                  </p>
                  <Button
                    disabled={loadingId === player.id}
                    onClick={() => handleAddFriend(player)}
                    className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    {t("addFriend")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50">
          <h2 className="text-base font-bold text-gray-800 mb-4">
            {t("friendsSection", { count: friends.length })}
          </h2>

          {friends.length === 0 ? (
            <p className="text-sm text-gray-500">
              {loadingLists ? t("loadingSuggestions") : t("noFriends")}
            </p>
          ) : (
            <ul className="space-y-3">
              {friends.map((friend) => (
                <li
                  key={friend.friendshipId}
                  className="flex items-center gap-3 rounded-2xl border border-orange-100 p-3"
                >
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center">
                    {friend.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {friend.username}
                    </p>
                    <p
                      className={`text-xs ${
                        friend.is_online ? "text-green-600" : "text-gray-400"
                      }`}
                    >
                      {friend.is_online ? t("online") : t("offline")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={loadingId === friend.friendshipId}
                    onClick={() => handleUnfriend(friend.friendshipId)}
                    className="rounded-xl"
                  >
                    {t("unfriend")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-3xl p-6 shadow-md border border-orange-50">
          <h2 className="text-base font-bold text-gray-800 mb-4">
            {t("pendingSection")}
          </h2>

          {!hasAnyPending ? (
            <p className="text-sm text-gray-500">
              {loadingLists ? t("loadingSuggestions") : t("noPending")}
            </p>
          ) : (
            <div className="space-y-5">
              {incoming.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {t("incoming")}
                  </p>
                  {incoming.map((req) => (
                    <div
                      key={req.friendshipId}
                      className="flex items-center gap-3 rounded-2xl border border-orange-100 p-3"
                    >
                      <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center">
                        {req.username.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">
                        {req.username}
                      </p>
                      <Button
                        disabled={loadingId === req.friendshipId}
                        onClick={() => handleRespond(req.friendshipId, "accept")}
                        className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        {t("accept")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={loadingId === req.friendshipId}
                        onClick={() => handleRespond(req.friendshipId, "decline")}
                        className="rounded-xl"
                      >
                        {t("decline")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {outgoing.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {t("outgoing")}
                  </p>
                  {outgoing.map((req) => (
                    <div
                      key={req.friendshipId}
                      className="flex items-center gap-3 rounded-2xl border border-orange-100 p-3"
                    >
                      <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center">
                        {req.username.slice(0, 2).toUpperCase()}
                      </div>
                      <p className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">
                        {req.username}
                      </p>
                      <span
                        className={`text-xs font-semibold rounded-full px-3 py-1 ${
                          req.status === "declined"
                            ? "bg-gray-100 text-gray-500"
                            : "bg-orange-50 text-orange-700"
                        }`}
                      >
                        {req.status === "declined" ? t("declinedStatus") : t("pending")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
