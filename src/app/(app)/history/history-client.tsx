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

export default function HistoryClient({ profile, games, opponentMap, currentUserId }: HistoryClientProps) {
  const [filter, setFilter] = useState<FilterType>("all");

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
      return g.status !== "playing";
    });
  }, [games, filter, currentUserId]);

  const stats = useMemo(() => {
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
    if (tc === "battle") return `Battle ${g.initial_minutes}${inc}`;
    return `${tc ? tc[0].toUpperCase() + tc.slice(1) : ""} ${g.initial_minutes}${inc}`;
  };

  const getResultInfo = (g: GameRecord) => {
    const isWhite = g.white_player_id === currentUserId;
    const won = g.winner === (isWhite ? "white" : "black");
    const drew = g.status === "draw" || g.winner === "draw";

    if (g.status === "playing") return { label: "Live", color: "text-ccb-accent" };
    if (g.status === "abort") return { label: "Aborted", color: "text-ccb-muted" };
    if (won) return { label: "Win", color: "text-ccb-success" };
    if (drew) return { label: "Draw", color: "text-ccb-silver" };

    const reason = g.status === "timeout" ? "Timeout" :
                   g.status === "resign" ? "Resigned" :
                   g.status === "checkmate" ? "Checkmate" :
                   g.status === "stalemate" ? "Stalemate" : "Loss";
    return { label: reason, color: "text-ccb-danger" };
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
        <p className="text-sm text-ccb-muted mt-1">{profile?.games_played || 0} games played</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <div className="card text-center py-2.5">
          <div className="text-xl font-bold">{stats.total}</div>
          <div className="text-[11px] text-ccb-muted">Total</div>
        </div>
        <div className="card text-center py-2.5">
          <div className="text-xl font-bold text-ccb-success">{stats.wins}</div>
          <div className="text-[11px] text-ccb-muted">Wins</div>
        </div>
        <div className="card text-center py-2.5">
          <div className="text-xl font-bold text-ccb-danger">{stats.losses}</div>
          <div className="text-[11px] text-ccb-muted">Losses</div>
        </div>
        <div className="card text-center py-2.5">
          <div className="text-xl font-bold text-ccb-silver">{stats.draws}</div>
          <div className="text-[11px] text-ccb-muted">Draws</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
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
        <div className="text-center py-16 text-ccb-muted">
          <Clock className="w-9 h-9 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No games found</p>
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
            const oppName = opp?.display_name || opp?.username || "Unknown";
            const hasChange = myRatingChange !== null && myRatingChange !== undefined && g.status !== "playing" && myRatingChange !== 0;

            return (
              <Link
                key={g.id}
                href={botGame ? "#" : `/game/${g.id}`}
                className="card flex items-center gap-3 px-3 py-2.5 hover:bg-ccb-surface active:scale-[0.99] transition-all"
              >
                {/* Avatar */}
                <div className="shrink-0">
                  {opp?.avatar_url ? (
                    <img src={opp.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : botGame ? (
                    <div className="w-10 h-10 rounded-full bg-ccb-primary/20 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-ccb-primary" />
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradientForName(oppName)} flex items-center justify-center`}>
                      <span className="text-sm font-bold text-white">{oppName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                </div>

                {/* Two rows: name+result on top, meta on bottom */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{oppName}</span>
                    <span className={`text-xs font-bold ${result.color}`}>{result.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ccb-muted mt-0.5">
                    <span>{isWhite ? "⚪" : "⚫"}</span>
                    <span>{formatTimeControl(g)}</span>
                    {g.tournament_id && <Trophy className="w-3 h-3 text-ccb-gold" />}
                    {hasChange && (
                      <span className={myRatingChange! >= 0 ? "text-ccb-success" : "text-ccb-danger"}>
                        {myRatingChange! >= 0 ? "+" : ""}{myRatingChange}
                      </span>
                    )}
                    <span className="ml-auto">{new Date(g.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
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
