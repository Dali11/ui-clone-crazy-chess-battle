'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import LeagueNav from '@/components/league/league-nav';
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
  CheckCircle2,
  Table2,
  LayoutDashboard,
  ArrowRight,
  HelpCircle,
  Target,
  Crown
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
      <div className="min-h-screen bg-ccb-dark text-ccb-text font-sans">
        <LeagueNav />
        <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8 animate-pulse">
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-6 sm:p-8">
            <div className="h-8 bg-ccb-surface rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-ccb-surface/60 rounded w-1/4"></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-ccb-card border border-ccb-border rounded-2xl p-6 h-96"></div>
            <div className="bg-ccb-card border border-ccb-border rounded-2xl p-6 h-96"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error && !data) {
    return (
      <div className="min-h-screen bg-ccb-dark text-ccb-text font-sans">
        <LeagueNav />
        <div className="flex items-center justify-center p-4 pt-16">
          <div className="bg-ccb-card border border-ccb-danger/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
            <ShieldAlert className="w-12 h-12 text-ccb-danger mx-auto" />
            <h2 className="text-xl font-bold text-ccb-text">League Data Unavailable</h2>
            <p className="text-ccb-muted text-sm">{error}</p>
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ccb-accent text-ccb-dark font-semibold hover:bg-ccb-gold transition-all duration-200 shadow-lg shadow-ccb-accent/20 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
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
    <div className="min-h-screen bg-ccb-dark text-ccb-text font-sans selection:bg-ccb-accent selection:text-ccb-dark pb-12">
      <LeagueNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">

        {/* 1. HERO HEADER WITH BRANDING & MATCHDAY INDICATOR */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ccb-dark via-ccb-surface to-ccb-card border border-ccb-border shadow-2xl p-6 sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-ccb-accent/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute right-1/3 -bottom-20 w-80 h-80 bg-ccb-primary/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            
            {/* Title & Branding */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent text-xs font-semibold tracking-wider uppercase">
                <Trophy className="w-3.5 h-3.5" /> Official Premier League
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-ccb-text uppercase drop-shadow-sm">
                CRAZYCHESS <span className="text-ccb-accent">PREMIER LEAGUE</span>
              </h1>

              <p className="text-ccb-accent text-sm sm:text-base font-semibold tracking-wide">
                Play. Compete. Climb. Become Champion.
              </p>

              <p className="text-ccb-muted text-sm sm:text-base max-w-2xl">
                {season?.name ? `${season.name} • ` : ''}
                {league?.name || 'Top competitive chess action with real-time standings and fixtures.'}
              </p>
            </div>

            {/* Matchday Indicator Card */}
            <div className="bg-ccb-surface/90 border border-ccb-accent/30 rounded-2xl p-5 sm:p-6 min-w-[280px] sm:min-w-[320px] shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase font-bold text-ccb-muted tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-ccb-accent" /> Matchday Status
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-ccb-success/20 text-ccb-success border border-ccb-success/30 text-xs font-semibold">
                  {league?.status?.toUpperCase() || 'ACTIVE'}
                </span>
              </div>

              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-black text-ccb-accent">
                  MATCHDAY {currentMatchday}
                </span>
                <span className="text-xs text-ccb-muted font-medium">
                  of {totalMatchdays} matchdays
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-ccb-surface h-2.5 rounded-full overflow-hidden p-0.5 border border-ccb-border">
                <div
                  className="bg-gradient-to-r from-ccb-accent to-ccb-gold h-full rounded-full transition-all duration-500 shadow-sm"
                  style={{ width: `${Math.min(100, Math.max(0, (currentMatchday / (totalMatchdays || 1)) * 100))}%` }}
                ></div>
              </div>

              <div className="mt-4 pt-3 border-t border-ccb-border flex items-center justify-between text-xs text-ccb-muted">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-ccb-accent" /> {data?.standings?.length || 0} Players
                </span>
                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="inline-flex items-center gap-1 text-ccb-accent hover:text-ccb-gold transition-colors font-medium cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Sync Data
                </button>
              </div>
            </div>

          </div>
        </header>

        {/* 2. QUICK LINKS / DIRECTION SECTION */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/league/table"
            className="group bg-ccb-card hover:bg-ccb-surface border border-ccb-border hover:border-ccb-primary/60 rounded-2xl p-5 transition-all duration-200 shadow-md flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30 text-ccb-primary">
                  <Table2 className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-ccb-muted group-hover:text-ccb-primary group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-base font-bold text-ccb-text group-hover:text-ccb-primary transition-colors">
                View Full Table
              </h3>
              <p className="text-xs text-ccb-muted">
                Inspect official standings, points, form & position movements
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-ccb-primary">
              View Table <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          <Link
            href={`/league/matchday/${currentMatchday}`}
            className="group bg-ccb-card hover:bg-ccb-surface border border-ccb-border hover:border-ccb-accent/60 rounded-2xl p-5 transition-all duration-200 shadow-md flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent">
                  <Swords className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-ccb-muted group-hover:text-ccb-accent group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-base font-bold text-ccb-text group-hover:text-ccb-accent transition-colors">
                See Fixtures
              </h3>
              <p className="text-xs text-ccb-muted">
                Check upcoming pairings, schedule & matchday results
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-ccb-accent">
              See Fixtures <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>

          <Link
            href="/league/dashboard"
            className="group bg-ccb-card hover:bg-ccb-surface border border-ccb-border hover:border-ccb-gold/60 rounded-2xl p-5 transition-all duration-200 shadow-md flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-ccb-gold/10 border border-ccb-gold/30 text-ccb-gold">
                  <LayoutDashboard className="w-5 h-5" />
                </div>
                <ArrowRight className="w-4 h-4 text-ccb-muted group-hover:text-ccb-gold group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-base font-bold text-ccb-text group-hover:text-ccb-gold transition-colors">
                My Dashboard
              </h3>
              <p className="text-xs text-ccb-muted">
                Access your personal stats, ELO rating & head-to-head records
              </p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-ccb-gold">
              Go to Dashboard <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        </section>

        {/* NAVIGATION / TAB SELECTOR FOR QUICK FILTER */}
        <div className="flex items-center gap-2 border-b border-ccb-border pb-2 overflow-x-auto no-scrollbar">
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
                  ? 'bg-ccb-accent text-ccb-dark shadow-md shadow-ccb-accent/20 font-bold'
                  : 'bg-ccb-card/60 text-ccb-muted hover:text-ccb-text hover:bg-ccb-card'
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

            {/* 3. COMPACT LEAGUE STANDINGS TABLE */}
            {(activeTab === 'all' || activeTab === 'standings') && (
              <section className="bg-ccb-card border border-ccb-border rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm">
                
                {/* Section Header & Search */}
                <div className="p-5 sm:p-6 border-b border-ccb-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-ccb-surface/40">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-ccb-text">
                        League Standings
                      </h2>
                      <p className="text-xs text-ccb-muted">
                        Top {qualifyingSpots} players qualify for playoffs
                      </p>
                    </div>
                  </div>

                  {/* Search Box */}
                  <div className="relative min-w-[200px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ccb-muted" />
                    <input
                      type="text"
                      placeholder="Search player..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-ccb-dark border border-ccb-border rounded-xl pl-9 pr-4 py-2 text-xs text-ccb-text placeholder-ccb-muted focus:outline-none focus:border-ccb-accent transition-colors"
                    />
                  </div>
                </div>

                {/* Table Container */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-ccb-surface/60 text-[11px] font-bold uppercase tracking-wider text-ccb-muted border-b border-ccb-border">
                        <th className="py-3 px-4 text-center w-12">Pos</th>
                        <th className="py-3 px-4">Player</th>
                        <th className="py-3 px-3 text-center w-12">P</th>
                        <th className="py-3 px-3 text-center w-12">W</th>
                        <th className="py-3 px-3 text-center w-12">D</th>
                        <th className="py-3 px-3 text-center w-12">L</th>
                        <th className="py-3 px-4 text-center w-16">Pts</th>
                        <th className="py-3 px-4 text-center">Form</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ccb-border/60 text-xs sm:text-sm font-medium">
                      {standingsList.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-ccb-muted">
                            No players found matching "{searchQuery}"
                          </td>
                        </tr>
                      ) : (
                        standingsList.map((row) => {
                          const pos = row.position;
                          const prevPos = row.previous_position;
                          const isQualifying = pos <= qualifyingSpots;
                          const player = row.player;

                          // Movement calculations
                          let moveIcon = <Minus className="w-3 h-3 text-ccb-muted" />;
                          let moveLabel = '';
                          let moveClass = 'text-ccb-muted';

                          if (prevPos && prevPos > pos) {
                            const diff = prevPos - pos;
                            moveIcon = <ChevronUp className="w-3.5 h-3.5 text-ccb-success" />;
                            moveLabel = diff > 1 ? `${diff}` : '';
                            moveClass = 'text-ccb-success font-bold';
                          } else if (prevPos && prevPos < pos) {
                            const diff = pos - prevPos;
                            moveIcon = <ChevronDown className="w-3.5 h-3.5 text-ccb-danger" />;
                            moveLabel = diff > 1 ? `${diff}` : '';
                            moveClass = 'text-ccb-danger font-bold';
                          }

                          // Parse form array safely
                          let formArray: string[] = [];
                          if (Array.isArray(row.form)) {
                            formArray = row.form;
                          } else if (typeof row.form === 'string') {
                            formArray = (row.form as string).split('');
                          }

                          return (
                            <tr
                              key={row.id || row.player_id || pos}
                              className={`group hover:bg-ccb-surface/60 transition-colors ${
                                isQualifying ? 'bg-ccb-primary/10 border-l-4 border-ccb-primary' : 'border-l-4 border-transparent'
                              }`}
                            >
                              {/* POS & MOVEMENT */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <span className={`font-black text-base ${
                                    pos === 1 ? 'text-ccb-gold' : pos === 2 ? 'text-ccb-silver' : pos === 3 ? 'text-ccb-bronze' : 'text-ccb-muted'
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
                                      className="w-8 h-8 rounded-full object-cover border border-ccb-accent/40"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-xs font-bold text-ccb-accent">
                                      {(player?.display_name || player?.username || 'P').slice(0, 2).toUpperCase()}
                                    </div>
                                  )}

                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-ccb-text group-hover:text-ccb-accent transition-colors">
                                        {player?.display_name || player?.username || 'Unknown Player'}
                                      </span>
                                      <span className="text-xs" title={player?.country || ''}>
                                        {getCountryFlag(player?.country)}
                                      </span>
                                    </div>
                                    {player?.rating && (
                                      <span className="text-[11px] text-ccb-muted font-mono">
                                        ⚡ {player.rating} ELO
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* P, W, D, L */}
                              <td className="py-3.5 px-3 text-center text-ccb-muted font-mono">{row.played}</td>
                              <td className="py-3.5 px-3 text-center text-ccb-success font-mono font-medium">{row.wins}</td>
                              <td className="py-3.5 px-3 text-center text-ccb-accent font-mono font-medium">{row.draws}</td>
                              <td className="py-3.5 px-3 text-center text-ccb-danger font-mono font-medium">{row.losses}</td>

                              {/* PTS */}
                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-block px-2.5 py-1 rounded-lg bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent font-black text-base font-mono shadow-sm">
                                  {row.points}
                                </span>
                              </td>

                              {/* FORM */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {formArray.length === 0 ? (
                                    <span className="text-ccb-muted text-xs">-</span>
                                  ) : (
                                    formArray.slice(-5).map((f, idx) => {
                                      const letter = f.toUpperCase();
                                      let colorClass = 'bg-ccb-surface text-ccb-muted border-ccb-border';
                                      if (letter === 'W') colorClass = 'bg-ccb-success/20 text-ccb-success border-ccb-success/40';
                                      if (letter === 'D') colorClass = 'bg-ccb-accent/20 text-ccb-accent border-ccb-accent/40';
                                      if (letter === 'L') colorClass = 'bg-ccb-danger/20 text-ccb-danger border-ccb-danger/40';

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
                <div className="p-4 bg-ccb-surface/60 border-t border-ccb-border flex flex-col sm:flex-row items-center justify-between text-xs text-ccb-muted gap-2">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-ccb-primary/30 border border-ccb-primary inline-block rounded-sm"></span>
                    Positions 1–{qualifyingSpots} Playoff qualification zone
                  </span>
                  <span>Scoring: Win = 3pts, Draw = 1pt</span>
                </div>
              </section>
            )}

            {/* 4. TOP PLAYERS SECTION */}
            {(activeTab === 'all' || activeTab === 'top') && topPlayers.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-ccb-text flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-ccb-accent" /> Top League Performers
                  </h2>
                  <span className="text-xs text-ccb-muted">Leading standings & rating leaders</span>
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
                            ? 'bg-gradient-to-b from-ccb-surface to-ccb-card border-ccb-accent/60 shadow-xl shadow-ccb-accent/10'
                            : rank === 2
                            ? 'bg-ccb-card border-ccb-silver/40'
                            : 'bg-ccb-card border-ccb-border'
                        }`}
                      >
                        {/* Rank Badge */}
                        <div className="absolute top-4 right-4">
                          {isFirst ? (
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-ccb-accent text-ccb-dark font-black text-xs shadow-md shadow-ccb-accent/30">
                              <Trophy className="w-3.5 h-3.5 fill-ccb-dark" /> #1 LEAD
                            </div>
                          ) : (
                            <div className="px-2.5 py-1 rounded-full bg-ccb-surface text-ccb-muted font-bold text-xs border border-ccb-border">
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
                                isFirst ? 'border-ccb-accent' : 'border-ccb-border'
                              }`}
                            />
                          ) : (
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base ${
                              isFirst ? 'bg-ccb-accent text-ccb-dark' : 'bg-ccb-surface text-ccb-text'
                            }`}>
                              {(player?.display_name || 'P').slice(0, 2).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <h3 className="font-bold text-ccb-text text-base leading-tight flex items-center gap-1.5">
                              {player?.display_name || 'Player'}
                              <span className="text-sm">{getCountryFlag(player?.country)}</span>
                            </h3>
                            {player?.rating && (
                              <p className="text-xs text-ccb-accent font-mono">⚡ {player.rating} ELO</p>
                            )}
                          </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-ccb-border/60 text-center">
                          <div>
                            <div className="text-[10px] text-ccb-muted uppercase font-bold">Played</div>
                            <div className="font-mono font-bold text-ccb-text">{item.played}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-ccb-muted uppercase font-bold">Wins</div>
                            <div className="font-mono font-bold text-ccb-success">{item.wins}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-ccb-muted uppercase font-bold">Points</div>
                            <div className="font-mono font-black text-ccb-accent">{item.points}</div>
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

            {/* 5. UPCOMING MATCHDAY FIXTURES */}
            {(activeTab === 'all' || activeTab === 'fixtures') && (
              <section className="bg-ccb-card border border-ccb-border rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-ccb-border pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent">
                      <Swords className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-ccb-text">Upcoming Fixtures</h2>
                      <p className="text-xs text-ccb-muted">Matchday {currentMatchday}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent text-xs font-semibold">
                    {upcomingFixtures.length} Matches
                  </span>
                </div>

                {upcomingFixtures.length === 0 ? (
                  <div className="py-8 text-center text-ccb-muted text-sm space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-ccb-success mx-auto opacity-80" />
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
                          className="group relative bg-ccb-dark/70 border border-ccb-border rounded-2xl p-4 hover:border-ccb-accent/50 transition-all duration-200 shadow-md"
                        >
                          <div className="flex items-center justify-between gap-2">
                            
                            {/* Home Player */}
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              {home?.avatar_url ? (
                                <img src={home.avatar_url} alt={home.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-ccb-surface flex items-center justify-center text-[10px] font-bold text-ccb-accent shrink-0">
                                  {(home?.display_name || 'H').slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-xs sm:text-sm text-ccb-text truncate">
                                  {home?.display_name || 'TBD'}
                                </div>
                                <div className="text-[10px] text-ccb-accent font-mono">
                                  {home?.rating ? `${home.rating}` : '-'}
                                </div>
                              </div>
                            </div>

                            {/* VS Badge */}
                            <div className="px-3 py-1 rounded-xl bg-ccb-surface border border-ccb-accent/30 text-ccb-accent text-xs font-black shrink-0 shadow-inner">
                              VS
                            </div>

                            {/* Away Player */}
                            <div className="flex-1 flex items-center justify-end gap-2 text-right min-w-0">
                              <div className="min-w-0">
                                <div className="font-semibold text-xs sm:text-sm text-ccb-text truncate">
                                  {away?.display_name || 'TBD'}
                                </div>
                                <div className="text-[10px] text-ccb-accent font-mono">
                                  {away?.rating ? `${away.rating}` : '-'}
                                </div>
                              </div>
                              {away?.avatar_url ? (
                                <img src={away.avatar_url} alt={away.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-ccb-surface flex items-center justify-center text-[10px] font-bold text-ccb-accent shrink-0">
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

            {/* 6. LATEST RESULTS SECTION */}
            {(activeTab === 'all' || activeTab === 'results') && (
              <section className="bg-ccb-card border border-ccb-border rounded-3xl shadow-xl overflow-hidden backdrop-blur-sm p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-ccb-border pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-ccb-text">Latest Results</h2>
                      <p className="text-xs text-ccb-muted">
                        {data?.latestResults?.matchday
                          ? `Matchday ${data.latestResults.matchday}`
                          : 'Recent Completed Matches'}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-ccb-surface text-ccb-muted text-xs font-medium">
                    {latestResults.length} Results
                  </span>
                </div>

                {latestResults.length === 0 ? (
                  <div className="py-8 text-center text-ccb-muted text-sm">
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
                          className="bg-ccb-dark/70 border border-ccb-border rounded-2xl p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            
                            {/* Home player */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {home?.avatar_url ? (
                                <img src={home.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-ccb-surface text-[10px] font-bold text-ccb-accent flex items-center justify-center shrink-0">
                                  {(home?.display_name || 'H').slice(0, 1)}
                                </div>
                              )}
                              <span className={`truncate font-medium ${isHomeWinner ? 'text-ccb-accent font-bold' : 'text-ccb-text'}`}>
                                {home?.display_name || 'Home'}
                              </span>
                            </div>

                            {/* Score Display */}
                            <div className="px-3 py-1 rounded-lg bg-ccb-dark border border-ccb-border font-mono font-black text-ccb-accent text-xs tracking-wider mx-2">
                              {result.result ? result.result : `${formatScore(homeScore)} - ${formatScore(awayScore)}`}
                            </div>

                            {/* Away player */}
                            <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
                              <span className={`truncate font-medium ${isAwayWinner ? 'text-ccb-accent font-bold' : 'text-ccb-text'}`}>
                                {away?.display_name || 'Away'}
                              </span>
                              {away?.avatar_url ? (
                                <img src={away.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-ccb-surface text-[10px] font-bold text-ccb-accent flex items-center justify-center shrink-0">
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

        {/* 7. HOW IT WORKS SECTION */}
        <section className="bg-ccb-card border border-ccb-border rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-ccb-border pb-4">
            <div className="p-2.5 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ccb-text">How The League Works</h2>
              <p className="text-xs text-ccb-muted">The progression roadmap from qualifier to Premier League Champion</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-ccb-surface/80 border border-ccb-border rounded-2xl p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-xl bg-ccb-primary/20 text-ccb-primary border border-ccb-primary/40 font-black text-sm flex items-center justify-center">
                  1
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted px-2 py-0.5 rounded bg-ccb-dark border border-ccb-border">
                  Phase 1
                </span>
              </div>
              <h3 className="font-bold text-ccb-text text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-ccb-primary" /> Swiss Qualifiers
              </h3>
              <p className="text-xs text-ccb-muted leading-relaxed">
                Players compete in open Swiss-system tournament rounds. Victory earns qualifying spots into the elite Premier League division.
              </p>
            </div>

            <div className="bg-ccb-surface/80 border border-ccb-border rounded-2xl p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-xl bg-ccb-accent/20 text-ccb-accent border border-ccb-accent/40 font-black text-sm flex items-center justify-center">
                  2
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted px-2 py-0.5 rounded bg-ccb-dark border border-ccb-border">
                  Phase 2
                </span>
              </div>
              <h3 className="font-bold text-ccb-text text-base flex items-center gap-2">
                <Swords className="w-4 h-4 text-ccb-accent" /> Premier League
              </h3>
              <p className="text-xs text-ccb-muted leading-relaxed">
                Top qualified players battle across weekly matchdays in head-to-head fixtures with live standings, form tracking, and ELO ratings.
              </p>
            </div>

            <div className="bg-ccb-surface/80 border border-ccb-border rounded-2xl p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-xl bg-ccb-gold/20 text-ccb-gold border border-ccb-gold/40 font-black text-sm flex items-center justify-center">
                  3
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted px-2 py-0.5 rounded bg-ccb-dark border border-ccb-border">
                  Phase 3
                </span>
              </div>
              <h3 className="font-bold text-ccb-text text-base flex items-center gap-2">
                <Crown className="w-4 h-4 text-ccb-gold" /> Crown Champion
              </h3>
              <p className="text-xs text-ccb-muted leading-relaxed">
                The top 4 players from the Premier League standings advance to the Playoff Finals to compete for the ultimate championship title.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
