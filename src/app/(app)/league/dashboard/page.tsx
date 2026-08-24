'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  Trophy,
  Swords,
  TrendingUp,
  Calendar,
  Bell,
  Medal,
  ChevronRight,
  Flame,
  Target,
  BarChart2,
  RefreshCw,
  AlertCircle,
  Flag,
  User,
  ChevronLeft,
} from 'lucide-react';

interface PlayerProfile {
  id: string;
  username?: string;
  display_name: string;
  avatar_url?: string;
  country?: string;
  rating: number;
}

interface Standing {
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  form?: (string | { result: string })[] | string;
}

interface Streak {
  type: string;
  count: number;
}

interface DistanceFromLeader {
  points: number;
  leaderPoints?: number;
  leaderName: string;
}

interface NextMatch {
  matchday: number;
  fixtureId?: string;
  isHome: boolean;
  opponent: {
    id?: string;
    display_name: string;
    rating: number;
    country?: string;
    avatar_url?: string;
  } | null;
}

interface RecentResult {
  matchday: number;
  fixtureId?: string;
  opponent?: {
    display_name: string;
  };
  result: string;
}

interface LeagueDashboardData {
  player: PlayerProfile;
  standing: Standing;
  streak: Streak;
  distanceFromLeader: DistanceFromLeader;
  nextMatch: NextMatch | null;
  recentResults: RecentResult[];
  remainingFixtures: number;
  totalPlayers: number;
  league?: {
    id?: string;
    name?: string;
    season?: number;
    currentMatchday?: number;
    totalMatchdays?: number;
  };
}

