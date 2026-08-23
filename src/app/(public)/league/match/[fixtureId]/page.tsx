'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, RefreshCw, Swords, Shield, Calendar } from 'lucide-react';

interface Player {
  display_name?: string;
  rating?: number;
  country?: string | null;
  username?: string | null;
  avatar_url?: string | null;
}

interface Fixture {
  id?: string;
  matchday?: number;
  played?: boolean;
  result?: string | null;
  scheduled_date?: string | null;
  league_id?: string;
}

interface HeadToHead {
  total: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
  p1Name?: string;
  p2Name?: string;
  meetings?: Array<{
    id?: string;
    matchday?: number;
    date?: string;
    result?: string;
    home_player_name?: string;
    away_player_name?: string;
  }>;
}

interface Meeting {
  id?: string;
  matchday?: number;
  date?: string | null;
  result?: string;
  home_player_name?: string;
  away_player_name?: string;
}

interface MatchResponse {
  success?: boolean;
  fixture?: Fixture;
  home_player?: Player | null;
  away_player?: Player | null;
  status?: string;
  resultText?: string;
  headToHead?: HeadToHead;
  previousMeetings?: Meeting[];
  watchUrl?: string | null;
  error?: string;
}

function getCountryFlag(countryCode?: string | null): string {
  if (!countryCode || typeof countryCode !== 'string') return '♟️';
  const code = countryCode.trim().toUpperCase();
  if (code.length !== 2) return '♟️';
  const char1 = code.charCodeAt(0) - 65 + 0x1F1E6;
  const char2 = code.charCodeAt(1) - 65 + 0x1F1E6;
  if (char1 < 0x1F1E6 || char1 > 0x1F1FF || char2 < 0x1F1E6 || char2 > 0x1F1FF) {
    return '♟️';
  }
  return String.fromCodePoint(char1, char2);
}

function formatResultScore(result?: string | null, played?: boolean): string {
  if (!played || !result) return 'VS';
  const norm = result.toLowerCase().trim();
  if (norm === 'home_win' || norm === '1-0' || norm === '1 - 0') return '1 - 0';
  if (norm === 'away_win' || norm === '0-1' || norm === '0 - 1') return '0 - 1';
  if (norm === 'draw' || norm === '1/2-1/2' || norm === '½-½' || norm === '½ - ½') return '½ - ½';
  return result;
}

