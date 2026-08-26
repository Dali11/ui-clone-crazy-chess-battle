"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export interface GameState {
  id: string;
  fen: string;
  pgn: string | null;
  turn: "white" | "black";
  status: string;
  winner: string | null;
  move_count: number;
  white_clock_ms: number | null;
  black_clock_ms: number | null;
  last_move_at: string | null;
  white_player_id: string;
  black_player_id: string;
  white_rating: number | null;
  black_rating: number | null;
  white_rating_change: number | null;
  black_rating_change: number | null;
  time_control: string;
  initial_minutes: number;
  increment_seconds: number;
  rated: boolean;
  created_at?: string;
  scheduled_start?: string | null;
  tournament_id?: string | null;
}

export interface MoveBroadcast {
  from: string;
  to: string;
  promotion?: string;
  fen: string;
  pgn: string;
  turn: "white" | "black";
  status: string;
  winner: string | null;
  moveCount: number;
  whiteClockMs: number | null;
  blackClockMs: number | null;
  lastMoveAt: string;
}

export interface MoveResult {
  success: boolean;
  error?: string;
}

export function useRealtimeGame(gameId: string, initialState: GameState, currentUserId?: string) {
  // ── Stable Supabase client (created once, not on every render) ──────
  const supabase = useMemo(() => createClient(), []);

  const [game, setGame] = useState<GameState>(initialState);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawOffer, setDrawOffer] = useState<string | null>(null);
  const [opponentMove, setOpponentMove] = useState<MoveBroadcast | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Shared "last applied move" counter used by ALL handlers
  const lastAppliedMoveCount = useRef<number>(initialState.move_count ?? 0);

  // Reconnection counter — bumping this re-triggers the subscription effect
  const [reconnectTick, setReconnectTick] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Connection quality: "online" | "reconnecting" | "offline"
  const [connectionQuality, setConnectionQuality] = useState<"online" | "reconnecting" | "offline">("reconnecting");
  const connectedRef = useRef(false);

  // Track in-flight move to prevent polling from overwriting it
  const inflightMoveRef = useRef<boolean>(false);

  // Pending move queue — if a move fails due to network, queue it and
  // retry automatically. This prevents "stuck pieces" on flaky connections.
  const pendingMoveRef = useRef<{ from: string; to: string; promotion?: string; retries: number } | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref to always have the latest game status for the polling check
  const gameStatusRef = useRef(initialState.status);
  useEffect(() => {
    gameStatusRef.current = game.status;
  }, [game.status]);

  // ── Connection quality helpers ──────────────────────────────────────────
  const updateConnectionQuality = useCallback((quality: "online" | "reconnecting" | "offline") => {
    setConnectionQuality(quality);
    connectedRef.current = quality === "online";
    setConnected(quality === "online");
  }, []);

  // ── Fetch the latest game state from the API as a fallback ──────────────
  const fetchGameState = useCallback(async () => {
    try {
      const res = await fetch(`/api/game/state?gameId=${gameId}`);
      if (!res.ok) return;
      const data = await res.json();

      // Skip polling updates while a move is in-flight
      if (inflightMoveRef.current) return;

      const newMoveCount = data.move_count ?? 0;
      if (newMoveCount < lastAppliedMoveCount.current) return;
      if (newMoveCount === lastAppliedMoveCount.current) {
        if (data.status === gameStatusRef.current) return;
      }

      lastAppliedMoveCount.current = newMoveCount;
      setGame((prev) => ({
        ...prev,
        fen: data.fen ?? prev.fen,
        pgn: data.pgn ?? prev.pgn,
        turn: data.turn ?? prev.turn,
        status: data.status ?? prev.status,
        winner: data.winner ?? prev.winner,
        move_count: newMoveCount,
        white_clock_ms: data.white_clock_ms ?? prev.white_clock_ms,
        black_clock_ms: data.black_clock_ms ?? prev.black_clock_ms,
        last_move_at: data.last_move_at ?? prev.last_move_at,
        scheduled_start: data.scheduled_start ?? prev.scheduled_start,
      }));
    } catch {
      // Silent — polling will retry
    }
  }, [gameId]);

  // ── Send move to server (used by makeMove, with retry) ────────────────────
  const sendMoveToServer = useCallback(async (
    from: string,
    to: string,
    promotion?: string
  ): Promise<MoveResult> => {
    try {
      const response = await fetch("/api/game/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, move: { from, to, promotion: promotion || "q" } }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 409 = concurrency conflict — don't retry, tell client to roll back
        if (response.status === 409) {
          return { success: false, error: "Move conflict" };
        }
        setError(data.error || "Move failed");
        return { success: false, error: data.error || "Move failed" };
      }

      setError(null);
      if (data.fen) {
        if (typeof data.moveCount === "number") {
          lastAppliedMoveCount.current = Math.max(lastAppliedMoveCount.current, data.moveCount);
        }
        setGame((prev) => ({
          ...prev,
          fen: data.fen,
          pgn: data.pgn || prev.pgn,
          turn: data.turn,
          status: data.status,
          winner: data.winner,
          move_count: data.moveCount,
          white_clock_ms: data.whiteClockMs,
          black_clock_ms: data.blackClockMs,
          last_move_at: new Date().toISOString(),
        }));

        // Broadcast the move to the opponent over the realtime channel
        if (channelRef.current) {
          const moveBroadcast: MoveBroadcast = {
            from,
            to,
            promotion: promotion || "q",
            fen: data.fen,
            pgn: data.pgn || "",
            turn: data.turn,
            status: data.status || "playing",
            winner: data.winner,
            moveCount: data.moveCount,
            whiteClockMs: data.whiteClockMs,
            blackClockMs: data.blackClockMs,
            lastMoveAt: new Date().toISOString(),
          };
          channelRef.current.send({
            type: "broadcast",
            event: "move",
            payload: moveBroadcast,
          });
        }
      }
      return { success: true };
    } catch {
      return { success: false, error: "Network error" };
    }
  }, [gameId]);

  // ── makeMove with automatic retry on network failure ─────────────────────
  const makeMove = useCallback(
    async (from: string, to: string, promotion?: string): Promise<MoveResult> => {
      inflightMoveRef.current = true;

      // Cancel any existing retry timer
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      const result = await sendMoveToServer(from, to, promotion);

      if (!result.success && result.error === "Network error") {
        // Network failure — retry with exponential backoff (1s, 2s, 4s)
        // The client already has the optimistic fen showing the piece moved.
        // We retry in the background; only roll back if all retries fail.
        let retryCount = 0;
        const maxRetries = 3;
        const baseDelay = 1000;

        const attemptRetry = async () => {
          retryCount++;
          if (retryCount > maxRetries) {
            // All retries exhausted — signal failure for rollback
            inflightMoveRef.current = false;
            pendingMoveRef.current = null;
            setError("Move failed after retries — check your connection");
            return;
          }

          const retryResult = await sendMoveToServer(from, to, promotion);
          if (retryResult.success) {
            inflightMoveRef.current = false;
            pendingMoveRef.current = null;
            setError(null);
          } else if (retryResult.error === "Network error") {
            const delay = baseDelay * Math.pow(2, retryCount - 1);
            retryTimerRef.current = setTimeout(attemptRetry, delay);
          } else {
            // Non-retryable error (conflict, not your turn, etc.)
            inflightMoveRef.current = false;
            pendingMoveRef.current = null;
          }
        };

        // Queue the move — also auto-send on reconnect if realtime comes back
        pendingMoveRef.current = { from, to, promotion, retries: 0 };
        retryTimerRef.current = setTimeout(attemptRetry, 1000);
        // Return optimistic success — retries handle failure
        // The client keeps the optimistic board; rollback only if all retries fail
        return { success: true };
      }

      inflightMoveRef.current = false;
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendMoveToServer]
  );

  // ── Subscribe to real-time updates ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const updated = payload.new as Partial<GameState>;
          if (
            typeof updated.move_count === "number" &&
            updated.move_count < lastAppliedMoveCount.current
          ) {
            return;
          }
          if (typeof updated.move_count === "number") {
            lastAppliedMoveCount.current = updated.move_count;
          }
          if (updated.status && updated.status !== "playing") {
            setDrawOffer(null);
          }
          setGame((prev) => ({ ...prev, ...updated } as GameState));
        }
      )
      .on("presence", { event: "sync" }, () => {
        updateConnectionQuality("online");
      })
      .on("presence", { event: "join" }, () => {
        updateConnectionQuality("online");
      })
      .on("broadcast", { event: "move" }, (payload: any) => {
        const data = payload.payload as MoveBroadcast;
        if (data.moveCount > lastAppliedMoveCount.current) {
          lastAppliedMoveCount.current = data.moveCount;
          setOpponentMove(data);
          setGame((prev) => ({
            ...prev,
            fen: data.fen,
            pgn: data.pgn,
            turn: data.turn,
            status: data.status,
            winner: data.winner,
            move_count: data.moveCount,
            white_clock_ms: data.whiteClockMs,
            black_clock_ms: data.blackClockMs,
            last_move_at: data.lastMoveAt,
          }));
        }
      })
      .on("broadcast", { event: "draw_offer" }, (payload: any) => {
        const from = payload?.payload?.from;
        if (from && currentUserId && from === currentUserId) return;
        setDrawOffer("offer");
      })
      .on("broadcast", { event: "draw_declined" }, () => {
        setDrawOffer(null);
      })
      .on("broadcast", { event: "draw_accepted" }, () => {
        setDrawOffer(null);
        setGame((prev) => ({ ...prev, status: "draw", winner: null }));
      })
      .on("broadcast", { event: "resign" }, (payload: any) => {
        const data = payload?.payload;
        if (data?.winner) {
          setGame((prev) => ({ ...prev, status: "resign", winner: data.winner }));
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          updateConnectionQuality("online");
          setError(null);
          fetchGameState();
          // If we have a pending move from a previous disconnection, send it now
          if (pendingMoveRef.current) {
            const pm = pendingMoveRef.current;
            pendingMoveRef.current = null;
            makeMove(pm.from, pm.to, pm.promotion);
          }
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          updateConnectionQuality("reconnecting");
          setError("Connection lost. Reconnecting...");
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            setReconnectTick((t) => t + 1);
          }, 2000);
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, reconnectTick]);

  // ── Adaptive polling — fast when disconnected, slow when connected ────────
  // When connected: poll every 3s (lightweight safety net alongside realtime)
  // When disconnected: poll every 800ms (aggressive catch-up so we don't miss
  // opponent moves when the realtime channel is dead)
  useEffect(() => {
    fetchGameState();

    const pollInterval = connectedRef.current ? 3000 : 800;

    pollRef.current = setInterval(() => {
      if (gameStatusRef.current === "playing") {
        fetchGameState();
      }
    }, pollInterval);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchGameState, connectionQuality]);

  // Check for timeout (server-side verification, client-callable)
  const checkTimeout = useCallback(async () => {
    try {
      const res = await fetch("/api/game/timeout-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.timedOut) {
          setGame((prev) => ({
            ...prev,
            status: data.status || "timeout",
            winner: data.winner,
          }));
        }
      }
    } catch {
      // Silent fail
    }
  }, [gameId]);

  // Resign the game
  const resign = useCallback(async () => {
    try {
      const response = await fetch("/api/game/resign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });

      const data = await response.json();
      if (response.ok) {
        setGame((prev) => ({
          ...prev,
          status: "resign",
          winner: data.winner,
        }));
      }
      return data;
    } catch {
      setError("Failed to resign");
      return null;
    }
  }, [gameId]);

  // Draw offer / accept / decline
  const offerDraw = useCallback(async () => {
    setDrawOffer("pending");
    try {
      await fetch("/api/game/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, action: "offer" }),
      });
    } catch {
      setDrawOffer(null);
    }
  }, [gameId]);

  const acceptDraw = useCallback(async () => {
    try {
      const res = await fetch("/api/game/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, action: "accept" }),
      });
      const data = await res.json();
      if (res.ok) {
        setDrawOffer(null);
        setGame((prev) => ({ ...prev, status: "draw", winner: null }));
      }
    } catch {}
  }, [gameId]);

  const declineDraw = useCallback(async () => {
    try {
      await fetch("/api/game/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, action: "decline" }),
      });
    } catch {}
    setDrawOffer(null);
  }, [gameId]);

  // Cleanup retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return { game, connected, connectionQuality, error, drawOffer, makeMove, resign, checkTimeout, setGame, offerDraw, acceptDraw, declineDraw, opponentMove };
}
