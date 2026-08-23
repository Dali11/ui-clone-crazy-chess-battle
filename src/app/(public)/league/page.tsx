'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Trophy,
  Swords,
  ChevronUp,
  ChevronDown,
  Minus,
  Sparkles,
  Calendar,
  Users,
  RefreshCw,
  Search,
  ShieldAlert,
  Award,
  CheckCircle2
} from 'lucide-react';

export interface PlayerData {
  id?: string;
  username?: string;
  display_name: string;
  rating?: number;
  country?: string;
  avatar_url?: string;
}

export interface StandingEntry {
  id?: string;
  player_id?: string;
  position: number;
  previous_position?: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  form?: string[] | string;
  player?: PlayerData | null;
}

export interface FixtureEntry {
  id?: string;
  matchday?: number;
  home_player_id?: string;
  away_player_id?: string;
  home_player?: PlayerData | null;
  away_player?: PlayerData | null;
  home_score?: number | null;
  away_score?: number | null;
  result?: string | null;
  played?: boolean;
  scheduled_at?: string | null;
}

export interface LeagueInfo {
  id?: string;
  name?: string;
  currentMatchday?: number;
  totalMatchdays?: number;
  status?: string;
  description?: string;
  qualifying_spots?: number;
  scoringConfig?: Record<string, any>;
  scoring_config?: Record<string, any>;
}

