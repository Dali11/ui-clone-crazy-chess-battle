"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the device screen awake while `active` is true, using the Screen
 * Wake Lock API. Ships specifically to fix a real support complaint
 * (2026-09-11): players idle on their OWN screen waiting for the
 * opponent's move — not away from the app, just not touching it — were
 * getting their phone's normal auto-lock screen timeout kick in. Once the
 * screen goes dark, most mobile browsers suspend the page's JS timers, so
 * the 4s timeout-check poll (and the heartbeat write it carries) stops.
 * After 120s of that silence, the abandonment rule in
 * src/lib/game/abandonment.ts auto-resigns whoever went silent — and
 * abandonment is presence-only, it does NOT check whose turn it is. So a
 * player who is legitimately just waiting can lose the game purely
 * because their screen timed out, regardless of turn. This hook removes
 * the root cause: keep the screen on for the whole time the game page is
 * open and in progress, so the poll never stops.
 *
 * Not a turn-based exemption — deliberately. A wake lock keeps the poll
 * alive for BOTH players at all times, which is strictly better: it also
 * protects a player who's mid-move from the same fate. Silently no-ops
 * on browsers without the API (older iOS Safari, some in-app webviews) —
 * those players keep the pre-existing behavior, nothing regresses.
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const lock: WakeLockSentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
      } catch {
        // Permission denied / not allowed in this context — silent no-op,
        // falls back to pre-existing behavior.
      }
    };

    acquire();

    // The OS/browser auto-releases the lock when the tab is backgrounded
    // (screen recording tools, other app switch, etc.) — re-acquire the
    // moment the game page is visible again so returning from a brief
    // app-switch doesn't leave the screen unprotected.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !lockRef.current) acquire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