export default function MatchDetailPage({ params }: { params?: Promise<{ fixtureId: string }> }) {
  const routeParams = useParams();
  const resolvedParams = params ? use(params) : null;
  const fixtureId = (routeParams?.fixtureId || resolvedParams?.fixtureId) as string;

  const [data, setData] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fixtureId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/league/match/${fixtureId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load match details (Status ${res.status})`);
        }
        return res.json();
      })
      .then((json: MatchResponse) => {
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
          setError(err.message || 'Error fetching match details');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [fixtureId]);

  const fixture = data?.fixture;
  const homePlayer = data?.home_player;
  const awayPlayer = data?.away_player;
  const status = data?.status || (fixture?.played ? 'completed' : 'scheduled');
  const isCompleted = fixture?.played || status === 'completed';
  const resultScore = formatResultScore(fixture?.result, isCompleted);
  const resultText = data?.resultText;
  const h2h = data?.headToHead || { total: 0, p1Wins: 0, p2Wins: 0, draws: 0 };

  const meetingsList = data?.previousMeetings || data?.headToHead?.meetings || [];
  const watchUrl = data?.watchUrl || 'https://www.chess.com/live';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <Link
            href={fixture?.matchday ? `/league/matchday/${fixture.matchday}` : '/league/table'}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>
              {fixture?.matchday ? `Back to Matchday ${fixture.matchday}` : 'Back to League'}
            </span>
          </Link>

          {fixture?.matchday && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-amber-400">
              Matchday {fixture.matchday}
            </span>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading match details...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-8 text-center text-red-300">
            <p className="font-semibold text-lg mb-1">Error Loading Match</p>
            <p className="text-sm text-red-400/90">{error}</p>
          </div>
        )}

        {/* Main Content */}
        {!loading && !error && (
          <>
            {/* BIG MATCH HEADER */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600" />

              {/* Status Badge */}
              <div className="flex justify-center mb-6">
                {status === 'live' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE GAME
                  </span>
                ) : isCompleted ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-700 text-slate-300 border border-slate-600">
                    COMPLETED
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400/10 text-amber-400 border border-amber-400/30">
                    SCHEDULED MATCH
                  </span>
                )}
              </div>

              {/* Side-by-Side Players View */}
              <div className="grid grid-cols-1 md:grid-cols-7 items-center gap-6">
                {/* Home Player */}
                <div className="md:col-span-3 flex flex-col items-center text-center p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-amber-400/40 flex items-center justify-center text-2xl sm:text-3xl font-bold text-amber-400 mb-3 shadow-inner">
                    {homePlayer?.display_name?.[0]?.toUpperCase() || 'H'}
                  </div>
                  <div className="flex items-center gap-2 justify-center text-lg sm:text-xl font-extrabold text-white">
                    <span>{getCountryFlag(homePlayer?.country)}</span>
                    <span>{homePlayer?.display_name || 'Home Player'}</span>
                  </div>
                  {homePlayer?.username && (
                    <span className="text-xs text-slate-400 mt-0.5">@{homePlayer.username}</span>
                  )}
                  <span className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                    {homePlayer?.rating ? `${homePlayer.rating} ELO` : 'Unrated'}
                  </span>
                </div>

                {/* Score / VS Center */}
                <div className="md:col-span-1 flex flex-col items-center justify-center text-center my-2 md:my-0">
                  <div className="text-3xl sm:text-4xl font-black text-amber-400 tracking-wider">
                    {resultScore}
                  </div>
                  {isCompleted && resultText && (
                    <div className="mt-2 text-xs font-semibold text-slate-300 bg-slate-900/80 px-2.5 py-1 rounded-full border border-slate-700">
                      {resultText}
                    </div>
                  )}
                </div>

                {/* Away Player */}
                <div className="md:col-span-3 flex flex-col items-center text-center p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 border-2 border-amber-400/40 flex items-center justify-center text-2xl sm:text-3xl font-bold text-amber-400 mb-3 shadow-inner">
                    {awayPlayer?.display_name?.[0]?.toUpperCase() || 'A'}
                  </div>
                  <div className="flex items-center gap-2 justify-center text-lg sm:text-xl font-extrabold text-white">
                    <span>{getCountryFlag(awayPlayer?.country)}</span>
                    <span>{awayPlayer?.display_name || 'Away Player'}</span>
                  </div>
                  {awayPlayer?.username && (
                    <span className="text-xs text-slate-400 mt-0.5">@{awayPlayer.username}</span>
                  )}
                  <span className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                    {awayPlayer?.rating ? `${awayPlayer.rating} ELO` : 'Unrated'}
                  </span>
                </div>
              </div>
            </div>

            {/* HEAD TO HEAD RECORD */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-700/60 pb-3">
                <Shield className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-white">Head-to-Head Record</h2>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-1 truncate">
                    {homePlayer?.display_name || 'Home'} Wins
                  </div>
                  <div className="text-2xl font-black text-amber-400">{h2h.p1Wins}</div>
                </div>

                <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Draws</div>
                  <div className="text-2xl font-black text-slate-300">{h2h.draws}</div>
                </div>

                <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400 uppercase tracking-wider mb-1 truncate">
                    {awayPlayer?.display_name || 'Away'} Wins
                  </div>
                  <div className="text-2xl font-black text-amber-400">{h2h.p2Wins}</div>
                </div>
              </div>

              {/* Visual H2H Bar */}
              {h2h.total > 0 && (
                <div className="space-y-1.5">
                  <div className="flex h-3 rounded-full overflow-hidden bg-slate-900 border border-slate-700">
                    {h2h.p1Wins > 0 && (
                      <div
                        className="bg-amber-400 transition-all"
                        style={{ width: `${(h2h.p1Wins / h2h.total) * 100}%` }}
                        title={`${homePlayer?.display_name || 'Home'}: ${h2h.p1Wins} wins`}
                      />
                    )}
                    {h2h.draws > 0 && (
                      <div
                        className="bg-slate-500 transition-all"
                        style={{ width: `${(h2h.draws / h2h.total) * 100}%` }}
                        title={`Draws: ${h2h.draws}`}
                      />
                    )}
                    {h2h.p2Wins > 0 && (
                      <div
                        className="bg-emerald-500 transition-all"
                        style={{ width: `${(h2h.p2Wins / h2h.total) * 100}%` }}
                        title={`${awayPlayer?.display_name || 'Away'}: ${h2h.p2Wins} wins`}
                      />
                    )}
                  </div>
                  <div className="text-center text-[11px] text-slate-400">
                    Total Meetings: <span className="text-white font-semibold">{h2h.total}</span>
                  </div>
                </div>
              )}
            </div>

            {/* CHESS BOARD PLACEHOLDER */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-md text-center space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                <Swords className="w-5 h-5 text-amber-400" />
                Live Game Board
              </h2>

              <div className="mx-auto max-w-sm aspect-square bg-slate-950 border-2 border-slate-700 rounded-xl flex flex-col items-center justify-center p-6 relative overflow-hidden shadow-inner group">
                {/* Chess pattern grid background effect */}
                <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 opacity-10 pointer-events-none">
                  {[...Array(16)].map((_, i) => (
                    <div
                      key={i}
                      className={(Math.floor(i / 4) + (i % 4)) % 2 === 0 ? 'bg-amber-400' : 'bg-transparent'}
                    />
                  ))}
                </div>

                <Swords className="w-12 h-12 text-amber-400/80 mb-3 group-hover:scale-110 transition-transform" />
                <p className="text-base font-bold text-slate-200">Live game coming soon</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Watch this match live or view full move analysis once broadcast starts.
                </p>

                {watchUrl && (
                  <a
                    href={watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors shadow-md"
                  >
                    <span>Watch on Chess.com</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* PREVIOUS MEETINGS LIST */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-700/60 pb-3">
                <Calendar className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-white">Previous Meetings</h2>
              </div>

              {meetingsList.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  <p>No previous meetings recorded between these players.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {meetingsList.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                          Matchday {m.matchday || '-'}
                        </span>
                        <span className="text-slate-300 font-medium">
                          {m.home_player_name || homePlayer?.display_name || 'Home'} vs{' '}
                          {m.away_player_name || awayPlayer?.display_name || 'Away'}
                        </span>
                      </div>

                      <div className="text-xs font-bold px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                        {m.result || 'Played'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
