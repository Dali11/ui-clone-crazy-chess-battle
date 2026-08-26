'use client';

import React, { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Trophy, Users, Calendar, Clock, DollarSign, RefreshCw, AlertCircle,
  Crown, Star, Swords, ChevronRight, ArrowLeft, Zap, Award, Medal,
  CheckCircle, XCircle, Play, Settings, Target, Gamepad2,
} from 'lucide-react';

interface TournamentData {
  success: boolean;
  isAdmin: boolean;
  isRegistered: boolean;
  currentPlayerId: string | null;
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
    pool_source: string | null;
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
    starts_at?: string | null;
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
  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'standings' | 'rounds' | 'info'>('standings');
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();
  const redirectedRef = useRef<string | null>(null);

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

  // Auto-redirect to game when tournament is live and user has a pending game
  useEffect(() => {
    if (!data || !data.isRegistered || !data.currentPlayerId || data.tournament.status !== 'active') return;

    const currentRound = data.rounds?.find(r => r.round_number === data.tournament.current_round);
    if (!currentRound || currentRound.is_complete) return;

    // Find the user's pairing
    const myPairing = currentRound.pairings?.find(
      p => p.white === data.currentPlayerId || p.black === data.currentPlayerId
    );
    if (!myPairing || !myPairing.game_id || myPairing.result !== null) return;

    // Don't redirect if already redirected to this game
    if (redirectedRef.current === myPairing.game_id) return;

    // Don't auto-redirect if the round hasn't started yet (scheduled start in the future)
    const currentRd = data.rounds?.find(r => r.round_number === data.tournament.current_round);
    if (currentRd?.starts_at && new Date(currentRd.starts_at).getTime() > Date.now()) return;

    redirectedRef.current = myPairing.game_id;

    // Brief delay so the page renders first, then redirect
    setRedirecting(true);
    const timer = setTimeout(() => {
      router.push(`/game/${myPairing.game_id}`);
    }, 800);
    return () => clearTimeout(timer);
  }, [data, router]);

  // Auto-refresh when tournament is live — faster (5s) when round is starting soon
  useEffect(() => {
    if (!data || data.tournament.status !== 'active') return;
    // Check if current round is starting soon
    const currentRd = data.rounds?.find(r => r.round_number === data.tournament.current_round);
    const startsIn = currentRd?.starts_at ? Math.max(0, Math.floor((new Date(currentRd.starts_at).getTime() - Date.now()) / 1000)) : 0;
    const startingSoon = !!currentRd?.starts_at && startsIn > 0;
    const intervalMs = startingSoon ? 5000 : 15000;
    const interval = setInterval(() => fetchData(), intervalMs);
    return () => clearInterval(interval);
  }, [data?.tournament.status, data?.rounds]);

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
      <div className="space-y-4 pb-20 sm:pb-8 animate-pulse px-4 sm:px-6 lg:px-8 pt-4">
        <div className="h-5 w-24 bg-ccb-surface rounded-lg" />
        <div className="bg-ccb-card border border-ccb-border rounded-2xl h-56" />
        <div className="bg-ccb-card border border-ccb-border rounded-2xl h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 pb-20">
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center max-w-md mx-auto">
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

  const { tournament: t, participants, rounds, isAdmin, isRegistered, currentPlayerId, canJoin, joinReason } = data;

  // Find the current round and check if it has a scheduled start time
  const currentRoundData = rounds?.find(r => r.round_number === t.current_round);
  const roundStartsAt = currentRoundData?.starts_at;
  const roundStartsIn = roundStartsAt ? Math.max(0, Math.floor((new Date(roundStartsAt).getTime() - Date.now()) / 1000)) : 0;
  const isRoundStartingSoon = roundStartsAt && roundStartsIn > 0;
  const hasEntryFee = (t.entry_fee_cents || 0) > 0;
  const hasPrizePool = (t.prize_pool_cents || 0) > 0;
  const hasBerryPrize = (t.berry_prize_pool || 0) > 0;
  const isLive = t.status === 'active';

