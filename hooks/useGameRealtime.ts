"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type GameResult = "checkmate" | "stalemate" | "draw" | "resignation" | null;

export interface TimerState {
  turn_started_at?: string;
  white_time_ms?: number;
  black_time_ms?: number;
}

export interface MoveRecord {
  id: string;
  move_san: string;
  fen_after: string;
  move_number: number;
  created_at: string;
  user_id: string;
}

export type RematchOfferPayload = { newGameId: string; fromUserId: string };
export type RematchAcceptPayload = { newGameId: string; fromUserId: string };
export type RematchDeclinePayload = { fromUserId: string };

export interface GamePresenceBroadcastOptions {
  userId?: string | null;
  opponentId?: string | null;
  onRematchOffer?: (payload: RematchOfferPayload) => void;
  onRematchAccept?: (payload: RematchAcceptPayload) => void;
  onRematchDecline?: (payload: RematchDeclinePayload) => void;
}

/** True if `targetId` appears anywhere in the presence blob (keys or nested payloads). */
function presenceStateContainsUserId(
  state: unknown,
  targetId: string
): boolean {
  if (state == null) return false;
  if (typeof state === "string") return state === targetId;
  if (typeof state !== "object") return false;
  if (Array.isArray(state)) {
    return state.some((item) => presenceStateContainsUserId(item, targetId));
  }
  const obj = state as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    // Phoenix/Supabase often keys by socket id; values hold user_id
    if (key === "user_id" && val === targetId) return true;
    if (presenceStateContainsUserId(val, targetId)) return true;
  }
  return false;
}

function computeOpponentOnline(
  channel: RealtimeChannel,
  opponentId: string | null
): boolean {
  if (!opponentId) return false;
  const state = channel.presenceState();
  if (!state || typeof state !== "object") return false;

  // Fast path: presence join key === user id (common when using presence.key = userId)
  const atKey = (state as Record<string, unknown>)[opponentId];
  if (Array.isArray(atKey) && atKey.length > 0) return true;

  return presenceStateContainsUserId(state, opponentId);
}

