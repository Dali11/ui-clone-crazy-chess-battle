"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Swords, Trophy, Zap, Users } from "lucide-react";
import { battleHasPriority } from "@/lib/active-event-priority";

/**
 * Mounted globally in the app layout. If the user has ANY active game
 * (free play, battle, tournament, or league), they are redirected to
 * the game board within a few seconds — no matter which app page they're on.
 *
 * Like chess.com: the only way to leave the game is to resign or let it
 * end naturally (checkmate, timeout, draw). Simply navigating away won't
 * free you — you'll be pulled right back, on every poll.
 *
 * YIELDS to live tournaments and battles (owner rule 2026-09-26): while
 * a higher-priority watcher has the player bound, this one stays quiet
 * so the two never fight over navigation.
 */
export default function ActiveGameRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const [gameType, setGameType] = useState<string>("free");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPushRef = useRef(0);

  // Skip on game pages and the live/spectator pages — they're already at the board
  const skip = pathname.startsWith("/game/") || pathname.startsWith("/live/");

  useEffect(() => {
    if (skip) {
      setRedirecting(false);
      return;
    }

    const check = async () => {
      let target: string | null = null;
      try {
        const res = await fetch("/api/game/active");
        if (!res.ok) return;
        const data = await res.json();

        if (data.active && data.gameId) {
          setGameType(data.gameType || "free");
          target = `/game/${data.gameId}`;
        }
      } catch {}

      if (!target) {
        setRedirecting(false);
        return;
      }

      // Already at the game — quiet.
      if (pathname === target) {
        setRedirecting(false);
        return;
      }

      // Live tournament or staked battle wins — this watcher yields.
      if (battleHasPriority()) {
        setRedirecting(false);
        return;
      }

      // Somewhere they shouldn't be — pull them back. Re-asserts on
      // every poll; short settle window avoids double-pushes.
      setRedirecting(true);
      const now = Date.now();
      if (now - lastPushRef.current > 2500) {
        lastPushRef.current = now;
        router.push(target);
      }
    };

    // Initial check after 1.5s (lets the page settle), then poll every 5s.
    // The effect re-runs on navigation, so leaving the board page to
    // anywhere else re-triggers the check immediately.
    const initialTimer = setTimeout(check, 1500);
    intervalRef.current = setInterval(check, 5000);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pathname, skip, router]);

  // Render-time guard (not just the effect): as soon as the pathname is
  // actually on the game page, hide immediately — don't wait for a state
  // update to catch up. This is what was leaving the toast stuck visible
  // until a manual refresh if the effect's re-run lagged the navigation.
  if (!redirecting || skip) return null;

  const config = {
    free: { icon: Zap, label: "Your game is live", color: "bg-ccb-primary" },
    battle: { icon: Swords, label: "Your battle is live", color: "bg-ccb-primary" },
    tournament: { icon: Trophy, label: "Your tournament round is live", color: "bg-ccb-accent" },
    league: { icon: Users, label: "Your league match is live", color: "bg-ccb-accent" },
  };
  const cfg = config[gameType as keyof typeof config] || config.free;
  const Icon = cfg.icon;

  return (
    <div className={`fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full ${cfg.color} text-white text-sm font-medium shadow-lg`}>
      <Icon className="w-4 h-4" />
      {cfg.label} — taking you to the board...
    </div>
  );
}
