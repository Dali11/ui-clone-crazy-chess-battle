"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Clock, Trophy, Bot, Search } from "lucide-react";

interface GameRecord {
  id: string;
  status: string;
  winner: string | null;
  time_control: string;
  initial_minutes: number;
  increment_seconds: number;
  rated: boolean;
  white_player_id: string;
  black_player_id: string;
  white_rating: number | null;
  black_rating: number | null;
  white_rating_change: number | null;
  black_rating_change: number | null;
  move_count: number;
  created_at: string;
  ended_at: string | null;
  tournament_id: string | null;
}

interface Opponent {
  id: string;
  username: string;
  display_name: string;
  rating: number;
}

interface HistoryClientProps {
  profile: any;
  games: GameRecord[];
  opponentMap: Record<string, Opponent>;
  currentUserId: string;
}

type FilterType = "all" | "wins" | "losses" | "draws" | "tournaments" | "bot" | "review";

export default function HistoryClient({ profile, games, opponentMap, currentUserId }: HistoryClientProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  // Bot user ID
  const BOT_USER_ID = "3699502b-57bf-498a-bc2d-11385fd9d317";

  const isBotGame = (g: GameRecord) => g.white_player_id === BOT_USER_ID || g.black_player_id === BOT_USER_ID;

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      const isWhite = g.white_player_id === currentUserId;
      const won = g.winner === (isWhite ? "white" : "black");
      const drew = g.status === "draw" || g.winner === "draw";
      const aborted = g.status === "abort";

      if (filter === "wins") return won;
      if (filter === "losses") return !won && !drew && !aborted && g.status !== "playing";
      if (filter === "draws") return drew;
      if (filter === "tournaments") return !!g.tournament_id;
      if (filter === "bot") return isBotGame(g) && g.status !== "playing";
      if (filter === "review") return !won && !drew && !aborted && g.status !== "playing";
      return g.status !== "playing"; // "all" — exclude active games
    });
  }, [games, filter, currentUserId]);

  const stats = useMemo(() => {
    // Aborted games (opponent never showed up) don't count as anything —
    // no win, no loss, no draw — same as they never happened.
    const completed = games.filter((g) => g.status !== "playing" && g.status !== "abort");
    const wins = completed.filter((g) => {
      const isWhite = g.white_player_id === currentUserId;
      return g.winner === (isWhite ? "white" : "black");
    }).length;
    const draws = completed.filter((g) => g.status === "draw" || g.winner === "draw").length;
    const losses = completed.length - wins - draws;
    return { total: completed.length, wins, losses, draws };
  }, [games, currentUserId]);

  const formatTimeControl = (g: GameRecord) => {
    const tc = g.time_control;
    const inc = g.increment_seconds > 0 ? `+${g.increment_seconds}` : "";
    if (tc === "bullet") return `Bullet ${g.initial_minutes}${inc}`;
    if (tc === "blitz") return `Blitz ${g.initial_minutes}${inc}`;
    if (tc === "rapid") return `Rapid ${g.initial_minutes}${inc}`;
    if (tc === "classical") return `Classical ${g.initial_minutes}${inc}`;
    if (tc === "battle") return `Battle ${g.initial_minutes}${inc}`;
    if (tc === "armageddon") return `Armageddon ${g.initial_minutes}`;
    return `${g.initial_minutes}${inc}`;
  };

  const getResultInfo = (g: GameRecord) => {
    const isWhite = g.white_player_id === currentUserId;
    const won = g.winner === (isWhite ? "white" : "black");
    const drew = g.status === "draw" || g.winner === "draw";

    if (g.status === "playing") return { label: "Live", color: "text-ccb-accent", bg: "bg-ccb-accent/10" };
    if (g.status === "abort") return { label: "Aborted", color: "text-ccb-muted", bg: "bg-ccb-muted/10" };
    if (won) return { label: "Win", color: "text-ccb-success", bg: "bg-ccb-success/10" };
    if (drew) return { label: "Draw", color: "text-ccb-muted", bg: "bg-ccb-muted/10" };

    const reason = g.status === "timeout" ? "⏱ Timeout" :
                   g.status === "resign" ? "🏳 Resigned" :
                   g.status === "checkmate" ? "♚ Checkmate" :
                   g.status === "stalemate" ? "Stalemate" :
                   g.status === "draw" ? "Draw" : "Loss";
    return { label: reason, color: "text-ccb-danger", bg: "bg-ccb-danger/10" };
  };

  const filters: { id: FilterType; label: string; count: number }[] = [
    { id: "all", label: "All", count: stats.total },
    { id: "wins", label: "Wins", count: stats.wins },
    { id: "losses", label: "Losses", count: stats.losses },
    { id: "review", label: "🔍 Review", count: stats.losses },
    { id: "draws", label: "Draws", count: stats.draws },
    { id: "bot", label: "vs Bot", count: games.filter((g) => isBotGame(g) && g.status !== "playing").length },
    { id: "tournaments", label: "Tournaments", count: games.filter((g) => g.tournament_id).length },
  ];

  return (
    <div className="space-y-6 pb-20 sm:pb-0">
      <div>
        <h1 className="text-xl sm:text-lg sm:text-2xl font-bold">Game History</h1>
        <p className="text-sm text-ccb-muted mt-1">{profile?.games_played || 0} games played · tap any game to review moves</p>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card text-center py-2 sm:py-3">
          <div className="text-lg sm:text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-ccb-muted">Total</div>
        </div>
        <div className="card text-center py-2 sm:py-3">
          <div className="text-lg sm:text-2xl font-bold text-ccb-success">{stats.wins}</div>
          <div className="text-xs text-ccb-muted">Wins</div>
        </div>
        <div className="card text-center py-2 sm:py-3">
          <div className="text-lg sm:text-2xl font-bold text-ccb-danger">{stats.losses}</div>
          <div className="text-xs text-ccb-muted">Losses</div>
        </div>
        <div className="card text-center py-2 sm:py-3">
          <div className="text-lg sm:text-2xl font-bold text-ccb-muted">{stats.draws}</div>
          <div className="text-xs text-ccb-muted">Draws</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
              filter === f.id
                ? "bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30"
                : "text-ccb-muted hover:text-ccb-text border border-transparent"
            }`}
          >
            {f.label} <span className="text-xs opacity-60">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Review hint */}
      {filter === "review" && (
        <div className="card p-3 sm:p-4 border-ccb-primary/20 bg-ccb-primary/5">
          <div className="flex items-start gap-2.5">
            <Search className="w-4 h-4 text-ccb-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Review your losses</p>
              <p className="text-xs text-ccb-muted mt-0.5">
                Tap any game to replay every move on the board. Look for where it turned — was it a blunder under time pressure, or did you miss a tactic?
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Game list */}
      {filteredGames.length === 0 ? (
        <div className="text-center py-12 text-ccb-muted text-sm">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No games found
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGames.map((g) => {
            const isWhite = g.white_player_id === currentUserId;
            const oppId = isWhite ? g.black_player_id : g.white_player_id;
            const opp = opponentMap[oppId];
            const result = getResultInfo(g);
            const myRatingChange = isWhite ? g.white_rating_change : g.black_rating_change;
            const botGame = isBotGame(g);

            return (
              <Link
                key={g.id}
                href={botGame ? "#" : `/game/${g.id}`}
                className="card flex items-center justify-between hover:border-ccb-primary/30 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Result badge */}
                  <div className={`px-2 py-1 rounded text-xs font-bold ${result.bg} ${result.color} shrink-0`}>
                    {result.label}
                  </div>

                  {/* Opponent info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {botGame && <Bot className="w-3.5 h-3.5 text-ccb-primary shrink-0" />}
                      {opp?.display_name || opp?.username || "Unknown"}
                      <span className="text-xs text-ccb-muted ml-0.5">({opp?.rating || "?"})</span>
                    </div>
                    <div className="text-xs text-ccb-muted flex items-center gap-2">
                      <span>{isWhite ? "⚪ White" : "⚫ Black"}</span>
                      <span>·</span>
                      <span>{formatTimeControl(g)}</span>
                      {g.rated && <><span>·</span><span className="text-ccb-accent">Rated</span></>}
                      {botGame && <><span>·</span><span className="text-ccb-muted">Unrated</span></>}
                      {g.tournament_id && <><span>·</span><Trophy className="w-3 h-3 text-ccb-accent" /></>}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-3">
                  {myRatingChange !== null && myRatingChange !== undefined && g.status !== "playing" && myRatingChange !== 0 && (
                    <div className={`text-sm font-medium ${myRatingChange >= 0 ? "text-ccb-success" : "text-ccb-danger"}`}>
                      {myRatingChange >= 0 ? "+" : ""}{myRatingChange}
                    </div>
                  )}
                  <div className="text-xs text-ccb-muted">
                    {new Date(g.created_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
