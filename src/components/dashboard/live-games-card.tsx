"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Eye, Clock, Swords } from "lucide-react";

interface LivePlayer {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number | null;
}

interface LiveGame {
  id: string;
  status: string;
  time_control: string;
  initial_minutes: number;
  increment_seconds: number;
  rated: boolean;
  move_count: number;
  last_move_at: string;
  tournament_id: string | null;
  league_id: string | null;
  spectator_count: number;
  is_my_game: boolean;
  white_player: LivePlayer | null;
  black_player: LivePlayer | null;
}

function timeAgo(dateStr: string): string {
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

/**
 * "Live now" strip on the dashboard. Same data source and visual design
 * as the Live Matches page (/live): all in-progress games via
 * /api/live/games, own games first (Resume), everyone else (Watch).
 */
export default function LiveGamesCard() {
  const [games, setGames] = useState<LiveGame[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/live/games");
      if (!r.ok) return;
      const data = await r.json();
      setGames(data.games || []);
    } catch {
      // transient network error — keep last list
    }
  }, []);

  useEffect(() => {
    load();
    // EGRESS FIX: pause polling while the tab is backgrounded (same
    // pattern as the Live Matches page).
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    return () => clearInterval(t);
  }, [load]);

  const visible = (games ?? []).slice(0, 4);
  const extra = (games?.length ?? 0) - visible.length;

  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ccb-text">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          Live now
        </h2>
        <Link href="/live" className="text-xs text-ccb-primary hover:underline">
          View all
        </Link>
      </div>

      {games === null && (
        <p className="text-xs text-ccb-muted py-4 text-center">Loading…</p>
      )}

      {games && games.length === 0 && (
        <div className="py-3 text-center">
          <p className="text-xs font-bold text-ccb-text mb-1">No live games right now</p>
          <p className="text-[10px] text-ccb-muted mb-3">
            Games appear here in real-time as players start matches.
          </p>
          <Link
            href="/play"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-ccb-primary to-ccb-accent text-white text-xs font-bold"
          >
            <Swords className="w-3.5 h-3.5" /> Play Now
          </Link>
        </div>
      )}

      {games && visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((game) => {
            const white = game.white_player;
            const black = game.black_player;
            const whiteName = white?.display_name || white?.username || "White";
            const blackName = black?.display_name || black?.username || "Black";
            const href = game.is_my_game ? `/game/${game.id}` : `/game/${game.id}?spectate=1`;
            return (
              <Link
                key={game.id}
                href={href}
                className={`block rounded-2xl p-3 transition-all ${
                  game.is_my_game
                    ? "bg-ccb-surface border border-ccb-primary/40 shadow-lg shadow-ccb-primary/10 hover:border-ccb-primary/60"
                    : "bg-ccb-surface border border-ccb-border hover:border-ccb-primary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Players */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
                        {white?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={white.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-ccb-muted">
                            {whiteName[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-ccb-text truncate">{whiteName}</p>
                        <p className="text-[10px] text-ccb-muted">{white?.rating ?? "—"}</p>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold text-ccb-muted shrink-0">vs</span>

                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-full bg-ccb-dark border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
                        {black?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={black.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-white/70">
                            {blackName[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-ccb-text truncate">{blackName}</p>
                        <p className="text-[10px] text-ccb-muted">{black?.rating ?? "—"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Watch / Resume button */}
                  <span
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 ${
                      game.is_my_game
                        ? "bg-gradient-to-r from-ccb-primary to-ccb-accent text-white"
                        : "bg-ccb-card border border-ccb-border text-ccb-primary"
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {game.is_my_game ? "Resume" : "Watch"}
                  </span>
                </div>

                {/* Meta row — same chips as the Live Matches page */}
                <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-ccb-border/50">
                  <span className="flex items-center gap-1 text-[10px] text-ccb-muted">
                    <Clock className="w-3 h-3" />
                    {game.initial_minutes}+{game.increment_seconds}
                  </span>
                  <span className="text-[10px] text-ccb-muted">Move {game.move_count}</span>
                  {game.spectator_count > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-ccb-muted">
                      <Eye className="w-3 h-3" />
                      {game.spectator_count}
                    </span>
                  )}
                  {game.rated && <span className="text-[10px] font-bold text-ccb-accent">Rated</span>}
                  {game.tournament_id && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ccb-primary/10 text-ccb-primary">
                      Tournament
                    </span>
                  )}
                  {game.league_id && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ccb-accent/10 text-ccb-accent">
                      League
                    </span>
                  )}
                  <span className="text-[10px] text-ccb-muted ml-auto">
                    {timeAgo(game.last_move_at)}
                  </span>
                </div>
              </Link>
            );
          })}
          {extra > 0 && (
            <Link
              href="/live"
              className="block text-center text-[10px] text-ccb-muted hover:text-ccb-primary py-1"
            >
              {extra} more live game{extra === 1 ? "" : "s"} on Live Matches
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
