'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Trophy, Users, Calendar, Clock, DollarSign, RefreshCw, AlertCircle,
  Crown, Star, Swords, ChevronRight, ArrowLeft, Zap, Award, Medal,
  CheckCircle, XCircle, Play, Settings,
} from 'lucide-react';

interface TournamentData {
  success: boolean;
  isAdmin: boolean;
  isRegistered: boolean;
  canJoin: boolean;
  joinReason: string | null;
  tournament: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    time_control: string;
    initial_minutes: number;
    increment_seconds: number;
    status: string;
    max_players: number | null;
    min_rating: number | null;
    max_rating: number | null;
    rounds: number;
    current_round: number;
    duration_minutes: number | null;
    starts_at: string;
    ends_at: string | null;
    entry_fee_cents: number;
    prize_pool_cents: number;
    berry_prize_pool: number | null;
    prize_distribution: any;
    min_players: number;
  };
  participants: Array<{
    player_id: string;
    seed: number;
    score: number;
    games_played: number;
    wins: number;
    losses: number;
    draws: number;
    streak: number;
    best_streak: number;
    final_rank: number | null;
    paid_entry_fee: boolean;
    joined_at: string;
    profile: {
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      rating: number;
    } | null;
  }>;
  rounds: Array<{
    id: string;
    round_number: number;
    is_complete: boolean;
    pairings: Array<{
      white: string;
      black: string;
      result: string | null;
      bye: boolean;
      whiteName: string;
      whiteRating: number;
      blackName: string;
      blackRating: number;
      game_id?: string;
    }>;
  }>;
  participantCount: number;
}

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  upcoming: { label: 'UPCOMING', color: 'text-ccb-accent bg-ccb-accent/10 border-ccb-accent/30' },
  pending_approval: { label: 'PENDING', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' },
  active: { label: 'LIVE', color: 'text-ccb-success bg-ccb-success/10 border-ccb-success/30' },
  finished: { label: 'COMPLETED', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' },
  completed: { label: 'COMPLETED', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' },
};

function formatMoney(cents: number) {
  return `MK${(cents / 100).toLocaleString()}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'standings' | 'rounds' | 'info'>('standings');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${resolvedParams.id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load tournament');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [resolvedParams.id]);

  const handleJoin = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${resolvedParams.id}/join`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to join');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${resolvedParams.id}/leave`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to leave');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async () => {
    if (!confirm('Start this tournament now? This will generate first-round pairings.')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${resolvedParams.id}/start`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdvanceRound = async () => {
    if (!confirm('Advance to the next round? This will generate pairings for the next round.')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${resolvedParams.id}/advance-round`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to advance round');
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-20 sm:pb-8 animate-pulse">
        <div className="h-6 w-24 bg-ccb-surface rounded-lg" />
        <div className="bg-ccb-card border border-ccb-border rounded-2xl h-48" />
        <div className="bg-ccb-card border border-ccb-border rounded-2xl h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 pb-20">
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-ccb-danger mx-auto mb-3" />
          <h3 className="font-bold mb-1">Couldn&apos;t load tournament</h3>
          <p className="text-sm text-ccb-muted">{error || 'Unknown error'}</p>
          <Link href="/league" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-ccb-primary">
            <ArrowLeft className="w-4 h-4" /> Back to Compete
          </Link>
        </div>
      </div>
    );
  }

  const { tournament: t, participants, rounds, isAdmin, isRegistered, canJoin, joinReason } = data;
  const statusInfo = STATUS_INFO[t.status] || { label: t.status?.toUpperCase(), color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
  const hasEntryFee = (t.entry_fee_cents || 0) > 0;
  const hasPrizePool = (t.prize_pool_cents || 0) > 0;
  const hasBerryPrize = (t.berry_prize_pool || 0) > 0;

  // Sort participants by score (descending) for standings
  const sortedParticipants = [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.seed || 0) - (b.seed || 0);
  });

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      {/* BACK LINK */}
      <div className="px-4 sm:px-6 lg:px-8">
        <Link href="/league" className="inline-flex items-center gap-1.5 text-sm text-ccb-muted hover:text-ccb-text transition-colors">
          <ArrowLeft className="w-4 h-4" /> Compete
        </Link>
      </div>

      {/* TOURNAMENT HEADER */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-black truncate">{t.name}</h1>
                {t.description && <p className="text-sm text-ccb-muted mt-1">{t.description}</p>}
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>

            {/* STATS GRID */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-ccb-surface rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ccb-muted font-semibold mb-1">
                  <Swords className="w-3 h-3" /> Type
                </div>
                <div className="text-sm font-bold capitalize">{t.type}</div>
              </div>
              <div className="bg-ccb-surface rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ccb-muted font-semibold mb-1">
                  <Clock className="w-3 h-3" /> Time Control
                </div>
                <div className="text-sm font-bold">{t.initial_minutes}+{t.increment_seconds}</div>
              </div>
              <div className="bg-ccb-surface rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ccb-muted font-semibold mb-1">
                  <Users className="w-3 h-3" /> Players
                </div>
                <div className="text-sm font-bold">
                  {data.participantCount}{t.max_players ? `/${t.max_players}` : ''}
                </div>
              </div>
              <div className="bg-ccb-surface rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ccb-muted font-semibold mb-1">
                  <Calendar className="w-3 h-3" /> Starts
                </div>
                <div className="text-sm font-bold">{formatDate(t.starts_at)}</div>
              </div>
            </div>

            {/* PRIZE & FEE ROW */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {hasPrizePool && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30">
                  <Trophy className="w-4 h-4 text-ccb-accent" />
                  <span className="text-xs font-bold text-ccb-accent">{formatMoney(t.prize_pool_cents)} Prize Pool</span>
                </div>
              )}
              {hasBerryPrize && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30">
                  <Zap className="w-4 h-4 text-ccb-primary" />
                  <span className="text-xs font-bold text-ccb-primary">{t.berry_prize_pool} Berries</span>
                </div>
              )}
              {hasEntryFee ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-surface border border-ccb-border">
                  <DollarSign className="w-4 h-4 text-ccb-muted" />
                  <span className="text-xs font-bold">{formatMoney(t.entry_fee_cents)} Entry</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-success/10 border border-ccb-success/30">
                  <CheckCircle className="w-4 h-4 text-ccb-success" />
                  <span className="text-xs font-bold text-ccb-success">Free Entry</span>
                </div>
              )}
              {t.rounds && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-surface border border-ccb-border">
                  <Award className="w-4 h-4 text-ccb-muted" />
                  <span className="text-xs font-bold">{t.rounds} Rounds</span>
                </div>
              )}
              {t.min_rating && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-surface border border-ccb-border">
                  <Star className="w-4 h-4 text-ccb-muted" />
                  <span className="text-xs font-bold">{t.min_rating}{t.max_rating ? `–${t.max_rating}` : '+'} Rating</span>
                </div>
              )}
            </div>
          </div>

          {/* ACTION BAR */}
          <div className="border-t border-ccb-border p-4">
            {t.status === 'upcoming' && (
              <>
                {isRegistered ? (
                  <button
                    onClick={handleLeave}
                    disabled={actionLoading}
                    className="w-full py-3 rounded-xl bg-ccb-surface border border-ccb-border text-ccb-text font-bold text-sm hover:bg-ccb-danger/10 hover:border-ccb-danger/30 hover:text-ccb-danger transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" /> Withdraw
                  </button>
                ) : canJoin ? (
                  <button
                    onClick={handleJoin}
                    disabled={actionLoading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-ccb-primary/20 flex items-center justify-center gap-2"
                  >
                    {hasEntryFee ? (
                      <><DollarSign className="w-4 h-4" /> Join — {formatMoney(t.entry_fee_cents)}</>
                    ) : (
                      <><Swords className="w-4 h-4" /> Join Tournament</>
                    )}
                  </button>
                ) : (
                  <div className="w-full py-3 rounded-xl bg-ccb-surface border border-ccb-border text-center">
                    <p className="text-sm text-ccb-muted">
                      {joinReason === 'not_authenticated' ? 'Sign in to join this tournament' :
                       joinReason === 'full' ? 'Tournament is full' :
                       joinReason === 'rating_too_low' ? `Requires rating ${t.min_rating}+` :
                       joinReason === 'rating_too_high' ? `Max rating ${t.max_rating}` :
                       'Not available'}
                    </p>
                  </div>
                )}
              </>
            )}

            {t.status === 'active' && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-ccb-success">
                  <div className="w-2 h-2 rounded-full bg-ccb-success animate-pulse" />
                  <span className="font-bold">Round {t.current_round} of {t.rounds}</span>
                </div>
                {isAdmin && (
                  <button
                    onClick={handleAdvanceRound}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-ccb-primary text-white font-bold text-xs hover:bg-ccb-primary/90 transition-all flex items-center gap-1.5"
                  >
                    <ChevronRight className="w-4 h-4" /> Advance Round
                  </button>
                )}
              </div>
            )}

            {t.status === 'upcoming' && isAdmin && (
              <button
                onClick={handleStart}
                disabled={actionLoading || data.participantCount < (t.min_players || 2)}
                className="w-full mt-2 py-2.5 rounded-xl bg-ccb-success/10 border border-ccb-success/30 text-ccb-success font-bold text-xs hover:bg-ccb-success/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" /> Start Tournament Now
              </button>
            )}

            {(t.status === 'completed' || t.status === 'finished') && (
              <div className="text-center py-2">
                <Trophy className="w-6 h-6 text-ccb-accent mx-auto mb-1" />
                <p className="text-sm font-bold text-ccb-muted">Tournament Completed</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex gap-2">
          {(['standings', 'rounds', 'info'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all capitalize ${
                activeTab === tab
                  ? 'bg-ccb-primary text-white'
                  : 'bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="px-4 sm:px-6 lg:px-8">
        {/* STANDINGS TAB */}
        {activeTab === 'standings' && (
          <div className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-ccb-border">
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-ccb-accent" /> Standings
              </h3>
            </div>
            {sortedParticipants.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-8 h-8 text-ccb-muted mx-auto mb-2" />
                <p className="text-sm text-ccb-muted">No participants yet</p>
              </div>
            ) : (
              <div className="divide-y divide-ccb-border">
                {/* HEADER ROW */}
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-ccb-muted font-semibold">
                  <div className="col-span-1">#</div>
                  <div className="col-span-5">Player</div>
                  <div className="col-span-2 text-center">Score</div>
                  <div className="col-span-2 text-center hidden sm:block">W/D/L</div>
                  <div className="col-span-2 text-center sm:col-span-2">P</div>
                </div>
                {sortedParticipants.map((p, i) => {
                  const rank = p.final_rank || (i + 1);
                  const isTop3 = rank <= 3;
                  const medalColor = rank === 1 ? 'text-ccb-accent' : rank === 2 ? 'text-ccb-muted' : rank === 3 ? 'text-amber-600 dark:text-amber-400' : '';
                  return (
                    <Link
                      key={p.player_id}
                      href={`/profile/${p.profile?.username}`}
                      className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-ccb-surface transition-colors items-center"
                    >
                      <div className={`col-span-1 text-sm font-bold ${medalColor || 'text-ccb-muted'}`}>
                        {isTop3 && rank === 1 ? <Crown className="w-4 h-4" /> : rank}
                      </div>
                      <div className="col-span-5 flex items-center gap-2 min-w-0">
                        {p.profile?.avatar_url && (
                          <img src={p.profile.avatar_url} alt="" className="w-6 h-6 rounded-full shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{p.profile?.display_name || p.profile?.username || 'Unknown'}</div>
                          <div className="text-[10px] text-ccb-muted">Rating: {p.profile?.rating || '—'}</div>
                        </div>
                      </div>
                      <div className="col-span-2 text-center text-sm font-bold">{p.score.toFixed(1)}</div>
                      <div className="col-span-2 text-center text-xs text-ccb-muted hidden sm:block">{p.wins}/{p.draws}/{p.losses}</div>
                      <div className="col-span-2 text-center text-xs text-ccb-muted">{p.games_played}</div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ROUNDS TAB */}
        {activeTab === 'rounds' && (
          <div className="space-y-4">
            {rounds.length === 0 ? (
              <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
                <Swords className="w-8 h-8 text-ccb-muted mx-auto mb-2" />
                <p className="text-sm text-ccb-muted">
                  {t.status === 'upcoming' ? 'Pairings will appear when the tournament starts' : 'No rounds generated yet'}
                </p>
              </div>
            ) : (
              rounds.map((round) => (
                <div key={round.id} className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-ccb-border">
                    <h4 className="text-sm font-bold flex items-center gap-1.5">
                      <Swords className="w-4 h-4 text-ccb-primary" /> Round {round.round_number}
                    </h4>
                    {round.is_complete ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-success/10 text-ccb-success border border-ccb-success/30">COMPLETE</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-accent/10 text-ccb-accent border border-ccb-accent/30">IN PROGRESS</span>
                    )}
                  </div>
                  <div className="divide-y divide-ccb-border">
                    {round.pairings.map((pairing, idx) => {
                      const hasResult = pairing.result !== null && pairing.result !== undefined;
                      const whiteWon = hasResult && pairing.result === 'white';
                      const blackWon = hasResult && pairing.result === 'black';
                      const isDraw = hasResult && pairing.result === 'draw';

                      return (
                        <div key={idx} className="p-3">
                          {pairing.bye ? (
                            <div className="flex items-center gap-3 py-1">
                              <div className="flex-1 text-sm font-medium">{pairing.whiteName}</div>
                              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-success/10 text-ccb-success">BYE</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 sm:gap-3">
                              {/* WHITE */}
                              <div className={`flex-1 flex items-center gap-2 min-w-0 ${whiteWon ? 'font-bold' : ''}`}>
                                <span className={`text-sm truncate ${whiteWon ? 'text-ccb-success' : isDraw ? '' : blackWon ? 'text-ccb-muted' : ''}`}>
                                  {pairing.whiteName}
                                </span>
                                <span className="text-[10px] text-ccb-muted shrink-0">{pairing.whiteRating}</span>
                              </div>
                              {/* RESULT */}
                              <div className="shrink-0">
                                {hasResult ? (
                                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                                    isDraw ? 'bg-ccb-muted/10 text-ccb-muted' :
                                    whiteWon ? 'bg-ccb-success/10 text-ccb-success' :
                                    'bg-ccb-success/10 text-ccb-success'
                                  }`}>
                                    {isDraw ? '½-½' : whiteWon ? '1-0' : '0-1'}
                                  </span>
                                ) : (
                                  pairing.game_id ? (
                                    <Link
                                      href={`/game/${pairing.game_id}`}
                                      className="text-xs font-bold px-3 py-1 rounded-lg bg-ccb-primary text-white hover:bg-ccb-primary/90 transition-colors"
                                    >
                                      Play
                                    </Link>
                                  ) : (
                                    <span className="text-xs text-ccb-muted px-2 py-1">vs</span>
                                  )
                                )}
                              </div>
                              {/* BLACK */}
                              <div className={`flex-1 flex items-center justify-end gap-2 min-w-0 ${blackWon ? 'font-bold' : ''}`}>
                                <span className="text-[10px] text-ccb-muted shrink-0">{pairingBlackRating(pairing)}</span>
                                <span className={`text-sm truncate ${blackWon ? 'text-ccb-success' : isDraw ? '' : whiteWon ? 'text-ccb-muted' : ''}`}>
                                  {pairing.blackName}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2">Details</h4>
              <div className="space-y-2">
                <InfoRow label="Format" value={<span className="capitalize">{t.type}</span>} />
                <InfoRow label="Time Control" value={`${t.initial_minutes} min + ${t.increment_seconds} sec`} />
                <InfoRow label="Rounds" value={t.rounds || '—'} />
                <InfoRow label="Min Players" value={t.min_players || 2} />
                {t.max_players && <InfoRow label="Max Players" value={t.max_players} />}
                {t.min_rating && <InfoRow label="Min Rating" value={t.min_rating} />}
                {t.max_rating && <InfoRow label="Max Rating" value={t.max_rating} />}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2">Schedule</h4>
              <div className="space-y-2">
                <InfoRow label="Starts" value={`${formatDate(t.starts_at)} at ${formatTime(t.starts_at)}`} />
                {t.ends_at && <InfoRow label="Ends" value={`${formatDate(t.ends_at)} at ${formatTime(t.ends_at)}`} />}
                {t.duration_minutes && <InfoRow label="Duration" value={`${t.duration_minutes} min`} />}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2">Prizes</h4>
              <div className="space-y-2">
                {hasPrizePool && <InfoRow label="Cash Prize Pool" value={formatMoney(t.prize_pool_cents)} />}
                {hasBerryPrize && <InfoRow label="Berry Prize Pool" value={`${t.berry_prize_pool} berries`} />}
                {hasEntryFee && <InfoRow label="Entry Fee" value={formatMoney(t.entry_fee_cents)} />}
                {!hasPrizePool && !hasBerryPrize && <p className="text-sm text-ccb-muted">No prize pool for this tournament.</p>}
              </div>
            </div>

            {t.description && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2">Description</h4>
                <p className="text-sm text-ccb-text leading-relaxed">{t.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function pairingBlackRating(pairing: any) {
  return pairing.blackRating || 0;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ccb-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
