'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Swords, Trophy, ArrowLeft, RefreshCw } from 'lucide-react';
import LeagueNav from '@/components/league/league-nav';

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
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-ccb-success/10 text-ccb-success border border-ccb-success/30 shadow-sm shadow-ccb-success/20">
        <span className="w-2 h-2 rounded-full bg-ccb-success animate-pulse" />
        LIVE
      </span>
    );
  }
  if (normStatus === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-ccb-surface text-ccb-muted border border-ccb-border">
        COMPLETED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-ccb-accent/10 text-ccb-accent border border-ccb-accent/30">
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
    <>
      <LeagueNav />
      <div className="space-y-6 pb-20 sm:pb-8">
        <div className="space-y-6">
          {/* Back Link & Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ccb-border pb-4">
            <div>
              <Link
                href="/league"
                className="inline-flex items-center gap-1.5 text-xs text-ccb-muted hover:text-ccb-accent transition-colors mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to League Home</span>
              </Link>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ccb-text flex items-center gap-2">
                  <Trophy className="w-7 h-7 text-ccb-accent shrink-0" />
                  MATCHDAY {matchdayNumber}
                </h1>
                {!loading && getStatusBadge(matchdayStatus)}
              </div>
              {data?.league?.name && (
                <p className="text-sm text-ccb-muted mt-1">{data.league.name}</p>
              )}
            </div>

            {/* Matchday Prev/Next Nav */}
            <div className="flex items-center gap-2 bg-ccb-surface p-1.5 rounded-lg border border-ccb-border shrink-0">
              {prevMatchday ? (
                <Link
                  href={`/league/matchday/${prevMatchday}`}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-ccb-primary hover:bg-ccb-primaryHover text-ccb-text transition-all shadow-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Prev</span>
                </Link>
              ) : (
                <button
                  disabled
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-ccb-surface text-ccb-muted/40 cursor-not-allowed border border-ccb-border/50"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Prev</span>
                </button>
              )}

              <span className="text-xs font-semibold px-2 text-ccb-accent">
                {matchdayNumber} / {totalMatchdays}
              </span>

              {nextMatchday ? (
                <Link
                  href={`/league/matchday/${nextMatchday}`}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-ccb-primary hover:bg-ccb-primaryHover text-ccb-text transition-all shadow-sm"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ) : (
                <button
                  disabled
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-ccb-surface text-ccb-muted/40 cursor-not-allowed border border-ccb-border/50"
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
              <RefreshCw className="w-8 h-8 text-ccb-accent animate-spin" />
              <p className="text-sm text-ccb-muted">Loading matchday fixtures...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="bg-ccb-danger/10 border border-ccb-danger/30 rounded-xl p-6 text-center text-ccb-danger">
              <p className="font-semibold text-lg mb-1">Error Loading Matchday</p>
              <p className="text-sm text-ccb-danger/90">{error}</p>
            </div>
          )}

          {/* Fixtures List */}
          {!loading && !error && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-ccb-muted px-1">
                <span>{fixtures.length} Fixture{fixtures.length === 1 ? '' : 's'}</span>
                <span>Click card for details</span>
              </div>

              {fixtures.length === 0 ? (
                <div className="bg-ccb-card border border-ccb-border rounded-xl p-8 text-center text-ccb-muted">
                  <Swords className="w-10 h-10 text-ccb-muted/50 mx-auto mb-2" />
                  <p className="font-semibold text-base text-ccb-text">No Fixtures Scheduled</p>
                  <p className="text-xs text-ccb-muted mt-1">There are no fixtures listed for Matchday {matchdayNumber}.</p>
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
                        className="group bg-ccb-card hover:bg-ccb-surface border border-ccb-border hover:border-ccb-accent/50 rounded-xl p-4 sm:p-5 transition-all duration-200 shadow-md flex items-center justify-between gap-3 sm:gap-6"
                      >
                        {/* Home Player */}
                        <div className="flex-1 min-w-0 text-right">
                          <div className="font-bold text-sm sm:text-base text-ccb-text group-hover:text-ccb-accent transition-colors truncate">
                            {homeName}
                          </div>
                          <div className="text-xs text-ccb-muted mt-0.5">
                            {homeRating ? `${homeRating} ELO` : 'Unrated'}
                          </div>
                        </div>

                        {/* Result / VS Badge */}
                        <div className="shrink-0 flex flex-col items-center justify-center px-3 sm:px-4 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border min-w-[70px] sm:min-w-[90px] text-center">
                          <span
                            className={`text-sm sm:text-base font-extrabold tracking-wider ${
                              isCompleted ? 'text-ccb-success' : 'text-ccb-muted'
                            }`}
                          >
                            {resultStr}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-ccb-muted/80 mt-0.5">
                            {isCompleted ? 'Final' : 'Scheduled'}
                          </span>
                        </div>

                        {/* Away Player */}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="font-bold text-sm sm:text-base text-ccb-text group-hover:text-ccb-accent transition-colors truncate">
                            {awayName}
                          </div>
                          <div className="text-xs text-ccb-muted mt-0.5">
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
    </>
  );
}
