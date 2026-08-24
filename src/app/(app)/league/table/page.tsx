'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trophy,
  ArrowUp,
  ArrowDown,
  Minus,
  Search,
  RefreshCw,
  Info,
  ChevronLeft,
} from 'lucide-react';
import LeagueSubNav from '@/components/league/league-sub-nav';

interface Player {
  id: string;
  username?: string;
  display_name?: string;
  rating?: number;
  country?: string;
  avatar_url?: string;
}

interface Standing {
  id?: string;
  league_id?: string;
  player_id: string;
  position: number;
  previous_position?: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  form?: string[];
  player?: Player | null;
}

interface LeagueInfo {
  id?: string;
  name?: string;
  season_id?: string;
  qualifying_spots?: number;
  currentMatchday?: number;
  totalMatchdays?: number;
  status?: string;
}

interface HomepageApiResponse {
  success?: boolean;
  league?: LeagueInfo;
  standings?: Standing[];
  error?: string;
}

export default function StandingsTablePage() {
  const router = useRouter();
  const [data, setData] = useState<HomepageApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchStandings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/homepage');
      if (!res.ok) {
        throw new Error(`Failed to fetch league data (${res.status})`);
      }
      const json: HomepageApiResponse = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json);
    } catch (err: any) {
      console.error('Error fetching league table:', err);
      setError(err.message || 'An unexpected error occurred while loading the standings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStandings();
  }, []);

  const league = data?.league;
  const qualifyingSpots = league?.qualifying_spots ?? 4;
  const currentMatchday = league?.currentMatchday ?? 1;
  const totalMatchdays = league?.totalMatchdays ?? 38;

  const filteredStandings = useMemo(() => {
    if (!data?.standings) return [];
    if (!searchQuery.trim()) return data.standings;
    const q = searchQuery.toLowerCase().trim();
    return data.standings.filter((s) => {
      const name = s.player?.display_name || s.player?.username || '';
      return name.toLowerCase().includes(q) || s.player_id.toLowerCase().includes(q);
    });
  }, [data?.standings, searchQuery]);

  const handleRowClick = (playerId: string) => {
    router.push(`/league/player/${playerId}`);
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/league" className="inline-flex items-center gap-1.5 text-sm text-ccb-muted hover:text-ccb-accent transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Leagues
        </Link>
        <LeagueSubNav />
      </div>
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-ccb-surface">
        <div>
          <div className="flex items-center gap-2 text-ccb-accent text-xs sm:text-sm font-semibold tracking-wider uppercase mb-1">
            <Trophy className="w-4 h-4 text-ccb-accent animate-pulse" />
            <span>{league?.name || 'CrazyChess Premier League'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            League Standings
          </h1>
          <p className="text-ccb-muted text-sm mt-1">
            Official season rankings, current form, and position movements.
          </p>
        </div>

        {/* Matchday Pill & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-ccb-surface/90 border border-ccb-border/80 px-4 py-2 rounded-xl flex items-center gap-3 text-xs sm:text-sm">
            <div className="flex flex-col">
              <span className="text-ccb-muted text-[10px] uppercase font-bold tracking-wider">
                Progress
              </span>
              <span className="font-semibold text-ccb-accent">
                Matchday {currentMatchday} <span className="text-ccb-muted font-normal">/ {totalMatchdays}</span>
              </span>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-ccb-accent animate-ping" />
          </div>

          <button
            onClick={fetchStandings}
            disabled={loading}
            className="p-2.5 bg-ccb-surface hover:bg-ccb-border active:bg-ccb-surface border border-ccb-border rounded-xl text-ccb-muted hover:text-white transition-colors disabled:opacity-50"
            title="Refresh Standings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Legend & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 bg-ccb-dark/60 p-4 rounded-xl border border-ccb-surface/80">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-ccb-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-ccb-accent inline-block" />
            <span className="text-ccb-muted">Champion (1st)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-ccb-success inline-block" />
            <span className="text-ccb-muted">Qualifying Zone (Top {qualifyingSpots})</span>
          </div>
          <div className="h-3 w-px bg-ccb-surface hidden sm:block" />
          <div className="flex items-center gap-1">
            <span className="text-ccb-muted mr-1">Form:</span>
            <span className="w-4 h-4 rounded-full bg-ccb-success text-white font-bold text-[9px] flex items-center justify-center">W</span>
            <span className="w-4 h-4 rounded-full bg-ccb-muted text-white font-bold text-[9px] flex items-center justify-center">D</span>
            <span className="w-4 h-4 rounded-full bg-ccb-danger text-white font-bold text-[9px] flex items-center justify-center">L</span>
          </div>
          <div className="h-3 w-px bg-ccb-surface hidden sm:block" />
          <div className="flex items-center gap-1">
            <span className="text-ccb-muted mr-1">Move:</span>
            <ArrowUp className="w-3.5 h-3.5 text-ccb-success" />
            <ArrowDown className="w-3.5 h-3.5 text-ccb-danger" />
            <Minus className="w-3.5 h-3.5 text-ccb-muted" />
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full lg:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ccb-muted" />
          <input
            type="text"
            placeholder="Search player..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-ccb-dark border border-ccb-border/80 focus:border-ccb-accent text-ccb-text placeholder-ccb-muted text-xs sm:text-sm pl-9 pr-3 py-2 rounded-lg outline-none transition-colors"
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-ccb-danger/10 border border-ccb-danger/30 rounded-xl p-4 mb-6 flex items-start gap-3 text-ccb-danger text-sm">
          <Info className="w-5 h-5 text-ccb-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-ccb-danger">Failed to load standings</p>
            <p className="text-xs text-ccb-danger/80 mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchStandings}
            className="px-3 py-1 bg-ccb-danger/20 hover:bg-ccb-danger/30 border border-ccb-danger/40 rounded-lg text-xs font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="bg-ccb-dark/80 rounded-xl border border-ccb-surface overflow-hidden">
          <div className="p-4 border-b border-ccb-surface bg-ccb-surface/40 flex items-center justify-between">
            <div className="h-4 w-32 bg-ccb-surface rounded animate-pulse" />
            <div className="h-4 w-16 bg-ccb-surface rounded animate-pulse" />
          </div>
          <div className="divide-y divide-ccb-surface/50">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-ccb-surface rounded" />
                  <div className="w-8 h-8 bg-ccb-surface rounded-full" />
                  <div className="w-32 h-4 bg-ccb-surface rounded" />
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-4 bg-ccb-surface rounded" />
                  <div className="w-12 h-4 bg-ccb-surface rounded" />
                  <div className="w-20 h-4 bg-ccb-surface rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standings Table */}
      {!loading && filteredStandings.length === 0 && !error && (
        <div className="text-center py-12 bg-ccb-dark/40 rounded-xl border border-ccb-surface">
          <Trophy className="w-12 h-12 text-ccb-border mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-ccb-muted">No standings found</h3>
          <p className="text-ccb-muted text-sm mt-1">
            {searchQuery ? 'No player matches your search filter.' : 'No league standings data is currently available.'}
          </p>
        </div>
      )}

      {!loading && filteredStandings.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-ccb-surface bg-ccb-dark/40 shadow-inner">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="bg-ccb-surface/80 text-ccb-muted font-bold uppercase text-[11px] tracking-wider border-b border-ccb-border/60">
                <th scope="col" className="py-3.5 px-3 text-center w-12">POS</th>
                <th scope="col" className="py-3.5 px-4">PLAYER</th>
                <th scope="col" className="py-3.5 px-3 text-center w-12" title="Played">P</th>
                <th scope="col" className="py-3.5 px-3 text-center w-12" title="Wins">W</th>
                <th scope="col" className="py-3.5 px-3 text-center w-12" title="Draws">D</th>
                <th scope="col" className="py-3.5 px-3 text-center w-12" title="Losses">L</th>
                <th scope="col" className="py-3.5 px-3 text-center w-14 text-ccb-accent" title="Points">PTS</th>
                <th scope="col" className="py-3.5 px-4 text-center w-40">FORM</th>
                <th scope="col" className="py-3.5 px-3 text-center w-16">MOVE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ccb-surface/60 text-xs sm:text-sm font-medium">
              {filteredStandings.map((standing) => {
                const pos = standing.position;
                const prevPos = standing.previous_position;
                const isChampion = pos === 1;
                const isQualifying = !isChampion && pos <= qualifyingSpots;

                // Border highlighting: Gold left border for 1st, Green left border for top N qualification spots
                let borderClass = 'border-l-4 border-transparent';
                if (isChampion) {
                  borderClass = 'border-l-4 border-ccb-accent bg-ccb-accent/[0.04]';
                } else if (isQualifying) {
                  borderClass = 'border-l-4 border-ccb-success bg-ccb-success/[0.03]';
                }

                // Movement calculation
                let moveIcon = <Minus className="w-4 h-4 text-ccb-muted mx-auto" />;
                if (prevPos && prevPos > pos) {
                  const diff = prevPos - pos;
                  moveIcon = (
                    <div className="flex items-center justify-center gap-0.5 text-ccb-success font-bold text-xs">
                      <ArrowUp className="w-4 h-4" />
                      <span>{diff > 1 ? diff : ''}</span>
                    </div>
                  );
                } else if (prevPos && prevPos < pos) {
                  const diff = pos - prevPos;
                  moveIcon = (
                    <div className="flex items-center justify-center gap-0.5 text-ccb-danger font-bold text-xs">
                      <ArrowDown className="w-4 h-4" />
                      <span>{diff > 1 ? diff : ''}</span>
                    </div>
                  );
                }

                const playerObj = standing.player;
                const playerId = playerObj?.id || standing.player_id;
                const displayName = playerObj?.display_name || playerObj?.username || standing.player_id.substring(0, 8);
                const rating = playerObj?.rating;
                const country = playerObj?.country;
                const avatarUrl = playerObj?.avatar_url;
                const formList = (standing.form || []).slice(-5);

                return (
                  <tr
                    key={standing.id || standing.player_id}
                    onClick={() => handleRowClick(playerId)}
                    className={`group hover:bg-ccb-surface/60 transition-colors cursor-pointer ${borderClass}`}
                  >
                    {/* Position */}
                    <td className="py-3.5 px-3 text-center font-bold">
                      {isChampion ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-ccb-accent/20 text-ccb-accent border border-ccb-accent/40 text-xs font-black shadow-sm">
                          1
                        </span>
                      ) : pos === 2 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-ccb-muted/20 text-ccb-text border border-ccb-muted/40 text-xs font-black">
                          2
                        </span>
                      ) : pos === 3 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-ccb-accent/20 text-ccb-accent border border-ccb-accent/40 text-xs font-black">
                          3
                        </span>
                      ) : (
                        <span className="text-ccb-muted text-xs font-semibold">{pos}</span>
                      )}
                    </td>

                    {/* Player Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="relative w-8 h-8 rounded-full overflow-hidden bg-ccb-surface border border-ccb-border shrink-0 flex items-center justify-center text-ccb-muted font-bold text-xs">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>{displayName.charAt(0).toUpperCase()}</span>
                          )}
                        </div>

                        {/* Name & Details */}
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-ccb-text group-hover:text-ccb-accent transition-colors truncate">
                              {displayName}
                            </span>
                            {country && (
                              <span className="text-[10px] text-ccb-muted bg-ccb-surface px-1.5 py-0.5 rounded uppercase font-mono">
                                {country}
                              </span>
                            )}
                          </div>
                          {rating !== undefined && rating !== null && (
                            <span className="text-[11px] text-ccb-accent/80 font-mono">
                              {rating} ELO
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Played */}
                    <td className="py-3.5 px-3 text-center text-ccb-muted font-semibold">{standing.played}</td>

                    {/* Wins */}
                    <td className="py-3.5 px-3 text-center text-ccb-success font-semibold">{standing.wins}</td>

                    {/* Draws */}
                    <td className="py-3.5 px-3 text-center text-ccb-muted font-semibold">{standing.draws}</td>

                    {/* Losses */}
                    <td className="py-3.5 px-3 text-center text-ccb-danger font-semibold">{standing.losses}</td>

                    {/* Points */}
                    <td className="py-3.5 px-3 text-center font-black text-ccb-accent text-base bg-ccb-accent/5">
                      {standing.points}
                    </td>

                    {/* Form Pills */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {formList.length === 0 ? (
                          <span className="text-ccb-border text-xs font-mono">-</span>
                        ) : (
                          formList.map((res, i) => {
                            const upperRes = (res || '').toUpperCase();
                            let bg = 'bg-ccb-border text-white';
                            if (upperRes === 'W') bg = 'bg-ccb-success text-white shadow-ccb-success/30';
                            else if (upperRes === 'D') bg = 'bg-ccb-muted text-white shadow-ccb-muted/30';
                            else if (upperRes === 'L') bg = 'bg-ccb-danger text-white shadow-ccb-danger/30';

                            return (
                              <span
                                key={i}
                                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full font-extrabold text-[10px] sm:text-xs flex items-center justify-center shadow-sm ${bg}`}
                                title={upperRes === 'W' ? 'Win' : upperRes === 'D' ? 'Draw' : upperRes === 'L' ? 'Loss' : upperRes}
                              >
                                {upperRes}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>

                    {/* Position Movement */}
                    <td className="py-3.5 px-3 text-center">
                      {moveIcon}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-6 pt-4 border-t border-ccb-surface/80 flex flex-col sm:flex-row items-center justify-between text-xs text-ccb-muted gap-2">
        <span>Click any row to view full player profile & match stats.</span>
        <span>CrazyChess Premier League &bull; Automated Scoring System</span>
      </div>
    </div>
  );
}
