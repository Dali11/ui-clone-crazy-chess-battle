"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Swords, Zap, X, Trophy } from "lucide-react";

interface OpenMatch {
  id: string;
  type: "quick_match" | "battle";
  playerId: string;
  playerName: string;
  playerRating: number;
  avatarUrl: string | null;
  timeControl: string;
  timeControlLabel: string;
  rated?: boolean;
  stake?: number;
  joinedAt?: string;
  createdAt?: string;
}

/**
 * Site-wide banner that shows when other players are searching for a game.
 * - Quick Match / Free Play: anyone can click "Accept" to start a game immediately
 * - Battle Queue: anyone can click "Accept Battle" to join a staked battle
 * - Challenge a Friend links: NOT shown here (private to the targeted friend)
 *
 * Polls /api/open-matches every 8 seconds. When a match is accepted, the
 * banner auto-refreshes and the accepted entry disappears for everyone.
 */
export default function OpenMatchBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [matches, setMatches] = useState<OpenMatch[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Don't show on game pages, challenge pages, or battle-challenge pages
  const skip =
    pathname.startsWith("/game/") ||
    pathname.startsWith("/challenge/") ||
    pathname.startsWith("/battle-challenge/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register");

  const fetchMatches = useCallback(async () => {
    try {
      const res = await fetch("/api/open-matches");
      if (!res.ok) return;
      const data = await res.json();

      const all: OpenMatch[] = [
        ...(data.quickMatches || []).map((m: any) => ({ ...m, type: "quick_match" as const })),
        ...(data.battles || []).map((m: any) => ({ ...m, type: "battle" as const })),
      ];

      // Filter out dismissed entries
      setMatches(all.filter((m) => !dismissed.has(m.id)));
    } catch {}
  }, [dismissed]);

  useEffect(() => {
    if (skip) {
      setMatches([]);
      return;
    }

    fetchMatches();
    intervalRef.current = setInterval(fetchMatches, 8000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pathname, skip, fetchMatches]);

  const handleAccept = async (match: OpenMatch) => {
    setAccepting(match.id);
    setError(null);
    try {
      const res = await fetch("/api/open-matches/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: match.id, type: match.type }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to accept");
        // Refresh to remove stale entries
        fetchMatches();
        setAccepting(null);
        return;
      }

      // Redirect to the game
      if (data.gameId) {
        router.push(`/game/${data.gameId}`);
      } else if (data.battleId) {
        // Battle without a game yet — go to battles page
        router.push("/battles");
      }
    } catch {
      setError("Failed to accept match");
      setAccepting(null);
    }
  };

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
    setMatches((prev) => prev.filter((m) => m.id !== id));
  };

  if (skip || matches.length === 0) return null;

  // Show max 3 matches to avoid clutter
  const visible = matches.slice(0, 3);

  return (
    <>
      {/* Error toast */}
      {error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-lg bg-ccb-danger text-white text-sm font-medium shadow-lg animate-slide-down">
          {error}
          <button onClick={() => setError(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5 inline" />
          </button>
        </div>
      )}

      {/* Banner container */}
      <div className="fixed bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 z-[55] w-[92vw] max-w-md space-y-2">
        {visible.map((match) => (
          <div
            key={match.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-ccb-card border border-ccb-primary/30 shadow-lg shadow-ccb-primary/10 backdrop-blur-sm animate-slide-up"
          >
            {/* Avatar / Icon */}
            {match.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={match.avatarUrl}
                alt={match.playerName}
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-ccb-primary/15 flex items-center justify-center shrink-0">
                {match.type === "battle" ? (
                  <Trophy className="w-5 h-5 text-ccb-primary" />
                ) : (
                  <Zap className="w-5 h-5 text-ccb-primary" />
                )}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm text-foreground truncate">{match.playerName}</span>
                <span className="text-xs text-ccb-muted shrink-0">({match.playerRating})</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-ccb-muted">
                {match.type === "battle" ? (
                  <>
                    <Trophy className="w-3 h-3 text-ccb-accent" />
                    <span className="font-medium text-ccb-accent">MK {match.stake?.toLocaleString()}</span>
                    <span>·</span>
                    <span>{match.timeControlLabel}</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3" />
                    <span>{match.timeControlLabel}</span>
                    {match.rated && <><span>·</span><span>Ranked</span></>}
                  </>
                )}
              </div>
            </div>

            {/* Accept button */}
            <button
              onClick={() => handleAccept(match)}
              disabled={accepting === match.id}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ccb-primary text-white text-sm font-semibold hover:bg-ccb-primary/90 transition-colors disabled:opacity-50 shrink-0"
            >
              {accepting === match.id ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Swords className="w-4 h-4" />
              )}
              {accepting === match.id ? "..." : "Accept"}
            </button>

            {/* Dismiss */}
            <button
              onClick={() => handleDismiss(match.id)}
              className="p-1 rounded-lg text-ccb-muted hover:text-foreground hover:bg-ccb-surface transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        {/* "More" indicator */}
        {matches.length > 3 && (
          <div className="text-center text-xs text-ccb-muted">
            +{matches.length - 3} more players waiting
          </div>
        )}
      </div>
    </>
  );
}
