'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Swords, Trophy, ArrowLeft, RefreshCw } from 'lucide-react';

interface Player {
  display_name?: string;
  rating?: number;
  avatar_url?: string | null;
  country?: string | null;
}

interface Fixture {
  id: string;
  matchday: number;
  home_player_id?: string;
  away_player_id?: string;
  result?: string | null;
  played: boolean;
  scheduled_date?: string | null;
  home_player?: Player | null;
  away_player?: Player | null;
}

interface LeagueInfo {
  id?: string;
  name?: string;
  currentMatchday?: number;
  totalMatchdays?: number;
}

interface MatchdayInfo {
  number: number;
  status: 'upcoming' | 'live' | 'completed' | string;
  totalFixtures: number;
}

interface MatchdayResponse {
  success?: boolean;
  league?: LeagueInfo;
  matchday?: MatchdayInfo;
  fixtures?: Fixture[];
  error?: string;
}

function formatResult(result: string | null | undefined, played: boolean): string {
  if (!played || !result) return 'VS';
  const norm = result.toLowerCase().trim();
  if (norm === 'home_win' || norm === '1-0' || norm === '1 - 0') return '1 - 0';
  if (norm === 'away_win' || norm === '0-1' || norm === '0 - 1') return '0 - 1';
  if (norm === 'draw' || norm === '1/2-1/2' || norm === '½-½' || norm === '½ - ½') return '½ - ½';
  return result;
}

function getStatusBadge(status: string) {
  const normStatus = (status || '').toLowerCase();
  if (normStatus === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-950/50">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        LIVE
      </span>
    );
  }
  if (normStatus === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
        COMPLETED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-400 border border-amber-400/30">
      UPCOMING
    </span>
  );
}

export default function MatchdayPage({ params }: { params?: Promise<{ number: string }> }) {
  const routeParams = useParams();
  const resolvedParams = params ? use(params) : null;
  const matchdayParam = routeParams?.number || resolvedParams?.number || '1';
  const matchdayNumber = parseInt(matchdayParam as string, 10) || 1;

  const [data, setData] = useState<MatchdayResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/league/matchday?matchday=${matchdayNumber}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load matchday (Status ${res.status})`);
        }
        return res.json();
      })
      .then((json: MatchdayResponse) => {
        if (isMounted) {
          if (json.error) {
            setError(json.error);
          } else {
            setData(json);
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Error fetching matchday data');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [matchdayNumber]);

  const matchdayStatus = data?.matchday?.status || 'upcoming';
  const totalMatchdays = data?.league?.totalMatchdays || 10;
  const fixtures = data?.fixtures || [];

  const prevMatchday = matchdayNumber > 1 ? matchdayNumber - 1 : null;
  const nextMatchday = matchdayNumber < totalMatchdays ? matchdayNumber + 1 : null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Link & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <Link
              href="/league/table"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to League Table</span>
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <Trophy className="w-7 h-7 text-amber-400 shrink-0" />
                MATCHDAY {matchdayNumber}
              </h1>
              {!loading && getStatusBadge(matchdayStatus)}
            </div>
            {data?.league?.name && (
              <p className="text-sm text-slate-400 mt-1">{data.league.name}</p>
            )}
          </div>

          {/* Matchday Prev/Next Nav */}
          <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/80 shrink-0">
            {prevMatchday ? (
              <Link
                href={`/league/matchday/${prevMatchday}`}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-slate-700/60 hover:bg-amber-400 hover:text-slate-900 text-slate-200 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Prev</span>
              </Link>
            ) : (
              <button
                disabled
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-slate-800 text-slate-600 cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Prev</span>
              </button>
            )}

            <span className="text-xs font-semibold px-2 text-amber-400">
              {matchdayNumber} / {totalMatchdays}
            </span>

            {nextMatchday ? (
              <Link
                href={`/league/matchday/${nextMatchday}`}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-slate-700/60 hover:bg-amber-400 hover:text-slate-900 text-slate-200 transition-all"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <button
                disabled
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-slate-800 text-slate-600 cursor-not-allowed"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading matchday fixtures...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-6 text-center text-red-300">
            <p className="font-semibold text-lg mb-1">Error Loading Matchday</p>
            <p className="text-sm text-red-400/90">{error}</p>
          </div>
        )}

        {/* Fixtures List */}
        {!loading && !error && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>{fixtures.length} Fixture{fixtures.length === 1 ? '' : 's'}</span>
              <span>Click card for details</span>
            </div>

            {fixtures.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400">
                <Swords className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="font-semibold text-base text-slate-300">No Fixtures Scheduled</p>
                <p className="text-xs text-slate-500 mt-1">There are no fixtures listed for Matchday {matchdayNumber}.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {fixtures.map((fixture) => {
                  const resultStr = formatResult(fixture.result, fixture.played);
                  const isCompleted = fixture.played;

                  const homeName = fixture.home_player?.display_name || 'Home Player';
                  const homeRating = fixture.home_player?.rating;
                  const awayName = fixture.away_player?.display_name || 'Away Player';
                  const awayRating = fixture.away_player?.rating;

                  return (
                    <Link
                      key={fixture.id}
                      href={`/league/match/${fixture.id}`}
                      className="group bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400/60 rounded-xl p-4 sm:p-5 transition-all duration-200 shadow-md flex items-center justify-between gap-3 sm:gap-6"
                    >
                      {/* Home Player */}
                      <div className="flex-1 min-w-0 text-right">
                        <div className="font-bold text-sm sm:text-base text-white group-hover:text-amber-400 transition-colors truncate">
                          {homeName}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {homeRating ? `${homeRating} ELO` : 'Unrated'}
                        </div>
                      </div>

                      {/* Result / VS Badge */}
                      <div className="shrink-0 flex flex-col items-center justify-center px-3 sm:px-4 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/60 min-w-[70px] sm:min-w-[90px] text-center">
                        <span
                          className={`text-sm sm:text-base font-extrabold tracking-wider ${
                            isCompleted ? 'text-amber-400' : 'text-slate-400'
                          }`}
                        >
                          {resultStr}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
                          {isCompleted ? 'Final' : 'Scheduled'}
                        </span>
                      </div>

                      {/* Away Player */}
                      <div className="flex-1 min-w-0 text-left">
                        <div className="font-bold text-sm sm:text-base text-white group-hover:text-amber-400 transition-colors truncate">
                          {awayName}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {awayRating ? `${awayRating} ELO` : 'Unrated'}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
