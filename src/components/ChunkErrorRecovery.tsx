"use client";

import { useEffect } from "react";

/**
 * Detects "stale bundle" errors — ChunkLoadError, "Loading chunk X failed",
 * "Failed to fetch dynamically imported module" — which happen when a
 * user's browser has an old JS bundle in memory and a new deploy has gone
 * out from under them (the old chunk hash no longer exists on the server).
 *
 * Without this, the app can get stuck forever on a loading/splash screen
 * because the failed dynamic import never resolves into a React error
 * boundary. This forces a one-time hard reload to pull the fresh bundle,
 * which fixes it immediately. A sessionStorage guard prevents infinite
 * reload loops if the error is caused by something else entirely.
 */
const RELOAD_GUARD_KEY = "ccb_chunk_reload_guard";
const RELOAD_GUARD_TTL_MS = 15_000;

// Exported so error.tsx / ErrorPage can run the same detection: Next.js
// routes dynamic-import (next/dynamic) chunk failures into the nearest
// React error boundary as a thrown render error — they never reach
// window's 'error'/'unhandledrejection' listeners below. Without this,
// a stale tab hitting a page with a next/dynamic component (e.g.
// /play/computer's ssr:false chess board) during a deploy shows the
// scary "Something went wrong" screen instead of silently recovering.
export function isChunkError(message: string | undefined | null): boolean {
  if (!message) return false;
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

export function recoverFromChunkError() {
  try {
    const last = sessionStorage.getItem(RELOAD_GUARD_KEY);
    const now = Date.now();
    if (last && now - Number(last) < RELOAD_GUARD_TTL_MS) {
      // Already reloaded once recently for this — don't loop.
      return;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    // sessionStorage unavailable — reload anyway, once.
  }
  window.location.reload();
}

export default function ChunkErrorRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isChunkError(event.message) || isChunkError(event.error?.message)) {
        recoverFromChunkError();
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = typeof reason === "string" ? reason : reason?.message;
      if (isChunkError(message)) {
        recoverFromChunkError();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
