"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Swords } from "lucide-react";

/**
 * Mounted globally (in the app layout) so a player who left the "waiting"
 * screen — closed the tab, navigated to Home/Play/Wallet/etc. — still gets
 * pulled into their battle the moment it's ready, no matter where they are
 * in the app.
 *
 * Polls /api/battles/active, which also self-heals: if the opponent accepted
 * but the chess game was never actually created (e.g. their browser dropped
 * right after accepting), this endpoint creates it on the next check instead
 * of leaving the challenger stuck.
 */
export default function ActiveBattleWatcher() {
  const pathname = usePathname();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRedirectedGameId = useRef<string | null>(null);

  // Skip on pages that already own their own redirect/poll logic — avoids
  // duplicate work and any race with in-game realtime subscriptions.
  const skip = pathname.startsWith("/game/") || pathname.startsWith("/battle-challenge/");

  // As soon as we land on a page this watcher should stay quiet on (most
  // importantly the game page itself, right after the redirect it triggered),
  // clear the banner. Without this, the "jumping in..." toast — since this
  // component stays mounted globally across navigation — would linger
  // forever on the destination page until a full refresh reset React state.
  useEffect(() => {
    if (skip) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setRedirecting(false);
    }
  }, [skip]);

  useEffect(() => {
    if (skip) return;

    const check = async () => {
      try {
        const res = await fetch("/api/battles/active");
        if (!res.ok) return;
        const data = await res.json();

        if (
          data.active &&
          data.gameId &&
          (data.status === "playing" || data.status === "draw_armageddon") &&
          lastRedirectedGameId.current !== data.gameId
        ) {
          lastRedirectedGameId.current = data.gameId;
          setRedirecting(true);
          router.push(`/game/${data.gameId}`);
          // Safety net: even if navigation is slow/blocked, don't let the
          // banner sit forever — hide it after a few seconds regardless.
          if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = setTimeout(() => setRedirecting(false), 4000);
        }
      } catch {}
    };

    check();
    intervalRef.current = setInterval(check, 6000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pathname, skip, router]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  if (!redirecting) return null;

  return (
    <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full bg-ccb-primary text-white text-sm font-medium shadow-lg shadow-ccb-primary/30">
      <Swords className="w-4 h-4" />
      Your battle is starting — jumping in...
    </div>
  );
}
