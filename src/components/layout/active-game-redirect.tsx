"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Swords, Trophy, Zap, Users } from "lucide-react";

/**
 * Mounted globally in the app layout. If the user has ANY active game
 * (free play, battle, tournament, or league), they are redirected to
 * the game board within a few seconds — no matter which app page they're on.
 *
 * Like chess.com: the only way to leave the game is to resign or let it
 * end naturally (checkmate, timeout, draw). Simply navigating away won't
 * free you — you'll be pulled right back.
 *
 * Skip on /game/ pages (they're already at the board).
 */
export default function ActiveGameRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const [gameType, setGameType] = useState<string>("free");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRedirectedGameId = useRef<string | null>(null);

  // Skip on game pages and the live/spectator pages — they're already at the board
  const skip = pathname.startsWith("/game/") || pathname.startsWith("/live/");

  useEffect(() => {
    if (skip) {
      setRedirecting(false);
      return;
    }

    const check = async () => {
      try {
        const res = await fetch("/api/game/active");
        if (!res.ok) return;
        const data = await res.json();

        if (
          data.active &&
          data.gameId &&
          lastRedirectedGameId.current !== data.gameId
        ) {
          lastRedirectedGameId.current = data.gameId;
          setGameType(data.gameType || "free");
          setRedirecting(true);
          router.push(`/game/${data.gameId}`);
        }
      } catch {}
    };

    // Initial check after 1.5s (lets the page settle), then poll every 5s
    const initialTimer = setTimeout(check, 1500);
    intervalRef.current = setInterval(check, 5000);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pathname, skip, router]);

  // Reset the redirected game ID when we leave a game page (so we can redirect again)
  useEffect(() => {
    if (skip) {
      lastRedirectedGameId.current = null;
    }
  }, [skip]);

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
