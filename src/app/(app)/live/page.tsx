"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Radio, Eye, Crown, Disc3, Swords, Clock, User, Loader2 } from "lucide-react";

interface LiveGame {
  id: string;
  status: string;
  time_control: string;
  initial_minutes: number;
  increment_seconds: number;
  rated: boolean;
  turn: string;
  move_count: number;
  white_clock_ms: number;
  black_clock_ms: number;
  last_move_at: string;
  fen: string;
  pgn: string;
  white_player: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    rating: number;
  } | null;
  black_player: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    rating: number;
  } | null;
  tournament_id: string | null;
  league_id: string | null;
  league_fixture_id: string | null;
  is_my_game: boolean;
  game_type: "chess" | "draughts";
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export default function LiveMatchesPage() {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "mine" | "chess" | "draughts">("all");

  const fetchLiveGames = useCallback(async () => {
    try {
      const res = await fetch("/api/live/games");
      if (!res.ok) return;
      const data = await res.json();
      setGames(data.games || []);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveGames();
    const interval = setInterval(fetchLiveGames, 5000);
    return () => clearInterval(interval);
  }, [fetchLiveGames]);

  const filtered = games.filter((g) => {
    if (filter === "mine") return g.is_my_game;
    if (filter === "chess") return g.game_type === "chess";
    if (filter === "draughts") return g.game_type === "draughts";
    return true;
  });

  const myGames = games.filter((g) => g.is_my_game);
  const otherGames = filtered.filter((g) => !g.is_my_game);

  return (
    <div className="space-y-4 pb-20 sm:pb-8">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-red-500 animate-pulse" />
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Live Matches</h1>
        </div>
        <p className="text-sm text-ccb-muted mt-1">
          {loading ? "Loading…" : `${games.length} live game${games.length === 1 ? "" : "s"}`} · auto-refresh every 5s
        </p>
      </div>

      {/* Filter tabs */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            { key: "all", label: "All", count: games.length },
            { key: "mine", label: "My Games", count: myGames.length },
            { key: "chess", label: "Chess", count: games.filter((g) => g.game_type === "chess").length },
            { key: "draughts", label: "Draughts", count: games.filter((g) => g.game_type === "draughts").length },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                filter === tab.key
                  ? "bg-ccb-primary text-white"
                  : "bg-ccb-surface text-ccb-muted border border-ccb-border"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] rounded-full px-1.5 ${
                  filter === tab.key ? "bg-white/20" : "bg-ccb-border/30"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center mx-4 sm:mx-6">
          <Radio className="w-10 h-10 text-ccb-muted mx-auto mb-3" />
          <p className="text-sm font-bold text-ccb-text mb-1">
            {filter === "mine" ? "You're not in any live games" : "No live games right now"}
          </p>
          <p className="text-xs text-ccb-muted">
            {filter === "mine"
              ? "Start a game and it'll show up here with a Watch button for spectators."
              : "Games appear here in real-time as players start matches."}
          </p>
          <Link
            href="/play"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-gradient-to-r from-ccb-primary to-ccb-accent text-white text-xs font-bold"
          >
            <Swords className="w-4 h-4" />
            Play Now
          </Link>
        </div>
      )}

      {/* My Games (priority) */}
      {!loading && myGames.length > 0 && filter !== "draughts" && filter !== "chess" && (
        <div className="px-4 sm:px-6 lg:px-8 space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ccb-primary flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" /> Your Active Games
          </h2>
          {myGames.map((game) => (
            <GameCard key={game.id} game={game} priority />
          ))}
        </div>
      )}

      {/* Other Live Games */}
      {!loading && otherGames.length > 0 && (
        <div className="px-4 sm:px-6 lg:px-8 space-y-2">
          {myGames.length > 0 && filter !== "draughts" && filter !== "chess" && (
            <h2 className="text-xs font-bold uppercase tracking-wider text-ccb-muted flex items-center gap-1.5 pt-2">
              <Eye className="w-3.5 h-3.5" /> Watch Live
            </h2>
          )}
          {otherGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({ game, priority = false }: { game: LiveGame; priority?: boolean }) {
  const white = game.white_player;
  const black = game.black_player;
  const whiteName = white?.display_name || white?.username || "White";
  const blackName = black?.display_name || black?.username || "Black";
  const isDraughts = game.game_type === "draughts";
  const watchHref = isDraughts ? `/draughts/game/${game.id}` : `/game/${game.id}`;

  return (
    <div
      className={`bg-ccb-card border rounded-2xl p-3 sm:p-4 transition-all ${
        priority
          ? "border-ccb-primary/40 shadow-lg shadow-ccb-primary/10"
          : "border-ccb-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Players */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* White player */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
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

          {/* VS */}
          <span className="text-[10px] font-bold text-ccb-muted shrink-0">vs</span>

          {/* Black player */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full bg-ccb-dark border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
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

        {/* Watch button */}
        <Link
          href={watchHref}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
            priority
              ? "bg-gradient-to-r from-ccb-primary to-ccb-accent text-white"
              : "bg-ccb-surface border border-ccb-border text-ccb-primary hover:bg-ccb-primary/10"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          {priority ? "Resume" : "Watch"}
        </Link>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-ccb-border">
        <span className="flex items-center gap-1 text-[10px] text-ccb-muted">
          {isDraughts ? <Disc3 className="w-3 h-3" /> : <Swords className="w-3 h-3" />}
          {isDraughts ? "Draughts" : "Chess"}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-ccb-muted">
          <Clock className="w-3 h-3" />
          {game.initial_minutes}+{game.increment_seconds}
        </span>
        <span className="text-[10px] text-ccb-muted">
          Move {game.move_count}
        </span>
        {game.turn === "white" ? (
          <span className="text-[10px] font-bold text-white/80">⚪ White to move</span>
        ) : (
          <span className="text-[10px] font-bold text-gray-400">⚫ Black to move</span>
        )}
        {game.rated && (
          <span className="text-[10px] text-ccb-accent font-bold">Rated</span>
        )}
        {game.league_id && (
          <span className="text-[10px] text-ccb-primary font-bold flex items-center gap-0.5">
            <Crown className="w-2.5 h-2.5" /> League
          </span>
        )}
        {game.tournament_id && (
          <span className="text-[10px] text-ccb-accent font-bold">Tournament</span>
        )}
      </div>
    </div>
  );
}