export default function LeagueDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<LeagueDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (!userId) {
        setError('Please sign in to view your league dashboard.');
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/league/player/${userId}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to load dashboard (HTTP ${res.status})`);
      }

      const json = await res.json();
      if (!json.success && json.error) {
        throw new Error(json.error);
      }

      setData(json);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading your league data.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Streak Helper
  const formatStreakText = (streak?: Streak) => {
    if (!streak || !streak.type || streak.type === 'none' || streak.count === 0) {
      return 'No active streak';
    }
    const typeStr = streak.type.toLowerCase();
    let noun = 'wins';
    if (typeStr === 'loss' || typeStr === 'losses') {
      noun = streak.count === 1 ? 'loss' : 'losses';
    } else if (typeStr === 'draw' || typeStr === 'draws') {
      noun = streak.count === 1 ? 'draw' : 'draws';
    } else {
      noun = streak.count === 1 ? 'win' : 'wins';
    }
    return `${streak.count} ${noun} in a row`;
  };

  // Helper to normalize result values
  const normalizeResult = (resStr: string): 'win' | 'draw' | 'loss' => {
    const val = (resStr || '').toLowerCase();
    if (val === 'win' || val === 'w' || val === 'home_win' || val === 'away_win') return 'win';
    if (val === 'loss' || val === 'l') return 'loss';
    return 'draw';
  };

  // Normalize form items
  const parseFormArray = (formInput?: (string | { result: string })[] | string): ('W' | 'D' | 'L')[] => {
    if (!formInput) return [];
    if (typeof formInput === 'string') {
      return formInput
        .toUpperCase()
        .split('')
        .filter((c) => c === 'W' || c === 'D' || c === 'L') as ('W' | 'D' | 'L')[];
    }
    if (Array.isArray(formInput)) {
      return formInput.map((item) => {
        const str = typeof item === 'object' ? item.result : item;
        const norm = normalizeResult(str);
        if (norm === 'win') return 'W';
        if (norm === 'loss') return 'L';
        return 'D';
      });
    }
    return [];
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-20 sm:pb-8 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-ccb-border/50 rounded-lg"></div>
          <div className="h-10 w-28 bg-ccb-border/50 rounded-lg"></div>
        </div>

        {/* Big Position Banner Skeleton */}
        <div className="card h-48 bg-ccb-card/50 border-ccb-border rounded-xl flex flex-col justify-center items-center gap-3">
          <div className="h-4 w-32 bg-ccb-border/50 rounded"></div>
          <div className="h-16 w-64 bg-ccb-border/60 rounded-lg"></div>
          <div className="h-4 w-48 bg-ccb-border/40 rounded"></div>
        </div>

        {/* Grid Stats Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card h-28 bg-ccb-card/50 border-ccb-border rounded-xl"></div>
          ))}
        </div>

        {/* Next Match & Results Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card h-64 bg-ccb-card/50 border-ccb-border rounded-xl"></div>
          <div className="card h-64 bg-ccb-card/50 border-ccb-border rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6 pb-20 sm:pb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">League Dashboard</h1>
            <p className="text-sm text-ccb-muted mt-0.5">Player status and match statistics</p>
          </div>
          <Link
            href="/league/notifications"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-ccb-text bg-ccb-surface hover:bg-ccb-border border border-ccb-border rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4 text-ccb-accent" />
            <span>Notifications</span>
          </Link>
        </div>

        <div className="card text-center py-12 px-4 border border-ccb-border rounded-xl bg-ccb-card">
          <div className="flex justify-center mb-3">
            <AlertCircle className="w-12 h-12 text-ccb-accent/80" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">
            {error ? 'Unable to load League Dashboard' : 'No League Data Found'}
          </h2>
          <p className="text-sm text-ccb-muted max-w-md mx-auto mb-6">
            {error || 'You might not be currently assigned to an active league session.'}
          </p>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-ccb-primary hover:bg-ccb-primaryHover rounded-lg transition-colors shadow-lg shadow-ccb-primary/20"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
        </div>
      </div>
    );
  }

  const {
    player,
    standing,
    streak,
    distanceFromLeader,
    nextMatch,
    recentResults,
    remainingFixtures,
    totalPlayers,
    league,
  } = data;

  const formList = parseFormArray(standing?.form);

  const getRankBadge = (pos: number) => {
    if (pos === 1) return { label: '1ST PLACE', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' };
    if (pos === 2) return { label: '2ND PLACE', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
    if (pos === 3) return { label: '3RD PLACE', color: 'text-ccb-accent bg-ccb-accent/10 border-ccb-accent/30' };
    return { label: `TOP ${pos}`, color: 'text-ccb-primary bg-ccb-primary/10 border-ccb-primary/30' };
  };

  const rankBadge = getRankBadge(standing.position);

  return (
    <div className="space-y-6 pb-20 sm:pb-8 text-ccb-text">
      <div>
        <Link href="/league" className="inline-flex items-center gap-1.5 text-sm text-ccb-muted hover:text-ccb-accent transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to League Home
        </Link>
      </div>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-white tracking-tight">League Dashboard</h1>
            {league?.name && (
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-ccb-primary/20 text-ccb-primary border border-ccb-primary/30">
                {league.name}
              </span>
            )}
          </div>
          <p className="text-sm text-ccb-muted mt-1 flex items-center gap-2">
            <span>Welcome back, <strong className="text-ccb-text">{player.display_name}</strong></span>
            {player.rating && <span className="text-xs px-2 py-0.5 rounded bg-ccb-surface border border-ccb-border text-ccb-accent font-mono font-bold">⚡ {player.rating} ELO</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/league/notifications"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-ccb-text bg-ccb-card hover:bg-ccb-surface border border-ccb-border rounded-xl transition-colors shadow-sm"
          >
            <Bell className="w-4 h-4 text-ccb-accent" />
            <span>Notifications</span>
          </Link>
          <Link
            href="/leaderboard"
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-ccb-text bg-ccb-card hover:bg-ccb-surface border border-ccb-border rounded-xl transition-colors shadow-sm"
          >
            <Trophy className="w-4 h-4 text-ccb-gold" />
            <span>Leaderboard</span>
          </Link>
        </div>
      </div>

      {/* Hero Position Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-950/60 via-ccb-card to-ccb-dark border border-violet-500/30 p-6 sm:p-8 shadow-xl shadow-violet-950/20">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 text-center md:text-left">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border tracking-wider uppercase mb-1 ${rankBadge.color}`}>
              <Medal className="w-3.5 h-3.5" />
              <span>{rankBadge.label}</span>
            </div>
            <div className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight uppercase drop-shadow-md">
              YOU ARE <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-ccb-primary to-ccb-gold">#{standing.position}</span>
            </div>
            <p className="text-sm sm:text-base text-ccb-muted font-medium">
              Ranked #{standing.position} of <strong className="text-white font-bold">{totalPlayers}</strong> players in current standings
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col items-center md:items-end justify-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-ccb-border/40">
            <div className="text-center md:text-right">
              <span className="text-xs text-ccb-muted block uppercase tracking-wider font-semibold">Total Points</span>
              <span className="text-3xl font-extrabold text-ccb-accent font-mono">{standing.points} <span className="text-xs text-ccb-muted font-sans">PTS</span></span>
            </div>
            <div className="text-center md:text-right">
              <span className="text-xs text-ccb-muted block uppercase tracking-wider font-semibold">Match Record</span>
              <span className="text-lg font-bold text-ccb-text font-mono">
                <span className="text-ccb-success">{standing.wins}W</span> - <span className="text-ccb-accent">{standing.draws}D</span> - <span className="text-ccb-danger">{standing.losses}L</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: 4 Key Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Points Card */}
        <div className="card p-4 bg-ccb-card border border-ccb-border rounded-xl flex flex-col justify-between hover:border-violet-500/40 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-xs text-ccb-muted font-semibold uppercase tracking-wider">Points</span>
            <div className="p-2 rounded-lg bg-ccb-accent/10 text-ccb-accent">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white font-mono">{standing.points}</div>
            <div className="text-xs text-ccb-muted mt-1">{standing.played} matches played</div>
          </div>
        </div>

        {/* Record Card */}
        <div className="card p-4 bg-ccb-card border border-ccb-border rounded-xl flex flex-col justify-between hover:border-violet-500/40 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-xs text-ccb-muted font-semibold uppercase tracking-wider">W-D-L Record</span>
            <div className="p-2 rounded-lg bg-ccb-success/10 text-ccb-success">
              <BarChart2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-white font-mono">
              <span className="text-ccb-success">{standing.wins}</span>-
              <span className="text-ccb-accent">{standing.draws}</span>-
              <span className="text-ccb-danger">{standing.losses}</span>
            </div>
            <div className="text-xs text-ccb-muted mt-1">
              {standing.played > 0
                ? `${Math.round(((standing.wins + standing.draws * 0.5) / standing.played) * 100)}% win rate`
                : 'No games yet'}
            </div>
          </div>
        </div>

        {/* Streak Card */}
        <div className="card p-4 bg-ccb-card border border-ccb-border rounded-xl flex flex-col justify-between hover:border-violet-500/40 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-xs text-ccb-muted font-semibold uppercase tracking-wider">Current Streak</span>
            <div className={`p-2 rounded-lg ${streak.type === 'win' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'}`}>
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-white capitalize leading-tight">
              {formatStreakText(streak)}
            </div>
            <div className="text-xs text-ccb-muted mt-1">Active run</div>
          </div>
        </div>

        {/* Distance From Leader Card */}
        <div className="card p-4 bg-ccb-card border border-ccb-border rounded-xl flex flex-col justify-between hover:border-violet-500/40 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-xs text-ccb-muted font-semibold uppercase tracking-wider">Leader Gap</span>
            <div className="p-2 rounded-lg bg-ccb-primary/10 text-ccb-primary">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold text-white">
              {distanceFromLeader.points === 0 || standing.position === 1 ? (
                <span className="text-ccb-success">Leader (1st)</span>
              ) : (
                <span>{distanceFromLeader.points} pts behind</span>
              )}
            </div>
            <div className="text-xs text-ccb-muted mt-1 truncate">
              {distanceFromLeader.points === 0 || standing.position === 1
                ? 'Setting the pace'
                : `1st: ${distanceFromLeader.leaderName}`}
            </div>
          </div>
        </div>
      </div>

      {/* Main Section: Next Match & Form / Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Next Match Card */}
        <div className="card p-5 bg-ccb-card border border-ccb-border rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-ccb-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-ccb-accent" />
              <h2 className="text-base font-bold text-white">Next Match</h2>
            </div>
            {nextMatch && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-ccb-surface text-ccb-muted border border-ccb-border">
                Matchday {nextMatch.matchday}
              </span>
            )}
          </div>

          {nextMatch ? (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between p-4 bg-ccb-surface rounded-xl border border-ccb-border/80">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-ccb-text font-bold text-lg overflow-hidden">
                    {nextMatch.opponent?.avatar_url ? (
                      <img
                        src={nextMatch.opponent.avatar_url}
                        alt={nextMatch.opponent.display_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-6 h-6 text-ccb-muted" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-ccb-muted font-medium uppercase tracking-wider">Opponent</div>
                    <div className="text-base font-bold text-white">
                      {nextMatch.opponent?.display_name || 'Upcoming Opponent'}
                    </div>
                    {nextMatch.opponent?.rating && (
                      <div className="text-xs text-ccb-accent font-mono font-semibold">
                        ⚡ {nextMatch.opponent.rating} ELO
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-block text-xs font-bold px-3 py-1 rounded-full border ${
                      nextMatch.isHome
                        ? 'bg-ccb-success/10 text-ccb-success border-ccb-success/30'
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                    }`}
                  >
                    {nextMatch.isHome ? '🏠 HOME' : '✈️ AWAY'}
                  </span>
                </div>
              </div>

              {nextMatch.fixtureId ? (
                <Link
                  href={`/league/match/${nextMatch.fixtureId}`}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-ccb-primary hover:bg-ccb-primaryHover text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-ccb-primary/25"
                >
                  <Swords className="w-4 h-4" />
                  <span>Prepare for Match</span>
                </Link>
              ) : (
                <div className="text-xs text-center text-ccb-muted py-2 bg-ccb-surface/50 rounded-lg">
                  Fixture details scheduled soon
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm font-medium text-ccb-muted">No upcoming fixtures scheduled</p>
              <p className="text-xs text-ccb-muted">You have completed all matches for this matchday!</p>
            </div>
          )}

          {/* Fixture Progress Sub-card */}
          <div className="pt-2 border-t border-ccb-border/60 flex items-center justify-between text-xs text-ccb-muted">
            <span className="flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-ccb-primary" />
              Remaining Fixtures:
            </span>
            <span className="font-bold text-ccb-text font-mono">{remainingFixtures} matches</span>
          </div>
        </div>

        {/* Form Guide & Recent Results Card */}
        <div className="card p-5 bg-ccb-card border border-ccb-border rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-ccb-border/60 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-ccb-success" />
              <h2 className="text-base font-bold text-white">Form & Recent Results</h2>
            </div>
            {/* Form Pills */}
            <div className="flex items-center gap-1">
              {formList.length > 0 ? (
                formList.map((f, i) => (
                  <span
                    key={i}
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black font-mono ${
                      f === 'W'
                        ? 'bg-ccb-success/20 text-ccb-success border border-ccb-success/40'
                        : f === 'L'
                        ? 'bg-ccb-danger/20 text-ccb-danger border border-ccb-danger/40'
                        : 'bg-ccb-accent/20 text-ccb-accent border border-ccb-accent/40'
                    }`}
                  >
                    {f}
                  </span>
                ))
              ) : (
                <span className="text-xs text-ccb-muted">No form</span>
              )}
            </div>
          </div>

          {/* Recent Results List */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-ccb-muted uppercase tracking-wider block mb-2">
              Last 5 Matches
            </span>

            {recentResults && recentResults.length > 0 ? (
              <div className="divide-y divide-ccb-border/40 bg-ccb-surface rounded-xl border border-ccb-border/80 overflow-hidden">
                {recentResults.map((r, idx) => {
                  const norm = normalizeResult(r.result);
                  return (
                    <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-ccb-card/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-ccb-muted w-10">MD {r.matchday}</span>
                        <span className="font-semibold text-white truncate max-w-[140px] sm:max-w-[200px]">
                          vs {r.opponent?.display_name || 'Opponent'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-black font-mono text-[11px] tracking-wide uppercase border ${
                            norm === 'win'
                              ? 'bg-ccb-success/10 text-ccb-success border-ccb-success/30'
                              : norm === 'loss'
                              ? 'bg-ccb-danger/10 text-ccb-danger border-ccb-danger/30'
                              : 'bg-ccb-accent/10 text-ccb-accent border-ccb-accent/30'
                          }`}
                        >
                          {norm === 'win' ? 'WIN' : norm === 'loss' ? 'LOSS' : 'DRAW'}
                        </span>
                        {r.fixtureId && (
                          <Link
                            href={`/league/match/${r.fixtureId}`}
                            className="p-1 hover:text-white text-ccb-muted transition-colors"
                            title="Match details"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-ccb-muted bg-ccb-surface rounded-xl border border-ccb-border/60">
                No recent completed matches found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
