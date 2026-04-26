"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { RankingPlayer } from "@/lib/types";

type RankingTab = "global" | "friends" | "country";

interface Props {
  currentUserId: string;
}

function Avatar({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={username}
        className="h-8 w-8 rounded-full object-cover ring-1 ring-orange-100"
      />
    );
  }

  return (
    <div className="h-8 w-8 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center">
      {username.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function RankingsPageClient({ currentUserId }: Props) {
  const t = useTranslations("rankings");
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<RankingTab>("global");
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<RankingPlayer[]>([]);

  useEffect(() => {
    async function loadRankings() {
      setLoading(true);
      try {
        const res = await fetch(`/api/rankings?type=${activeTab}`, { cache: "no-store" });
        const data = (await res.json()) as { players?: RankingPlayer[] };
        if (!res.ok) return;
        setPlayers(data.players ?? []);
      } finally {
        setLoading(false);
      }
    }

    void loadRankings();
  }, [activeTab]);

  const rows = useMemo(
    () =>
      players.map((player, idx) => ({
        ...player,
        rank: idx + 1,
      })),
    [players]
  );

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{
        background: "linear-gradient(160deg, #FAF7F2 0%, #FFF8F0 50%, #FAF7F2 100%)",
      }}
    >
      <div className="max-w-5xl mx-auto space-y-6">
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
          <div className="mb-4 flex flex-wrap gap-2">
            {(["global", "friends", "country"] as RankingTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
                  activeTab === tab
                    ? "bg-orange-500 text-white"
                    : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                }`}
              >
                {t(tab)}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">{t("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b">
                    <th className="py-2 pl-3 pr-2">{t("rank")}</th>
                    <th className="py-2 pr-2">{t("player")}</th>
                    <th className="py-2 pr-2">{t("elo")}</th>
                    <th className="py-2 pr-2">{t("winRate")}</th>
                    <th className="py-2 pr-2">{t("gamesPlayed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((player) => {
                    const isCurrent = player.id === currentUserId;
                    return (
                      <tr
                        key={player.id}
                        className={`border-b border-orange-50 ${
                          isCurrent ? "bg-orange-50/60" : ""
                        }`}
                      >
                        <td className="py-3 pl-3 pr-2 font-semibold text-gray-700">#{player.rank}</td>
                        <td className="py-3 pr-2">
                          <div className="flex items-center gap-2">
                            <Avatar username={player.username} avatarUrl={player.avatar_url} />
                            <span className="font-semibold text-gray-800">{player.username}</span>
                            {isCurrent && (
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                                {t("you")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-2 font-semibold text-gray-900">
                          {player.elo_rating}
                        </td>
                        <td className="py-3 pr-2 text-gray-700">{player.win_rate}%</td>
                        <td className="py-3 pr-2 text-gray-700">{player.games_played}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
