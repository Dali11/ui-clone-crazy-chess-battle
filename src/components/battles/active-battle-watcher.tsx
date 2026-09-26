"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Swords } from "lucide-react";
import { setActiveBattle, tournamentHasPriority } from "@/lib/active-event-priority";

/**
 * Mounted globally (in the app shell) so a player who left the "waiting"
 * screen — closed the tab, navigated to Home/Play/Wallet/etc. — still gets
 * pulled into their battle the moment it's ready, no matter where they are
 * in the app. Re-asserts on every poll: leaving the battle to play free
 * games never frees them while the staked game is live.
 *
 * Polls /api/battles/active, which also self-heals: if the opponent accepted
 * but the chess game was never actually created (e.g. their browser dropped
 * right after accepting), this endpoint creates it on the next check instead
 * of leaving the challenger stuck.
 *
 * YIELDS to live tournaments (owner rule 2026-09-26): while the tournament
 * watcher has the player bound, this one stays quiet.
 */
export default function ActiveBattleWatcher() {
  const pathname = usePathname();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushRef = useRef(0);

  // The battle-challenge accept flow owns its own navigation — don't fight
  // it. Every other page (including other /game/ pages) is fair game.
  const skip = pathname.startsWith("/battle-challenge/");

  useEffect(() => {
    if (skip) {
      setRedirecting(false);
      setActiveBattle(false);
      return;
    }

    const check = async () => {
      let target: string | null = null;
      try {
        const res = await fetch("/api/battles/active");
        if (!res.ok) return;
        const data = await res.json();

        const battleLive =
          data.active &&
          data.gameId &&
          (data.status === "playing" || data.status === "draw_armageddon");

        setActiveBattle(!!battleLive);

        if (battleLive) target = `/game/${data.gameId}`;
      } catch {}

      if (!target) {
        setRedirecting(false);
        return;
      }

      // Already at their battle game — quiet.
      if (pathname === target) {
        setRedirecting(false);
        return;
      }

      // Live tournament wins — this watcher yields entirely.
      if (tournamentHasPriority()) {
        setRedirecting(false);
        return;
      }

      setRedirecting(true);
      const now = Date.now();
      if (now - lastPushRef.current > 2500) {
        lastPushRef.current = now;
        router.push(target);
        // Safety net: even if navigation is slow/blocked, don't let the
        // banner sit forever — hide it after a few seconds regardless.
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => setRedirecting(false), 4000);
      }
    };

    check();
    intervalRef.current = setInterval(check, 6000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setActiveBattle(false);
    };
  }, [pathname, skip, router]);

  if (!redirecting) return null;

  return (
    <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full bg-ccb-primary text-white text-sm font-medium shadow-lg shadow-ccb-primary/30">
      <Swords className="w-4 h-4" />
      Your battle is starting — jumping in...
    </div>
  );
}