  // Show redirecting overlay
  if (redirecting) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-3 border-ccb-primary border-t-transparent animate-spin" />
        <p className="text-sm font-medium text-ccb-muted">Redirecting to your game…</p>
      </div>
    );
  }
  const isFinished = t.status === 'finished' || t.status === 'completed';

  const statusInfo = {
    upcoming: { label: 'UPCOMING', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30', dot: 'bg-blue-400' },
    active: { label: 'LIVE', color: 'text-ccb-success bg-ccb-success/10 border-ccb-success/30', dot: 'bg-ccb-success animate-pulse' },
    pending_approval: { label: 'PENDING', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', dot: 'bg-yellow-400' },
    finished: { label: 'COMPLETED', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30', dot: 'bg-ccb-muted' },
    completed: { label: 'COMPLETED', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30', dot: 'bg-ccb-muted' },
  }[t.status] || { label: t.status?.toUpperCase(), color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30', dot: 'bg-ccb-muted' };

  const sortedParticipants = [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.seed || 0) - (b.seed || 0);
  });

  const top3 = sortedParticipants.slice(0, 3);

  return (
    <div className="pb-20 sm:pb-8">
      {/* BACK LINK */}
      <div className="px-5 sm:px-6 lg:px-8 mb-4">
        <Link href="/league" className="inline-flex items-center gap-1.5 text-sm text-ccb-muted hover:text-ccb-text transition-colors">
          <ArrowLeft className="w-4 h-4" /> Compete
        </Link>
      </div>

      {/* HERO HEADER */}
      <div className="px-5 sm:px-6 lg:px-8 mb-5">
        <div className={`relative overflow-hidden rounded-2xl border ${isLive ? 'border-ccb-success/30' : 'border-ccb-border'} bg-gradient-to-br from-ccb-card via-ccb-card to-ccb-surface`}>
          {isLive && <div className="absolute -right-20 -top-20 w-64 h-64 bg-ccb-success/5 rounded-full blur-3xl pointer-events-none" />}
          {!isLive && hasPrizePool && <div className="absolute -right-20 -top-20 w-64 h-64 bg-ccb-accent/5 rounded-full blur-3xl pointer-events-none" />}

          <div className="relative p-5 sm:p-6 space-y-4">
            {/* TITLE ROW */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  isLive ? 'bg-ccb-success/10 border border-ccb-success/30' :
                  isFinished ? 'bg-ccb-muted/10 border border-ccb-muted/30' :
                  'bg-ccb-accent/10 border border-ccb-accent/30'
                }`}>
                  {isFinished ? <Trophy className="w-5 h-5 text-ccb-accent" /> :
                   isLive ? <Swords className="w-5 h-5 text-ccb-success" /> :
                   <Swords className="w-5 h-5 text-ccb-accent" />}
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-black truncate">{t.name}</h1>
                  {t.description && (
                    <p className="text-xs sm:text-sm text-ccb-muted mt-0.5 line-clamp-2">{t.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusInfo.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                      {statusInfo.label}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-surface border border-ccb-border text-ccb-muted uppercase">
                      {t.type}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      hasEntryFee ? 'bg-ccb-primary/10 text-ccb-primary border-ccb-primary/30' : 'bg-ccb-success/10 text-ccb-success border-ccb-success/30'
                    }`}>
                      {hasEntryFee ? 'PAID' : 'FREE'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* STATS GRID */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <StatTile icon={Clock} label="Time Control" value={`${t.initial_minutes}+${t.increment_seconds}`} />
              <StatTile icon={Users} label="Players" value={`${data.participantCount}${t.max_players ? `/${t.max_players}` : ''}`} />
              <StatTile icon={Calendar} label="Starts" value={formatDate(t.starts_at)} />
              <StatTile icon={Award} label="Rounds" value={t.rounds || '—'} />
            </div>

            {/* PRIZE & FEE BADGES */}
            <div className="flex items-center gap-2 flex-wrap">
              {hasPrizePool && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30">
                  <Trophy className="w-3.5 h-3.5 text-ccb-accent" />
                  <span className="text-xs font-bold text-ccb-accent">{formatMoney(t.prize_pool_cents)} Pool</span>
                </div>
              )}
              {hasBerryPrize && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30">
                  <Zap className="w-3.5 h-3.5 text-ccb-primary" />
                  <span className="text-xs font-bold text-ccb-primary">{t.berry_prize_pool} Berries</span>
                </div>
              )}
              {hasEntryFee ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-surface border border-ccb-border">
                  <DollarSign className="w-3.5 h-3.5 text-ccb-muted" />
                  <span className="text-xs font-bold">{formatMoney(t.entry_fee_cents)} Entry</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-success/10 border border-ccb-success/30">
                  <CheckCircle className="w-3.5 h-3.5 text-ccb-success" />
                  <span className="text-xs font-bold text-ccb-success">Free Entry</span>
                </div>
              )}
              {t.min_rating ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-surface border border-ccb-border">
                  <Star className="w-3.5 h-3.5 text-ccb-muted" />
                  <span className="text-xs font-bold">{t.min_rating}{t.max_rating ? `–${t.max_rating}` : '+'}</span>
                </div>
              ) : null}
            </div>

            {/* ACTION BAR */}
            <div className="pt-3 border-t border-ccb-border">
              {t.status === 'upcoming' && (
                <>
                  {isRegistered ? (
                    <button
                      onClick={handleLeave}
                      disabled={actionLoading}
                      className="w-full py-3 rounded-xl bg-ccb-surface border border-ccb-border text-ccb-text font-bold text-sm hover:bg-ccb-danger/10 hover:border-ccb-danger/30 hover:text-ccb-danger transition-all flex items-center justify-center gap-2"
                    >
                      {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Withdraw
                    </button>
                  ) : canJoin ? (
                    <button
                      onClick={handleJoin}
                      disabled={actionLoading}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-ccb-primary/20 flex items-center justify-center gap-2"
                    >
                      {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                        hasEntryFee ? <><DollarSign className="w-4 h-4" /> Join — {formatMoney(t.entry_fee_cents)}</> :
                        <><Swords className="w-4 h-4" /> Join Tournament</>
                      }
                    </button>
                  ) : (
                    <div className="w-full py-3 rounded-xl bg-ccb-surface border border-ccb-border text-center">
                      <p className="text-sm text-ccb-muted">
                        {joinReason === 'not_authenticated' ? 'Sign in to join this tournament' :
                         joinReason === 'already_registered' ? 'Already registered' :
                         joinReason === 'full' ? 'Tournament is full' :
                         joinReason === 'rating_too_low' ? `Requires rating ${t.min_rating}+` :
                         joinReason === 'rating_too_high' ? `Max rating ${t.max_rating}` :
                         joinReason === 'already_started' ? 'Tournament has started' :
                         joinReason === 'completed' ? 'Tournament has ended' :
                         'Not available to join'}
                      </p>
                    </div>
                  )}
                  {isAdmin && data.participantCount >= (t.min_players || 2) && (
                    <button
                      onClick={handleStart}
                      disabled={actionLoading}
                      className="w-full mt-2 py-2.5 rounded-xl bg-ccb-success/10 border border-ccb-success/30 text-ccb-success font-bold text-xs hover:bg-ccb-success/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" /> Start Tournament Now
                    </button>
                  )}
                </>
              )}

              {isLive && (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-ccb-success">
                    <div className="w-2 h-2 rounded-full bg-ccb-success animate-pulse" />
                    <span className="font-bold">Round {t.current_round} of {t.rounds}</span>
                    {isRoundStartingSoon && (
                      <span className="ml-3 text-xs font-bold px-2.5 py-1 rounded-full bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30 tabular-nums animate-pulse">
                        ⏱ Starts in {Math.floor(roundStartsIn / 60)}:{(roundStartsIn % 60).toString().padStart(2, '0')}
                      </span>
                    )}
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

              {isFinished && (
                <div className="text-center py-2 flex items-center justify-center gap-2">
                  <Trophy className="w-5 h-5 text-ccb-accent" />
                  <p className="text-sm font-bold text-ccb-muted">Tournament Completed</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="px-5 sm:px-6 lg:px-8 mb-4">
        <div className="flex gap-1.5 p-1 bg-ccb-surface rounded-xl border border-ccb-border">
          {(['standings', 'rounds', 'info'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all capitalize flex items-center justify-center gap-1.5 ${
                activeTab === tab
                  ? 'bg-ccb-primary text-white shadow-sm'
                  : 'text-ccb-muted hover:text-ccb-text'
              }`}
            >
              {tab === 'standings' && <Trophy className="w-3.5 h-3.5" />}
              {tab === 'rounds' && <Swords className="w-3.5 h-3.5" />}
              {tab === 'info' && <Settings className="w-3.5 h-3.5" />}
              {tab}
              {tab === 'standings' && sortedParticipants.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === tab ? 'bg-white/20' : 'bg-ccb-border/40'}`}>
                  {sortedParticipants.length}
                </span>
              )}
              {tab === 'rounds' && rounds.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === tab ? 'bg-white/20' : 'bg-ccb-border/40'}`}>
                  {rounds.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="px-5 sm:px-6 lg:px-8">

        {/* ========== STANDINGS ========== */}
        {activeTab === 'standings' && (
          <div className="space-y-3">
            {sortedParticipants.length === 0 ? (
              <div className="bg-ccb-card border border-ccb-border rounded-2xl p-10 text-center">
                <Users className="w-10 h-10 text-ccb-muted mx-auto mb-3" />
                <h3 className="font-bold text-sm mb-1">No participants yet</h3>
                <p className="text-xs text-ccb-muted">Players will appear here once they join.</p>
              </div>
            ) : (
              <>
                {/* PODIUM — Top 3 (only when finished) */}
                {isFinished && top3.length >= 3 && (
                  <div className="grid grid-cols-3 gap-2.5">
                    {/* 2nd */}
                    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-3 text-center flex flex-col justify-end" style={{ minHeight: '110px' }}>
                      <Medal className="w-6 h-6 text-ccb-muted mx-auto mb-1" />
                      <div className="text-xs font-bold truncate">{top3[1].profile?.display_name || top3[1].profile?.username || '—'}</div>
                      <div className="text-[10px] text-ccb-muted">{top3[1].score.toFixed(1)} pts</div>
                      <div className="text-[10px] font-bold text-ccb-muted mt-1">2nd</div>
                    </div>
                    {/* 1st */}
                    <div className="bg-gradient-to-b from-ccb-accent/10 to-ccb-card border border-ccb-accent/30 rounded-2xl p-3 text-center flex flex-col justify-start" style={{ minHeight: '130px' }}>
                      <Crown className="w-7 h-7 text-ccb-accent mx-auto mb-1" />
                      <div className="text-xs font-bold truncate">{top3[0].profile?.display_name || top3[0].profile?.username || '—'}</div>
                      <div className="text-[10px] text-ccb-accent font-semibold">{top3[0].score.toFixed(1)} pts</div>
                      <div className="text-[10px] font-bold text-ccb-accent mt-1">CHAMPION</div>
                    </div>
                    {/* 3rd */}
                    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-3 text-center flex flex-col justify-end" style={{ minHeight: '100px' }}>
                      <Award className="w-6 h-6 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                      <div className="text-xs font-bold truncate">{top3[2].profile?.display_name || top3[2].profile?.username || '—'}</div>
                      <div className="text-[10px] text-ccb-muted">{top3[2].score.toFixed(1)} pts</div>
                      <div className="text-[10px] font-bold text-ccb-muted mt-1">3rd</div>
                    </div>
                  </div>
                )}

                {/* STANDINGS TABLE */}
                <div className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-ccb-surface border-b border-ccb-border text-[10px] uppercase tracking-wider text-ccb-muted font-semibold">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-6 sm:col-span-5">Player</div>
                    <div className="col-span-2 text-center">Score</div>
                    <div className="col-span-2 text-center hidden sm:block">W/L/D</div>
                    <div className="col-span-3 sm:col-span-2 text-center">Played</div>
                  </div>

                  {/* Rows */}
                  {sortedParticipants.map((p, i) => {
                    const rank = p.final_rank || (i + 1);
                    const isTop3 = rank <= 3;
                    const medalColor = rank === 1 ? 'text-ccb-accent' : rank === 2 ? 'text-ccb-muted' : rank === 3 ? 'text-amber-600 dark:text-amber-400' : '';
                    return (
                      <Link
                        key={p.player_id}
                        href={`/profile/${p.profile?.username}`}
                        className={`grid grid-cols-12 gap-2 px-5 py-3 hover:bg-ccb-surface transition-colors items-center border-b border-ccb-border/50 last:border-0 ${
                          isTop3 ? 'bg-ccb-surface/30' : ''
                        }`}
                      >
                        <div className={`col-span-1 text-center text-sm font-bold ${medalColor || 'text-ccb-muted'}`}>
                          {isTop3 && rank === 1 ? <Crown className="w-4 h-4 mx-auto" /> : rank}
                        </div>
                        <div className="col-span-6 sm:col-span-5 flex items-center gap-2.5 min-w-0">
                          {p.profile?.avatar_url ? (
                            <img src={p.profile.avatar_url} alt="" className="w-7 h-7 rounded-full shrink-0 border border-ccb-border" />
                          ) : (
                            <div className="w-7 h-7 rounded-full shrink-0 bg-ccb-surface border border-ccb-border flex items-center justify-center text-[10px] font-bold text-ccb-muted">
                              {(p.profile?.display_name || p.profile?.username || '?').charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{p.profile?.display_name || p.profile?.username || 'Unknown'}</div>
                            <div className="text-[10px] text-ccb-muted">Rating: {p.profile?.rating || '—'}</div>
                          </div>
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="text-sm font-bold">{p.score.toFixed(1)}</span>
                        </div>
                        <div className="col-span-2 text-center text-xs text-ccb-muted hidden sm:block">
                          <span className="text-ccb-success font-medium">{p.wins}</span>/
                          <span className="text-ccb-danger">{p.losses}</span>/
                          <span>{p.draws}</span>
                        </div>
                        <div className="col-span-3 sm:col-span-2 text-center text-xs text-ccb-muted">
                          {p.games_played}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== ROUNDS ========== */}
        {activeTab === 'rounds' && (
          <div className="space-y-3">
            {rounds.length === 0 ? (
              <div className="bg-ccb-card border border-ccb-border rounded-2xl p-10 text-center">
                <Swords className="w-10 h-10 text-ccb-muted mx-auto mb-3" />
                <h3 className="font-bold text-sm mb-1">No rounds yet</h3>
                <p className="text-xs text-ccb-muted">
                  {t.status === 'upcoming' ? 'Pairings will appear when the tournament starts.' : 'No rounds have been generated.'}
                </p>
              </div>
            ) : (
              rounds.map((round) => (
                <div key={round.id} className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
                  {/* Round header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-ccb-border">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center">
                        <Swords className="w-4 h-4 text-ccb-primary" />
                      </div>
                      <h4 className="text-sm font-bold">Round {round.round_number}</h4>
                    </div>
                    {round.is_complete ? (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-ccb-success/10 text-ccb-success border border-ccb-success/30">COMPLETE</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-ccb-accent/10 text-ccb-accent border border-ccb-accent/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-ccb-accent animate-pulse" />
                        IN PROGRESS
                      </span>
                    )}
                  </div>

                  {/* Pairings */}
                  <div className="divide-y divide-ccb-border/50">
                    {round.pairings.map((pairing, idx) => {
                      const hasResult = pairing.result !== null && pairing.result !== undefined;
                      const whiteWon = hasResult && pairing.result === 'white';
                      const blackWon = hasResult && pairing.result === 'black';
                      const isDraw = hasResult && pairing.result === 'draw';

                      return (
                        <div key={idx} className="px-5 py-3">
                          {pairing.bye ? (
                            <div className="flex items-center gap-3 py-1">
                              <div className="w-7 h-7 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-[10px] font-bold text-ccb-muted shrink-0">
                                {(pairing.whiteName || '?').charAt(0)}
                              </div>
                              <div className="flex-1 text-sm font-medium truncate">{pairing.whiteName}</div>
                              <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-ccb-success/10 text-ccb-success border border-ccb-success/30">BYE</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              {/* White */}
                              <div className={`flex-1 flex items-center gap-2 min-w-0 ${whiteWon ? '' : blackWon || isDraw ? 'opacity-50' : ''}`}>
                                <div className="w-7 h-7 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-[10px] font-bold text-ccb-muted shrink-0">
                                  {(pairing.whiteName || '?').charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <div className={`text-sm truncate ${whiteWon ? 'font-bold text-ccb-success' : ''}`}>
                                    {pairing.whiteName}
                                  </div>
                                  <div className="text-[10px] text-ccb-muted">{pairing.whiteRating}</div>
                                </div>
                              </div>

                              {/* Result / Play button */}
                              <div className="shrink-0">
                                {hasResult ? (
                                  <span className={`text-xs font-bold px-2.5 py-1.5 rounded-lg ${
                                    isDraw ? 'bg-ccb-muted/10 text-ccb-muted' :
                                    whiteWon ? 'bg-ccb-success/10 text-ccb-success' :
                                    'bg-ccb-success/10 text-ccb-success'
                                  }`}>
                                    {isDraw ? '½-½' : whiteWon ? '1-0' : '0-1'}
                                  </span>
                                ) : pairing.game_id ? (
                                  <Link
                                    href={`/game/${pairing.game_id}`}
                                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-ccb-primary text-white hover:bg-ccb-primary/90 transition-colors flex items-center gap-1"
                                  >
                                    <Gamepad2 className="w-3.5 h-3.5" /> {isRoundStartingSoon ? 'Enter' : 'Play'}
                                  </Link>
                                ) : (
                                  <span className="text-xs text-ccb-muted px-2">vs</span>
                                )}
                              </div>

                              {/* Black */}
                              <div className={`flex-1 flex items-center justify-end gap-2 min-w-0 ${blackWon ? '' : whiteWon || isDraw ? 'opacity-50' : ''}`}>
                                <div className="min-w-0 text-right">
                                  <div className={`text-sm truncate ${blackWon ? 'font-bold text-ccb-success' : ''}`}>
                                    {pairing.blackName}
                                  </div>
                                  <div className="text-[10px] text-ccb-muted">{pairing.blackRating || '—'}</div>
                                </div>
                                <div className="w-7 h-7 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-[10px] font-bold text-ccb-muted shrink-0">
                                  {(pairing.blackName || '?').charAt(0)}
                                </div>
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

        {/* ========== INFO ========== */}
        {activeTab === 'info' && (
          <div className="space-y-3">
            {/* Details */}
            <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-3 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Tournament Details
              </h4>
              <div className="space-y-3">
                <InfoRow icon={Swords} label="Format" value={<span className="capitalize">{t.type}</span>} />
                <InfoRow icon={Clock} label="Time Control" value={`${t.initial_minutes} min + ${t.increment_seconds} sec`} />
                <InfoRow icon={Award} label="Rounds" value={t.rounds || '—'} />
                <InfoRow icon={Users} label="Min Players" value={t.min_players || 2} />
                {t.max_players && <InfoRow icon={Users} label="Max Players" value={t.max_players} />}
                {t.min_rating ? <InfoRow icon={Star} label="Min Rating" value={t.min_rating} /> : null}
                {t.max_rating ? <InfoRow icon={Star} label="Max Rating" value={t.max_rating} /> : null}
              </div>
            </div>

            {/* Schedule */}
            <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </h4>
              <div className="space-y-3">
                <InfoRow icon={Calendar} label="Starts" value={`${formatDate(t.starts_at)} · ${formatTime(t.starts_at)}`} />
                {t.ends_at && <InfoRow icon={Calendar} label="Ends" value={`${formatDate(t.ends_at)} · ${formatTime(t.ends_at)}`} />}
                {t.duration_minutes && <InfoRow icon={Clock} label="Duration" value={`${t.duration_minutes} min`} />}
              </div>
            </div>

            {/* Prizes */}
            <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-3 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" /> Prizes &amp; Entry
              </h4>
              <div className="space-y-3">
                {hasPrizePool && <InfoRow icon={Trophy} label={t.pool_source === 'fixed' ? "Cash Prize Pool (Fixed)" : "Cash Prize Pool (Entry Fees)"} value={formatMoney(t.prize_pool_cents)} />}
                {hasBerryPrize && <InfoRow icon={Zap} label="Berry Prize Pool" value={`${t.berry_prize_pool} berries`} />}
                {hasEntryFee ? (
                  <InfoRow icon={DollarSign} label="Entry Fee" value={formatMoney(t.entry_fee_cents)} />
                ) : (
                  <InfoRow icon={CheckCircle} label="Entry Fee" value="Free" />
                )}
                {!hasPrizePool && !hasBerryPrize && (
                  <p className="text-xs text-ccb-muted">{t.entry_fee_cents > 0 ? "Prize pool grows as players join." : "No prize pool for this tournament."}</p>
                )}
              </div>
            </div>

            {/* Description */}
            {t.description && (
              <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-3">Description</h4>
                <p className="text-sm text-ccb-text leading-relaxed whitespace-pre-wrap">{t.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="bg-ccb-surface/50 rounded-xl px-3 py-2.5 border border-ccb-border/50">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ccb-muted font-semibold mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-sm font-bold truncate">{value}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ccb-muted flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
