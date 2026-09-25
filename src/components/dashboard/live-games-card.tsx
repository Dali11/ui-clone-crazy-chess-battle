"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Radio, Swords, Trophy, ChevronRight } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import CountryFlag from "@/components/game/country-flag";

interface LivePlayer {
  name: string;
  rating: number | null;
  avatarUrl: string | null;
  country: string | null;
  verified: boolean;
}

interface LiveGame {
  id: string;
  category: "battle" | "tournament" | "free";
  stake: number | null;
  tournamentName: string | null;
  timeControl: string;
  moveCount: number;
  white: LivePlayer;
  black: LivePlayer;
}

/**
 * "Live now" broadcast strip for the dashboard. Polls /api/games/live
 * every 15s. Broadcast rules: tournament matches and staked battles are
 * always listed; free play appears when a player opts in with the
 * in-game Broadcast toggle. Rows link straight into the spectator view.
 */
export default function LiveGamesCard() {
  const [games, setGames] = useState<LiveGame[] | null>(null);
  const currency = useCurrency();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/games/live");
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled) setGames(data.games ?? []);
      } catch { /* transient network error — keep last list */ }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const categoryBadge = (g: LiveGame) => {
    if (g.category === "battle" && g.stake) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-gold/15 text-ccb-gold shrink-0">
          <Swords className="w-3 h-3" /> {currency.formatRewardMoney(g.stake)}
        </span>
      );
    }
    if (g.category === "tournament") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-primary/15 text-ccb-primary shrink-0 max-w-[120px] truncate">
          <Trophy className="w-3 h-3 shrink-0" /> {g.tournamentName || "Tournament"}
        </span>
      );
    }
    return (
      <span className="text-[10px] text-ccb-muted shrink-0">Free play</span>
    );
  };

  const player = (p: LivePlayer) => (
    <span className="inline-flex items-center gap-1 min-w-0">
      {p.country && <CountryFlag code={p.country} className="w-3 h-3 rounded-[2px]" />}
      <span className="truncate max-w-[110px] text-ccb-text">{p.name}</span>
      {p.verified && (
        <svg className="w-3 h-3 text-ccb-primary shrink-0" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Verified player">
          <path d="M12 2l2.39 2.08 3.12-.37 1 3 2.74 1.53L20 12l1.25 2.76-2.74 1.53-1 3-3.12-.37L12 22l-2.39-2.08-3.12.37-1-3-2.74-1.53L4 12 2.75 9.24l2.74-1.53 1-3 3.12.37L12 2z" opacity=".2"/>
          <path d="M10.6 13.4l-2.2-2.2-1.4 1.4 3.6 3.6 6-6-1.4-1.4-4.6 4.6z"/>
        </svg>
      )}
      {p.rating != null && <span className="text-[10px] text-ccb-muted shrink-0">{p.rating}</span>}
    </span>
  );

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ccb-text">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          Live now
        </h2>
        <span className="text-[10px] text-ccb-muted flex items-center gap-1">
          <Eye className="w-3 h-3" /> Watch any match
        </span>
      </div>

      {games === null && <p className="text-xs text-ccb-muted py-4 text-center">Loading live games…</p>}

      {games && games.length === 0 && (
        <p className="text-xs text-ccb-muted py-4 text-center">
          No live games right now — start one and it&apos;ll show up here.
        </p>
      )}

      {games && games.length > 0 && (
        <div className="space-y-1">
          {games.map((g) => (
            <Link
              key={g.id}
              href={`/game/${g.id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-ccb-surface/60 transition-colors group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                {player(g.white)}
                <span className="text-ccb-muted text-[10px] shrink-0">vs</span>
                {player(g.black)}
              </div>
              {categoryBadge(g)}
              <span className="text-[10px] text-ccb-muted shrink-0 hidden sm:inline">
                {g.moveCount} moves · {g.timeControl}
              </span>
              <ChevronRight className="w-4 h-4 text-ccb-muted group-hover:text-ccb-primary shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <p className="text-[10px] text-ccb-muted/60 mt-3 flex items-center gap-1">
        <Radio className="w-3 h-3" /> Tournament and staked matches broadcast automatically. Free play is opt-in from the game.
      </p>
    </div>
  );
}
