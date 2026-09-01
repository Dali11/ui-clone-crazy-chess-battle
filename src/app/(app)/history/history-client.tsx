"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Clock, Trophy, Bot, Search, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";

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
  avatar_url?: string | null;
}

interface HistoryClientProps {
  profile: any;
  games: GameRecord[];
  opponentMap: Record<string, Opponent>;
  currentUserId: string;
}

type FilterType = "all" | "wins" | "losses" | "draws" | "tournaments" | "bot" | "review";

const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-cyan-600",
  "from-pink-500 to-rose-600",
  "from-indigo-500 to-blue-600",
];

function gradientForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[hash];
}

function formatRelativeDate(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);

  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  if (diffDays > 1 && diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

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
    const winRate = completed.length ? Math.round((wins / completed.length) * 100) : 0;
    return { total: completed.length, wins, losses, draws, winRate };
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

    if (g.status === "playing") return { label: "Live", short: "•", color: "text-ccb-accent", bg: "bg-ccb-accent/10", border: "border-l-ccb-accent" };
    if (g.status === "abort") return { label: "Aborted", short: "—", color: "text-ccb-muted", bg: "bg-ccb-muted/10", border: "border-l-ccb-muted" };
    if (won) return { label: "Win", short: "W", color: "text-ccb-success", bg: "bg-ccb-success/10", border: "border-l-ccb-success" };
    if (drew) return { label: "Draw", short: "D", color: "text-ccb-silver", bg: "bg-ccb-silver/10", border: "border-l-ccb-silver" };

    const reason = g.status === "timeout" ? "Timeout" :
                   g.status === "resign" ? "Resigned" :
                   g.status === "checkmate" ? "Checkmate" :
                   g.status === "stalemate" ? "Stalemate" :
                   g.status === "draw" ? "Draw" : "Loss";
    return { label: reason, short: "L", color: "text-ccb-danger", bg: "bg-ccb-danger/10", border: "border-l-ccb-danger" };
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
    <div className="space-y-5 pb-20 sm:pb-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Game History</h1>
        <p className="text-sm text-ccb-muted mt-1">{profile?.games_played || 0} games played · tap any game to review moves</p>
      </div>

      {/* Stats summary — now with win rate bar */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold">{stats.total}</div>
            <div className="text-[11px] text-ccb-muted">Total</div>
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-ccb-success">{stats.wins}</div>
            <div className="text-[11px] text-ccb-muted">Wins</div>
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-ccb-danger">{stats.losses}</div>
            <div className="text-[11px] text-ccb-muted">Losses</div>
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-ccb-silver">{stats.draws}</div>
            <div className="text-[11px] text-ccb-muted">Draws</div>
          </div>
        </div>
        {/* Win rate bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-ccb-muted">Win rate</span>
            <span className="text-[11px] font-semibold text-ccb-text">{stats.winRate}%</span>
          </div>
          <div className="h-2 rounded-full bg-ccb-surface overflow-hidden flex">
            {stats.total > 0 && (
              <>
                <div className="bg-ccb-success h-full" style={{ width: `${(stats.wins / stats.total) * 100}%` }} />
                <div className="bg-ccb-silver h-full" style={{ width: `${(stats.draws / stats.total) * 100}%` }} />
                <div className="bg-ccb-danger h-full" style={{ width: `${(stats.losses / stats.total) * 100}%` }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
              filter === f.id
                ? "bg-ccb-primary/15 text-ccb-primary border border-ccb-primary/40"
                : "text-ccb-muted hover:text-ccb-text border border-ccb-border"
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
        <div className="text-center py-16 text-ccb-muted text-sm">
          <Clock className="w-9 h-9 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-ccb-text/70">No games found</p>
          <p className="text-xs mt-1">Try a different filter, or go play one!</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredGames.map((g) => {
            const isWhite = g.white_player_id === currentUserId;
            const oppId = isWhite ? g.black_player_id : g.white_player_id;
            const opp = opponentMap[oppId];
            const result = getResultInfo(g);
            const myRatingChange = isWhite ? g.white_rating_change : g.black_rating_change;
            const botGame = isBotGame(g);
            const oppName = opp?.display_name || opp?.username || "Unknown";
            const hasRatingChange = myRatingChange !== null && myRatingChange !== undefined && g.status !== "playing" && myRatingChange !== 0;

            return (
              <Link
                key={g.id}
                href={botGame ? "#" : `/game/${g.id}`}
                className={`relative flex items-center gap-3 rounded-xl bg-ccb-card border border-ccb-border border-l-4 ${result.border} px-3 py-3 hover:bg-ccb-surface active:scale-[0.99] transition-all group`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {opp?.avatar_url ? (
                    <img
                      src={opp.avatar_url}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover ring-2 ring-ccb-border"
                    />
                  ) : botGame ? (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-ccb-primary to-purple-700 flex items-center justify-center ring-2 ring-ccb-border">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                  ) : (
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradientForName(oppName)} flex items-center justify-center ring-2 ring-ccb-border`}>
                      <span className="text-sm font-bold text-white">{oppName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  {/* Piece color indicator */}
                  <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-ccb-card ${isWhite ? "bg-white" : "bg-gray-900"}`} />
                </div>

                {/* Middle — opponent + meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold truncate">{oppName}</span>
                    <span className="text-xs text-ccb-muted">({opp?.rating || "?"})</span>
                    {g.tournament_id && <Trophy className="w-3.5 h-3.5 text-ccb-gold shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${result.bg} ${result.color}`}>
                      {result.label}
                    </span>
                    <span className="text-[11px] text-ccb-muted">{formatTimeControl(g)}</span>
                    {g.rated ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-ccb-accent/10 text-ccb-accent">Rated</span>
                    ) : (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-ccb-muted/10 text-ccb-muted">Unrated</span>
                    )}
                  </div>
                </div>

                {/* Right — rating change + date, stacked so nothing overlaps */}
                <div className="flex flex-col items-end shrink-0 gap-1 ml-1">
                  {hasRatingChange ? (
                    <div className={`flex items-center gap-0.5 text-sm font-bold ${myRatingChange! >= 0 ? "text-ccb-success" : "text-ccb-danger"}`}>
                      {myRatingChange! >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {Math.abs(myRatingChange!)}
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-ccb-muted">—</div>
                  )}
                  <div className="text-[11px] text-ccb-muted whitespace-nowrap">
                    {formatRelativeDate(g.created_at)}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-ccb-muted/40 group-hover:text-ccb-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