export function useGameRealtime(
  gameId: string,
  initialFen: string = INITIAL_FEN,
  initialStatus: string = "waiting",
  initialTimerState: TimerState = {},
  presenceBroadcast?: GamePresenceBroadcastOptions
) {
  const channelSuffix = useRef(
    `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );

  const pbRef = useRef<GamePresenceBroadcastOptions | undefined>(undefined);
  pbRef.current = presenceBroadcast;

  const [fen, setFen] = useState(initialFen);
  const [gameStatus, setGameStatus] = useState(initialStatus);
  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [timerState, setTimerState] = useState<TimerState>(initialTimerState);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [drawOfferedBy, setDrawOfferedBy] = useState<string | null>(null);
  const [opponentOnline, setOpponentOnline] = useState(false);

  const socialChannelRef = useRef<RealtimeChannel | null>(null);
  const socialReadyRef = useRef(false);

  useEffect(() => {
    fetch(`/api/moves/${gameId}`)
      .then((r) => r.json())
      .then((data: { moves?: MoveRecord[] }) => {
        if (data.moves) setMoves(data.moves);
      })
      .catch(() => {});
  }, [gameId]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`game-realtime:${gameId}:${channelSuffix.current}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moves",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const move = payload.new as MoveRecord;
          if (move.fen_after) setFen(move.fen_after);
          setMoves((prev) => {
            if (prev.some((m) => m.id === move.id)) return prev;
            return [...prev, move];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const updated = payload.new as {
            status: string;
            winner_id: string | null;
            state: {
              fen?: string;
              result?: string;
              turn_started_at?: string;
              white_time_ms?: number;
              black_time_ms?: number;
              draw_offered_by?: string;
            };
          };

          setGameStatus(updated.status);

          setTimerState({
            turn_started_at: updated.state?.turn_started_at,
            white_time_ms: updated.state?.white_time_ms,
            black_time_ms: updated.state?.black_time_ms,
          });

          setDrawOfferedBy(updated.state?.draw_offered_by ?? null);

          if (updated.status === "completed") {
            setGameOver(true);
            setWinnerId(updated.winner_id ?? null);

            const r = updated.state?.result;
            setGameResult(
              r === "checkmate" || r === "stalemate" || r === "draw" || r === "resignation"
                ? (r as GameResult)
                : null
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // Presence + broadcast: shared channel name so both players join the same room
  useEffect(() => {
    const userId = presenceBroadcast?.userId;
    if (!userId || !gameId) {
      setOpponentOnline(false);
      socialChannelRef.current = null;
      socialReadyRef.current = false;
      return;
    }

    const opponentId = presenceBroadcast?.opponentId ?? null;
    let cancelled = false;
    const supabase = createClient();

    const setup = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }

      const channel = supabase.channel(`game-social:${gameId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: userId },
        },
      });

      socialChannelRef.current = channel;

      channel
        .on("presence", { event: "sync" }, () => {
          if (!cancelled) {
            setOpponentOnline(computeOpponentOnline(channel, opponentId));
          }
        })
        .on("presence", { event: "join" }, () => {
          if (!cancelled) {
            setOpponentOnline(computeOpponentOnline(channel, opponentId));
          }
        })
        .on("presence", { event: "leave" }, () => {
          if (!cancelled) {
            setOpponentOnline(computeOpponentOnline(channel, opponentId));
          }
        })
        .on("broadcast", { event: "rematch_offer" }, ({ payload }) => {
          const p = payload as RematchOfferPayload;
          if (p?.fromUserId && p.fromUserId !== userId) {
            pbRef.current?.onRematchOffer?.(p);
          }
        })
        .on("broadcast", { event: "rematch_accept" }, ({ payload }) => {
          const p = payload as RematchAcceptPayload;
          if (p?.newGameId && p.fromUserId && p.fromUserId !== userId) {
            pbRef.current?.onRematchAccept?.(p);
          }
        })
        .on("broadcast", { event: "rematch_decline" }, ({ payload }) => {
          const p = payload as RematchDeclinePayload;
          if (p?.fromUserId && p.fromUserId !== userId) {
            pbRef.current?.onRematchDecline?.(p);
          }
        });

      channel.subscribe(async (status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          socialReadyRef.current = true;
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
          setOpponentOnline(computeOpponentOnline(channel, opponentId));
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          socialReadyRef.current = false;
        }
      });
    };

    void setup();

    return () => {
      cancelled = true;
      socialReadyRef.current = false;
      const ch = socialChannelRef.current;
      socialChannelRef.current = null;
      if (ch) {
        supabase.removeChannel(ch);
      }
      setOpponentOnline(false);
    };
  }, [gameId, presenceBroadcast?.userId, presenceBroadcast?.opponentId]);

  const sendRematchOffer = useCallback(
    async (newGameId: string, fromUserId: string) => {
      const ch = socialChannelRef.current;
      if (!ch || !socialReadyRef.current) return;
      await ch.send({
        type: "broadcast",
        event: "rematch_offer",
        payload: { newGameId, fromUserId } satisfies RematchOfferPayload,
      });
    },
    []
  );

  const sendRematchAccept = useCallback(
    async (newGameId: string, fromUserId: string) => {
      const ch = socialChannelRef.current;
      if (!ch || !socialReadyRef.current) return;
      await ch.send({
        type: "broadcast",
        event: "rematch_accept",
        payload: { newGameId, fromUserId } satisfies RematchAcceptPayload,
      });
    },
    []
  );

  const sendRematchDecline = useCallback(async (fromUserId: string) => {
    const ch = socialChannelRef.current;
    if (!ch || !socialReadyRef.current) return;
    await ch.send({
      type: "broadcast",
      event: "rematch_decline",
      payload: { fromUserId } satisfies RematchDeclinePayload,
    });
  }, []);

  return {
    fen,
    setFen,
    gameStatus,
    setGameStatus,
    gameOver,
    setGameOver,
    gameResult,
    setGameResult,
    winnerId,
    setWinnerId,
    timerState,
    setTimerState,
    moves,
    setMoves,
    drawOfferedBy,
    setDrawOfferedBy,
    opponentOnline,
    sendRematchOffer,
    sendRematchAccept,
    sendRematchDecline,
  };
}
