"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { setActiveTournament } from "@/lib/active-event-priority";

/**
 * Mounted globally in the app shell. Owner rule (2026-09-26): a player
 * registered in a LIVE tournament must be pulled back to it from
 * ANYWHERE in the app — tournament game, or the tournament page between
 * rounds/arena waves. Navigating away to play free games, battles, or
 * browse never frees them: every poll re-asserts the redirect until the
 * obligation ends (game finished, eliminated, or tournament over).
 *
 * This watcher has TOP priority: while it is active, the battle and
 * free-game watchers yield (see lib/active-event-priority.ts).
 */
export default function ActiveTournamentWatcher() {
  const pathname = usePathname();
  const router = useRouter();
  const [bannerKind, setBannerKind] = useState<"game" | "tournament" | null>(null);
  const lastPushRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      let active = false;
      let target: string | null = null;
      let kind: "game" | "tournament" = "tournament";

      try {
        const res = await fetch("/api/tournaments/active-game");
        if (res.ok) {
          const data = await res.json();
          if (data.active) {
            active = true;
            if (data.destination === "tournament" && data.tournamentId) {
              kind = "tournament";
              target = `/tournament/${data.tournamentId}`;
            } else if (data.gameId) {
              // Covers both the old shape (no destination field) and
              // the new explicit destination "game".
              kind = "game";
              target = `/game/${data.gameId}`;
            }
          }
        }
      } catch {}

      if (cancelled) return;
      setActiveTournament(active);

      // Already where they belong — quiet.
      if (!target || pathname === target) {
        setBannerKind(null);
        return;
      }

      // Somewhere they shouldn't be — pull them back. Re-asserts on
      // EVERY poll; the only throttle is a short navigation-settling
      // window so a single poll never double-pushes.
      setBannerKind(kind);
      const now = Date.now();
      if (now - lastPushRef.current > 2500) {
        lastPushRef.current = now;
        router.push(target);
      }
    };

    // Initial check after 1.5s (lets the page settle), then poll every 6s.
    // The effect re-runs on every navigation, so the check also fires the
    // instant the player lands on a page they shouldn't be on.
    const initialTimer = setTimeout(check, 1500);
    const interval = setInterval(check, 6000);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      setActiveTournament(false);
    };
  }, [pathname, router]);

  if (!bannerKind) return null;

  return (
    <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full bg-ccb-accent text-white text-sm font-medium shadow-lg shadow-ccb-accent/30">
      <Trophy className="w-4 h-4" />
      {bannerKind === "game"
        ? "Your tournament round is live — taking you to the board..."
        : "Your tournament is live — taking you there..."}
    </div>
  );
}