export interface SeasonInfo {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export interface HomepageApiResponse {
  success?: boolean;
  league?: LeagueInfo;
  season?: SeasonInfo;
  standings?: StandingEntry[];
  upcomingMatchday?: {
    matchday: number;
    totalMatchdays?: number;
    fixtures: FixtureEntry[];
  };
  latestResults?: {
    matchday: number;
    fixtures: FixtureEntry[];
  };
  topPlayers?: StandingEntry[];
  movements?: Array<{
    player_id?: string;
    position: number;
    previous_position: number;
    movement: 'up' | 'down' | 'same';
    move_amount: number;
  }>;
  error?: string;
}

// Utility for country flag emojis
function getCountryFlag(countryCode?: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const uppercase = countryCode.toUpperCase();
  const codePoints = uppercase
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Helper to format scores cleanly
function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '-';
  if (score === 0.5) return '½';
  return String(score);
}

export default function PremierLeagueHomepage() {
  const [data, setData] = useState<HomepageApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'standings' | 'fixtures' | 'results' | 'top'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/homepage');
      if (!res.ok) {
        throw new Error(`Failed to load league data (Status: ${res.status})`);
      }
      const json: HomepageApiResponse = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading the homepage.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const standingsList = useMemo(() => {
    if (!data?.standings) return [];
    if (!searchQuery.trim()) return data.standings;
    const q = searchQuery.toLowerCase();
    return data.standings.filter((s) => {
      const name = s.player?.display_name || s.player?.username || '';
      return name.toLowerCase().includes(q);
    });
  }, [data?.standings, searchQuery]);

  // Loading Skeleton
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
          <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-6 sm:p-8">
            <div className="h-8 bg-slate-700 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-slate-700/60 rounded w-1/4"></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700/50 rounded-2xl p-6 h-96"></div>
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-6 h-96"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="bg-slate-800/90 border border-rose-500/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">League Data Unavailable</h2>
          <p className="text-slate-400 text-sm">{error}</p>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-all duration-200 shadow-lg shadow-amber-400/20 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      </div>
    );
  }

  const league = data?.league;
  const season = data?.season;
  const currentMatchday = league?.currentMatchday || 1;
  const totalMatchdays = league?.totalMatchdays || 10;
  const qualifyingSpots = league?.qualifying_spots || 4;
  const upcomingFixtures = data?.upcomingMatchday?.fixtures || [];
  const latestResults = data?.latestResults?.fixtures || [];
  const topPlayers = data?.topPlayers || data?.standings?.slice(0, 5) || [];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-amber-400 selection:text-slate-950 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">

        {/* 1. LEAGUE HEADER WITH BRANDING & MATCHDAY INDICATOR */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 border border-slate-700/60 shadow-2xl p-6 sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute right-1/3 -bottom-20 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            
            {/* Title & Branding */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-semibold tracking-wider uppercase">
                <Trophy className="w-3.5 h-3.5" /> Official Premier League
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white uppercase drop-shadow-sm">
                CRAZYCHESS <span className="text-amber-400">PREMIER LEAGUE</span>
              </h1>

              <p className="text-slate-400 text-sm sm:text-base max-w-2xl">
                {season?.name ? `${season.name} • ` : ''}
                {league?.name || 'Top competitive chess action with real-time standings and fixtures.'}
              </p>
            </div>

            {/* Matchday Indicator Card */}
            <div className="bg-slate-800/90 border border-amber-400/30 rounded-2xl p-5 sm:p-6 min-w-[280px] sm:min-w-[320px] shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-400" /> Matchday Status
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                  {league?.status?.toUpperCase() || 'ACTIVE'}
                </span>
              </div>

              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-black text-amber-400">
                  MATCHDAY {currentMatchday}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  of {totalMatchdays} matchdays
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-700/60 h-2.5 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-500 shadow-sm"
                  style={{ width: `${Math.min(100, Math.max(0, (currentMatchday / (totalMatchdays || 1)) * 100))}%` }}
                ></div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-amber-400" /> {data?.standings?.length || 0} Players
                </span>
                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors font-medium cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Sync Data
                </button>
              </div>
            </div>

          </div>
        </header>

        {/* NAVIGATION / TAB SELECTOR FOR MOBILE / QUICK FILTER */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'Overview' },
            { id: 'standings', label: 'Standings' },
            { id: 'fixtures', label: 'Upcoming Fixtures' },
            { id: 'results', label: 'Latest Results' },
            { id: 'top', label: 'Top Performers' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* MAIN GRID LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* LEFT 2 COLUMNS: STANDINGS & TOP PERFORMERS */}
          <div className="lg:col-span-2 space-y-8">

            {/* 2. COMPACT LEAGUE STANDINGS TABLE */}
            {(activeTab === 'all' || activeTab === 'standings') && (
              <section className="bg-slate-800/80 border border-slate-700/60 rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm">
                
                {/* Section Header & Search */}
                <div className="p-5 sm:p-6 border-b border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/40">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        League Standings
                      </h2>
                      <p className="text-xs text-slate-400">
                        Top {qualifyingSpots} players qualify for playoffs
                      </p>
                    </div>
                  </div>

                  {/* Search Box */}
                  <div className="relative min-w-[200px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search player..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                </div>

                {/* Table Container */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
                        <th className="py-3.5 px-4 text-center w-16">Pos</th>
                        <th className="py-3.5 px-4">Player</th>
                        <th className="py-3.5 px-3 text-center">P</th>
                        <th className="py-3.5 px-3 text-center">W</th>
                        <th className="py-3.5 px-3 text-center">D</th>
                        <th className="py-3.5 px-3 text-center">L</th>
                        <th className="py-3.5 px-4 text-center font-black text-amber-400">PTS</th>
                        <th className="py-3.5 px-4 text-center">Form</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40 text-sm">
                      {standingsList.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400 text-sm">
                            No standings found.
                          </td>
                        </tr>
                      ) : (
                        standingsList.map((row) => {
                          const player = row.player;
                          const pos = row.position;
                          const prevPos = row.previous_position ?? pos;

                          // Movement logic
                          let moveIcon = <Minus className="w-3.5 h-3.5 text-slate-500 inline" />;
                          let moveClass = 'text-slate-500';
                          let moveLabel = '';

                          if (prevPos > pos) {
                            const delta = prevPos - pos;
                            moveIcon = <ChevronUp className="w-3.5 h-3.5 text-emerald-400 inline stroke-[3]" />;
                            moveClass = 'text-emerald-400 font-bold';
                            moveLabel = `${delta}`;
                          } else if (prevPos < pos) {
                            const delta = pos - prevPos;
                            moveIcon = <ChevronDown className="w-3.5 h-3.5 text-rose-400 inline stroke-[3]" />;
                            moveClass = 'text-rose-400 font-bold';
                            moveLabel = `${delta}`;
                          }

                          const isQualifying = pos <= qualifyingSpots;

                          // Form array
                          const formArray: string[] = Array.isArray(row.form)
                            ? row.form
                            : typeof row.form === 'string'
                            ? (row.form as string).split('')
                            : [];

                          return (
                            <tr
                              key={row.id || row.player_id || pos}
                              className={`group hover:bg-slate-700/30 transition-colors ${
                                isQualifying ? 'border-l-4 border-l-amber-400 bg-amber-400/[0.02]' : ''
                              }`}
                            >
                              {/* POS & MOVEMENT */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <span className={`font-black text-base ${
                                    pos === 1 ? 'text-amber-400' : pos === 2 ? 'text-slate-300' : pos === 3 ? 'text-amber-600' : 'text-slate-300'
                                  }`}>
                                    {pos}
                                  </span>
                                  <span className={`text-[10px] flex items-center gap-0.5 ${moveClass}`} title={`Previous position: ${prevPos}`}>
                                    {moveIcon}
                                    {moveLabel && <span>{moveLabel}</span>}
                                  </span>
                                </div>
                              </td>

                              {/* PLAYER INFO */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-3">
                                  {player?.avatar_url ? (
                                    <img
                                      src={player.avatar_url}
                                      alt={player.display_name}
                                      className="w-8 h-8 rounded-full object-cover border border-amber-400/40"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-amber-400">
                                      {(player?.display_name || player?.username || 'P').slice(0, 2).toUpperCase()}
                                    </div>
                                  )}

                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-white group-hover:text-amber-400 transition-colors">
                                        {player?.display_name || player?.username || 'Unknown Player'}
                                      </span>
                                      <span className="text-xs" title={player?.country || ''}>
                                        {getCountryFlag(player?.country)}
                                      </span>
                                    </div>
                                    {player?.rating && (
                                      <span className="text-[11px] text-slate-400 font-mono">
                                        ⚡ {player.rating} ELO
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* P, W, D, L */}
                              <td className="py-3.5 px-3 text-center text-slate-300 font-mono">{row.played}</td>
                              <td className="py-3.5 px-3 text-center text-emerald-400 font-mono font-medium">{row.wins}</td>
                              <td className="py-3.5 px-3 text-center text-amber-400 font-mono font-medium">{row.draws}</td>
                              <td className="py-3.5 px-3 text-center text-rose-400 font-mono font-medium">{row.losses}</td>

                              {/* PTS */}
                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-block px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400 font-black text-base font-mono shadow-sm">
                                  {row.points}
                                </span>
                              </td>

                              {/* FORM */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {formArray.length === 0 ? (
                                    <span className="text-slate-600 text-xs">-</span>
                                  ) : (
                                    formArray.slice(-5).map((f, idx) => {
                                      const letter = f.toUpperCase();
                                      let colorClass = 'bg-slate-700/50 text-slate-400 border-slate-600';
                                      if (letter === 'W') colorClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
                                      if (letter === 'D') colorClass = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
                                      if (letter === 'L') colorClass = 'bg-rose-500/20 text-rose-400 border-rose-500/40';

                                      return (
                                        <span
                                          key={idx}
                                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black border ${colorClass}`}
                                        >
                                          {letter}
                                        </span>
                                      );
                                    })
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer Legend */}
                <div className="p-4 bg-slate-900/60 border-t border-slate-700/50 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-amber-400/30 border border-amber-400 inline-block rounded-sm"></span>
                    Positions 1–{qualifyingSpots} Playoff qualification zone
                  </span>
                  <span>Scoring: Win = 3pts, Draw = 1pt</span>
                </div>
              </section>
            )}

            {/* 5. TOP PLAYERS SECTION */}
            {(activeTab === 'all' || activeTab === 'top') && topPlayers.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" /> Top League Performers
                  </h2>
                  <span className="text-xs text-slate-400">Leading standings & rating leaders</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {topPlayers.slice(0, 3).map((item, idx) => {
                    const player = item.player;
                    const rank = idx + 1;
                    const isFirst = rank === 1;

                    return (
                      <div
                        key={item.id || item.player_id || idx}
                        className={`relative rounded-2xl p-5 border transition-all duration-300 hover:-translate-y-1 ${
                          isFirst
                            ? 'bg-gradient-to-b from-slate-800 to-slate-900 border-amber-400/60 shadow-xl shadow-amber-400/10'
                            : rank === 2
                            ? 'bg-slate-800/80 border-slate-600/60'
                            : 'bg-slate-800/80 border-slate-700/60'
                        }`}
                      >
                        {/* Rank Badge */}
                        <div className="absolute top-4 right-4">
                          {isFirst ? (
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-400/30">
                              <Trophy className="w-3.5 h-3.5 fill-slate-950" /> #1 LEAD
                            </div>
                          ) : (
                            <div className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 font-bold text-xs border border-slate-600">
                              #{rank}
                            </div>
                          )}
                        </div>

                        {/* Player Header */}
                        <div className="flex items-center gap-3 mb-4">
                          {player?.avatar_url ? (
                            <img
                              src={player.avatar_url}
                              alt={player.display_name}
                              className={`w-12 h-12 rounded-full object-cover border-2 ${
                                isFirst ? 'border-amber-400' : 'border-slate-600'
                              }`}
                            />
                          ) : (
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base ${
                              isFirst ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-200'
                            }`}>
                              {(player?.display_name || 'P').slice(0, 2).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <h3 className="font-bold text-white text-base leading-tight flex items-center gap-1.5">
                              {player?.display_name || 'Player'}
                              <span className="text-sm">{getCountryFlag(player?.country)}</span>
                            </h3>
                            <p className="text-xs text-amber-400 font-mono mt-0.5">
                              {player?.rating ? `⚡ ${player.rating} ELO` : 'Master League'}
                            </p>
                          </div>
                        </div>

                        {/* Stats Summary */}
                        <div className="grid grid-cols-3 gap-2 py-3 px-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-center text-xs">
                          <div>
                            <div className="text-slate-400 text-[10px] uppercase font-semibold">Points</div>
                            <div className="font-black text-amber-400 text-base">{item.points}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-[10px] uppercase font-semibold">Record</div>
                            <div className="font-bold text-slate-200 text-sm">{item.wins}-{item.draws}-{item.losses}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-[10px] uppercase font-semibold">Win Rate</div>
                            <div className="font-bold text-emerald-400 text-sm">
                              {item.played ? Math.round((item.wins / item.played) * 100) : 0}%
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          </div>

          {/* RIGHT COLUMN: FIXTURES & RESULTS */}
          <div className="space-y-8">

            {/* 3. UPCOMING MATCHDAY FIXTURES */}
            {(activeTab === 'all' || activeTab === 'fixtures') && (
              <section className="bg-slate-800/80 border border-slate-700/60 rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400">
                      <Swords className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">Upcoming Fixtures</h2>
                      <p className="text-xs text-slate-400">Matchday {currentMatchday}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-semibold">
                    {upcomingFixtures.length} Matches
                  </span>
                </div>

                {upcomingFixtures.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-80" />
                    <p>All fixtures for Matchday {currentMatchday} are completed!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingFixtures.map((fixture, idx) => {
                      const home = fixture.home_player;
                      const away = fixture.away_player;

                      return (
                        <div
                          key={fixture.id || idx}
                          className="group relative bg-slate-900/70 border border-slate-700/60 rounded-2xl p-4 hover:border-amber-400/50 transition-all duration-200 shadow-md"
                        >
                          <div className="flex items-center justify-between gap-2">
                            
                            {/* Home Player */}
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              {home?.avatar_url ? (
                                <img src={home.avatar_url} alt={home.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-amber-400 shrink-0">
                                  {(home?.display_name || 'H').slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-xs sm:text-sm text-white truncate">
                                  {home?.display_name || 'TBD'}
                                </div>
                                <div className="text-[10px] text-amber-400 font-mono">
                                  {home?.rating ? `${home.rating}` : '-'}
                                </div>
                              </div>
                            </div>

                            {/* VS Badge */}
                            <div className="px-3 py-1 rounded-xl bg-slate-800 border border-amber-400/30 text-amber-400 text-xs font-black shrink-0 shadow-inner">
                              VS
                            </div>

                            {/* Away Player */}
                            <div className="flex-1 flex items-center justify-end gap-2 text-right min-w-0">
                              <div className="min-w-0">
                                <div className="font-semibold text-xs sm:text-sm text-white truncate">
                                  {away?.display_name || 'TBD'}
                                </div>
                                <div className="text-[10px] text-amber-400 font-mono">
                                  {away?.rating ? `${away.rating}` : '-'}
                                </div>
                              </div>
                              {away?.avatar_url ? (
                                <img src={away.avatar_url} alt={away.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-amber-400 shrink-0">
                                  {(away?.display_name || 'A').slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* 4. LATEST RESULTS SECTION */}
            {(activeTab === 'all' || activeTab === 'results') && (
              <section className="bg-slate-800/80 border border-slate-700/60 rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">Latest Results</h2>
                      <p className="text-xs text-slate-400">
                        {data?.latestResults?.matchday
                          ? `Matchday ${data.latestResults.matchday}`
                          : 'Recent Completed Matches'}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-300 text-xs font-medium">
                    {latestResults.length} Results
                  </span>
                </div>

                {latestResults.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    No completed results recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {latestResults.map((result, idx) => {
                      const home = result.home_player;
                      const away = result.away_player;
                      const homeScore = result.home_score;
                      const awayScore = result.away_score;

                      const isHomeWinner = typeof homeScore === 'number' && typeof awayScore === 'number' && homeScore > awayScore;
                      const isAwayWinner = typeof homeScore === 'number' && typeof awayScore === 'number' && awayScore > homeScore;

                      return (
                        <div
                          key={result.id || idx}
                          className="bg-slate-900/70 border border-slate-700/60 rounded-2xl p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            
                            {/* Home player */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {home?.avatar_url ? (
                                <img src={home.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-slate-700 text-[10px] font-bold text-amber-400 flex items-center justify-center shrink-0">
                                  {(home?.display_name || 'H').slice(0, 1)}
                                </div>
                              )}
                              <span className={`truncate font-medium ${isHomeWinner ? 'text-amber-400 font-bold' : 'text-slate-200'}`}>
                                {home?.display_name || 'Home'}
                              </span>
                            </div>

                            {/* Score Display */}
                            <div className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-700 font-mono font-black text-amber-400 text-xs tracking-wider mx-2">
                              {result.result ? result.result : `${formatScore(homeScore)} - ${formatScore(awayScore)}`}
                            </div>

                            {/* Away player */}
                            <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
                              <span className={`truncate font-medium ${isAwayWinner ? 'text-amber-400 font-bold' : 'text-slate-200'}`}>
                                {away?.display_name || 'Away'}
                              </span>
                              {away?.avatar_url ? (
                                <img src={away.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-slate-700 text-[10px] font-bold text-amber-400 flex items-center justify-center shrink-0">
                                  {(away?.display_name || 'A').slice(0, 1)}
                                </div>
                              )}
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
