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
  const [spectatorCount, setSpectatorCount] = useState(0);
  const spectatorCountRef = useRef(0);
  const [opponentMove, setOpponentMove] = useState<MoveBroadcast | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Shared "last applied move" counter used by ALL handlers
  const lastAppliedMoveCount = useRef<number>(initialState.move_count ?? 0);

  // Track when we last received ANY realtime event (postgres_changes, broadcast,
  // or presence). If no event arrives within STALE_THRESHOLD, we downgrade to
  // "reconnecting" mode to trigger aggressive polling — the WebSocket may have
  // silently dropped without firing CHANNEL_ERROR (common on mobile networks).
  const lastEventTimeRef = useRef<number>(Date.now());
  const STALE_THRESHOLD_MS = 8000; // 8 seconds with no events = suspect connection

  // Reconnection counter — bumping this re-triggers the subscription effect
  const [reconnectTick, setReconnectTick] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Connection quality: "online" | "reconnecting" | "offline"
  const [connectionQuality, setConnectionQuality] = useState<"online" | "reconnecting" | "offline">("reconnecting");
  const connectedRef = useRef(false);

  // Track in-flight move to prevent polling from overwriting it
  const inflightMoveRef = useRef<boolean>(false);

  // Pending move queue — if a move fails due to network, queue it and
  // retry automatically. This prevents "stuck pieces" on flaky connections.
  const pendingMoveRef = useRef<{ from: string; to: string; promotion?: string } | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lets the channel's SUBSCRIBED handler fast-track a pending move retry
  // the instant the connection actually recovers, instead of waiting out
  // the remaining backoff delay (or worse, firing a second concurrent
  // makeMove() call that could double-submit the same move).
  const forceRetryRef = useRef<(() => void) | null>(null);

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
  // IMPORTANT: this is a real-money game (staked battles) — a move that
  // silently vanishes on a flaky connection can cost someone a game and
  // their stake. Previously this function returned { success: true }
  // IMMEDIATELY on the first network failure, before any retry had even
  // run — so the caller's rollback-on-failure logic never fired even when
  // every retry ultimately failed. The piece looked moved on screen, the
  // server never got it, the player's clock kept draining, and there was
  // no visible error. That's the "stuck, nothing I can do" bug.
  //
  // Fix: the returned promise now only resolves once we know the real
  // outcome — either the move landed, or we've exhausted a generous retry
  // budget (capped backoff, ~2 minutes total) AND confirmed the channel
  // never came back. Only then do we resolve failure so the caller rolls
  // back the optimistic move. We also fast-track a retry the instant the
  // realtime channel reports SUBSCRIBED again, instead of waiting out
  // whatever backoff delay is left.
  const makeMove = useCallback(
    (from: string, to: string, promotion?: string): Promise<MoveResult> => {
      inflightMoveRef.current = true;

      // Cancel any existing retry timer/handler from a previous move
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      forceRetryRef.current = null;

      return new Promise<MoveResult>((resolve) => {
        (async () => {
          const result = await sendMoveToServer(from, to, promotion);

          if (result.success || result.error !== "Network error") {
            // Either it landed, or it failed for a non-network reason
            // (not your turn, move conflict, etc.) — nothing to retry.
            inflightMoveRef.current = false;
            resolve(result);
            return;
          }

          // Network failure — retry with capped exponential backoff:
          // 1s, 2s, 4s, 8s, 10s, 10s, ... up to 14 attempts (~2 minutes).
          // The client already shows the optimistic fen with the piece
          // moved; we keep retrying in the background and only resolve
          // (triggering rollback) once we truly give up.
          pendingMoveRef.current = { from, to, promotion };
          const maxRetries = 14;
          const baseDelay = 1000;
          const maxDelay = 10000;
          let retryCount = 0;

          const finish = (res: MoveResult) => {
            inflightMoveRef.current = false;
            pendingMoveRef.current = null;
            forceRetryRef.current = null;
            resolve(res);
          };

          const attemptRetry = async () => {
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }
            retryCount++;
            const retryResult = await sendMoveToServer(from, to, promotion);

            if (retryResult.success) {
              setError(null);
              finish(retryResult);
              return;
            }

            if (retryResult.error === "Network error") {
              if (retryCount >= maxRetries) {
                setError("Move failed after retries — check your connection");
                finish({ success: false, error: "Network error" });
                return;
              }
              setError(`Move not confirmed — retrying (${retryCount}/${maxRetries})…`);
              const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
              forceRetryRef.current = attemptRetry;
              retryTimerRef.current = setTimeout(attemptRetry, delay);
            } else {
              // Non-retryable error (conflict, not your turn, etc.) — the
              // move already landed via another path (e.g. a reconnect
              // fast-track fired concurrently), or the game moved on.
              // Treat as resolved either way; don't roll back a move that
              // may well have actually succeeded server-side.
              finish({ success: true });
            }
          };

          forceRetryRef.current = attemptRetry;
          retryTimerRef.current = setTimeout(attemptRetry, baseDelay);
        })();
      });
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
          lastEventTimeRef.current = Date.now();
          if (connectedRef.current !== true) updateConnectionQuality("online");
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
          setGame((prev) => {
            // Guard: never let a null fen from a DB row override the current
            // state. Games created via direct insert (not the create_game RPC)
          // may have fen: null in the DB. A realtime UPDATE on such a row
          // (e.g. spectator_count change) would spread null over our state
          // and crash chess.js's load() → fen.split(/\s+/) on null.
          const merged = { ...prev, ...updated } as GameState;
          if (merged.fen == null) {
            merged.fen = prev.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
          }
          return merged;
          });
        }
      )
      .on("presence", { event: "sync" }, () => {
        lastEventTimeRef.current = Date.now();
        updateConnectionQuality("online");
        const state = channel.presenceState();
        const userIds = new Set(Object.keys(state));
        // Spectators = total presence minus the 2 players
        const players = new Set([initialState.white_player_id, initialState.black_player_id].filter(Boolean));
        let specs = 0;
        for (const id of userIds) {
          if (!players.has(id)) specs++;
        }
        setSpectatorCount(specs);
        // Persist spectator count to DB via API (throttled — only on change)
        // Never use the admin/service-role client from client-side code.
        if (specs !== spectatorCountRef.current) {
          spectatorCountRef.current = specs;
          fetch("/api/game/spectator-count", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameId, count: specs }),
          }).catch(() => {});
        }
      })
      .on("presence", { event: "join" }, () => {
        lastEventTimeRef.current = Date.now();
        updateConnectionQuality("online");
      })
      .on("presence", { event: "leave" }, () => {
        lastEventTimeRef.current = Date.now();
      })
      .on("broadcast", { event: "move" }, (payload: any) => {
        lastEventTimeRef.current = Date.now();
        if (connectedRef.current !== true) updateConnectionQuality("online");
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
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Track our presence so the channel's presence sync fires —
          // without this, presence events never trigger and the only
          // signal that the WebSocket is alive is the initial SUBSCRIBED.
          await channel.track({ user_id: currentUserId, at: Date.now() });
          lastEventTimeRef.current = Date.now();
          updateConnectionQuality("online");
          fetchGameState();
          // If a move is mid-retry from a previous disconnection, fast-track
          // it right now instead of waiting out the remaining backoff delay
          // — the channel just confirmed it's actually back. Call the
          // in-flight retry closure directly (not a fresh makeMove()) so we
          // never risk submitting the same move twice concurrently.
          if (forceRetryRef.current) {
            forceRetryRef.current();
          } else {
            setError(null);
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

    // Active liveness ping: previously, lastEventTimeRef only updated when
    // an ORGANIC event happened — an opponent's move, a presence join/leave,
    // a broadcast. But a real chess game is silent for long stretches while
    // someone is just thinking (routinely 10-60+ seconds), which the old
    // heartbeat mistook for a dead connection and flashed a scary
    // "Reconnecting..." banner even though nothing was actually wrong. That
    // false alarm is exactly what got reported — the banner shows up mid-
    // game with a perfectly fine connection, just because both players went
    // quiet for 8+ seconds.
    //
    // Fix: actively probe the channel ourselves every few seconds via a
    // presence re-track (a genuine round trip through Supabase's realtime
    // server) instead of passively waiting for someone else to generate
    // traffic. A successful track() + its own "sync" callback firing proves
    // the socket is truly alive; a rejected/hanging track() means it isn't.
    const presencePing = setInterval(() => {
      channel.track({ user_id: currentUserId, at: Date.now() }).catch(() => {
        // track() itself failed — the socket is genuinely dead, not just quiet.
        updateConnectionQuality("reconnecting");
      });
    }, 5000);

    // Heartbeat: check if the connection has gone stale (no events —
    // including our own presence pings above — for STALE_THRESHOLD_MS).
    // Since presencePing now guarantees a real event at least every 5s on a
    // healthy connection, this only fires on genuine staleness, not normal
    // thinking pauses.
    const heartbeat = setInterval(() => {
      const staleFor = Date.now() - lastEventTimeRef.current;
      if (staleFor > STALE_THRESHOLD_MS && connectedRef.current) {
        updateConnectionQuality("reconnecting");
      }
    }, 3000);

    return () => {
      clearInterval(heartbeat);
      clearInterval(presencePing);
      supabase.removeChannel(channel);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, reconnectTick]);

  // ── Force resync on tab foreground ──────────────────────────────────────
  // Mobile browsers commonly suspend/kill the WebSocket when the tab is
  // backgrounded (screen off, app-switch, even briefly) WITHOUT firing
  // CHANNEL_ERROR — so the heartbeat staleness check never catches it while
  // backgrounded, and the connection can look "online" on resume even though
  // events were silently dropped the whole time. If the one event that
  // mattered (opponent's move) got dropped in that window, there was
  // previously no trigger to ever recover — the board would sit frozen on
  // stale state until the user manually hit refresh. Now, coming back to the
  // foreground always forces an immediate fetch AND a full channel
  // resubscribe (via reconnectTick), regardless of what the heuristics think.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === "visible") {
        fetchGameState();
        setReconnectTick((t) => t + 1);
      }
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGameState]);

  // ── Adaptive polling — fast when disconnected, slow when connected ────────
  // When connected: poll every 1.5s (safety net alongside realtime)
  // When disconnected: poll every 500ms (aggressive catch-up so we don't miss
  // opponent moves when the realtime channel is dead)
  useEffect(() => {
    fetchGameState();

    // Self-scheduling chain (not setInterval) so every poll gets a fresh
    // jittered delay. Jitter desynchronizes players so 20 active players
    // don't fire in lockstep bursts at the API, and a long disconnect
    // ESCALATES instead of hammering at 500ms forever — which tripled
    // request volume during an auth slowdown and fed the very congestion
    // it was trying to overcome.
    let fastPolls = 0;
    const scheduleNext = () => {
      // EGRESS FIX (was 1.5–3s while online): realtime broadcasts drive
      // live updates — the poll is only a safety net for silently-dropped
      // events, so it runs at 10–15s when the channel is healthy and stays
      // aggressive only when it isn't. A backgrounded tab polls at 15s
      // heartbeat (the visibilitychange resync above force-fetches on
      // return to the foreground, so nothing is lost).
      const delay = document.visibilityState === "hidden"
        ? 15000 // backgrounded: heartbeat only, no fetch
        : connectedRef.current
          ? 10000 + Math.random() * 5000 // online: 10–15s safety net
          : fastPolls < 8
            ? 600 // just dropped: aggressive catch-up (~first 5 seconds)
            : 2000 + Math.random() * 2000; // still down: back off to 2–4s
      pollRef.current = setTimeout(() => {
        if (!connectedRef.current) fastPolls++;
        // Poll during "waiting" too — this is the only fallback that can
        // catch a dropped realtime event flipping waiting -> playing (e.g.
        // pre-game countdown hitting 0:00 and never transitioning on flaky
        // mobile connections). Without this, a missed single UPDATE event
        // leaves the client frozen on the countdown screen forever, since
        // nothing else re-checks game state while status stays "waiting".
        if (
          document.visibilityState === "visible" &&
          (gameStatusRef.current === "playing" || gameStatusRef.current === "waiting")
        ) {
          fetchGameState();
        }
        scheduleNext();
      }, delay);
    };
    scheduleNext();

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
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

  return { game, connected, connectionQuality, error, drawOffer, makeMove, resign, checkTimeout, setGame, offerDraw, acceptDraw, declineDraw, opponentMove, spectatorCount };
}
