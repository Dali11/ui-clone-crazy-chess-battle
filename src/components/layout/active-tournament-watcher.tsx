"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Trophy } from "lucide-react";

/**
 * Mounted globally in the app layout. If the user has an active tournament
 * game where it's their turn, they get redirected to the game board within
 * a few seconds — no matter which app page they're on.
 *
 * This prevents players from ignoring a tournament round to go play free
 * games or browse the app. Skip on /game/ pages (they're already there).
 */
export default function ActiveTournamentWatcher() {
  const pathname = usePathname();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRedirectedGameId = useRef<string | null>(null);
  const hasCheckedRef = useRef(false);

  // Skip on game pages — they're already at the board
  const skip = pathname.startsWith("/game/");

  useEffect(() => {
    if (skip) {
      setRedirecting(false);
      return;
    }

    const check = async () => {
      try {
        const res = await fetch("/api/tournaments/active-game");
        if (!res.ok) return;
        const data = await res.json();

        if (
          data.active &&
          data.gameId &&
          lastRedirectedGameId.current !== data.gameId
        ) {
          lastRedirectedGameId.current = data.gameId;
          setRedirecting(true);
          router.push(`/game/${data.gameId}`);
        }
      } catch {}
    };

    // Initial check after 2 seconds (lets the page settle), then poll every 10s
    const initialTimer = setTimeout(() => {
      check();
      hasCheckedRef.current = true;
    }, 2000);

    intervalRef.current = setInterval(check, 10000);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pathname, skip, router]);

  if (!redirecting) return null;

  return (
    <div className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full bg-ccb-accent text-white text-sm font-medium shadow-lg shadow-ccb-accent/30">
      <Trophy className="w-4 h-4" />
      Your tournament round is live — taking you to the board...
    </div>
  );
}
