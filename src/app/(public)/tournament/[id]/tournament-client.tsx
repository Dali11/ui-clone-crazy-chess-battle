'use client';

import React, { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Trophy, Users, Calendar, Clock, DollarSign, RefreshCw, AlertCircle,
  Crown, Star, Swords, ChevronRight, ArrowLeft, Zap, Award, Medal,
  CheckCircle, XCircle, Play, Settings, Target, Gamepad2, LogIn, UserPlus,
  Share2, Check, Flame, Eye, History,
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
    entry_fee: number;
    prize_pool: number;
    actual_prize_pool?: number;
    pool_source: string | null;
    thumbnail_url: string | null;
    prize_distribution: any;
    min_players: number;
    knockout_format?: string;
    group_schedule?: Array<{ round: number; pairings: Array<any> }>;
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
  arenaGames?: Array<{
    id: string;
    status: string;
    round: number;
    whiteId: string;
    blackId: string;
    whiteName: string;
    whiteRating: number;
    whiteAvatar?: string | null;
    blackName: string;
    blackRating: number;
    blackAvatar?: string | null;
  }>;
  arenaRecentResults?: Array<{
    id: string;
    whiteId: string;
    blackId: string;
    whiteName: string;
    blackName: string;
    result: 'white' | 'black' | 'draw';
  }>;
  participantCount: number;
}

function formatMoney(amount: number) {
  return `MK${amount.toLocaleString()}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Compute Swiss tiebreaks (Buchholz Cut 1, Sonneborn-Berger) client-side
 * from the rounds/pairings data. This mirrors the server-side calculateTiebreaks
 * so live standings use the same ranking logic as the final results.
 */
function computeTiebreaks(
  participants: Array<{ player_id: string; score: number; wins: number; seed: number }>,
  rounds: Array<{ pairings: Array<{ white: string; black: string; result: string | null; bye: boolean }> }>,
): Map<string, { buchholz_cut1: number; sonneborn_berger: number }> {
  // Build score lookup
  const scoreMap = new Map<string, number>();
  for (const p of participants) {
    scoreMap.set(p.player_id, p.score || 0);
  }

  // Build opponent map and Sonneborn-Berger contributions
  const opponentMap = new Map<string, string[]>();
  const sbMap = new Map<string, number>();

  for (const p of participants) {
    opponentMap.set(p.player_id, []);
    sbMap.set(p.player_id, 0);
  }

  for (const round of rounds) {
    for (const pairing of round.pairings) {
      if (pairing.bye) continue;
      const { white, black, result } = pairing;
      if (!white || !black || !result) continue;

      // Track opponents
      opponentMap.get(white)?.push(black);
      opponentMap.get(black)?.push(white);

      // Sonneborn-Berger: win = opp score * 1, draw = opp score * 0.5
      const whiteOppScore = scoreMap.get(black) || 0;
      const blackOppScore = scoreMap.get(white) || 0;

      if (result === "white") {
        sbMap.set(white, (sbMap.get(white) || 0) + whiteOppScore);
      } else if (result === "black") {
        sbMap.set(black, (sbMap.get(black) || 0) + blackOppScore);
      } else if (result === "draw") {
        sbMap.set(white, (sbMap.get(white) || 0) + whiteOppScore * 0.5);
        sbMap.set(black, (sbMap.get(black) || 0) + blackOppScore * 0.5);
      }
    }
  }

  // Calculate Buchholz Cut 1 for each player
  const result = new Map<string, { buchholz_cut1: number; sonneborn_berger: number }>();
  for (const p of participants) {
    const opponents = opponentMap.get(p.player_id) || [];
    const oppScores = opponents.map((id) => scoreMap.get(id) || 0).sort((a, b) => a - b);
    const buchholz_total = oppScores.reduce((sum, s) => sum + s, 0);
    const buchholz_cut1 = oppScores.length > 1
      ? oppScores.slice(1).reduce((sum, s) => sum + s, 0)
      : buchholz_total;

    result.set(p.player_id, {
      buchholz_cut1,
      sonneborn_berger: sbMap.get(p.player_id) || 0,
    });
  }

  return result;
}

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: t?.name || "Crazy Chess Battles Tournament",
      text: `Check out this chess tournament on Crazy Chess Battles!`,
      url,
    };
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // User cancelled or clipboard failed — silent fallback
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    }
  };
  const [activeTab, setActiveTab] = useState<'standings' | 'rounds' | 'info'>('rounds');
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedRef = useRef<string | null>(null);
  const initialLoadDone = useRef(false);
  const autoJoinAttemptedRef = useRef(false);

  const fetchData = async () => {
    // Only show full-page loading spinner on the very first fetch;
    // background polling refreshes should update data silently.
    if (!initialLoadDone.current) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${resolvedParams.id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load tournament');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      initialLoadDone.current = true;
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [resolvedParams.id]);

  // Auto-redirect to game when tournament is live and user has a pending game
  useEffect(() => {
    if (!data || !data.isRegistered || !data.currentPlayerId || data.tournament.status !== 'active') return;

    // Arena: check live games for the player
    if (data.tournament.type === 'arena') {
      const myGame = (data.arenaGames || []).find(
        g => g.whiteId === data.currentPlayerId || g.blackId === data.currentPlayerId
      );
      if (!myGame) return;
      if (redirectedRef.current === myGame.id) return;
      redirectedRef.current = myGame.id;
      setRedirecting(true);
      const timer = setTimeout(() => {
        router.push(`/game/${myGame.id}`);
      }, 800);
      return () => clearTimeout(timer);
    }

    const currentRound = data.rounds?.find(r => r.round_number === data.tournament.current_round);
    if (!currentRound || currentRound.is_complete) return;

    // Find the user's pairing
    const myPairing = currentRound.pairings?.find(
      p => p.white === data.currentPlayerId || p.black === data.currentPlayerId
    );
    if (!myPairing || !myPairing.game_id || myPairing.result !== null) return;

    // Don't redirect if already redirected to this game
    if (redirectedRef.current === myPairing.game_id) return;

    // Redirect immediately to the game board — the board itself shows a
    // countdown overlay during the pre-game wait period, so players land
    // on the board and wait there until the real clock starts.
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
    // Arena: refresh every 5s for live match updates
    if (data.tournament.type === 'arena') {
      const interval = setInterval(() => fetchData(), 5000);
      return () => clearInterval(interval);
    }
    // Check if current round is starting soon
    const currentRd = data.rounds?.find(r => r.round_number === data.tournament.current_round);
    const startsIn = currentRd?.starts_at ? Math.max(0, Math.floor((new Date(currentRd.starts_at).getTime() - Date.now()) / 1000)) : 0;
    const startingSoon = !!currentRd?.starts_at && startsIn > 0;
    const intervalMs = startingSoon ? 5000 : 15000;
    const interval = setInterval(() => fetchData(), intervalMs);
    return () => clearInterval(interval);
  }, [data?.tournament.status, data?.tournament.type, data?.rounds]);

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

  // If the visitor was bounced through Signup/Login with ?action=join (e.g. they
  // clicked "Join Tournament" while logged out), automatically complete the join
  // once they land back here authenticated — no need to click twice.
  useEffect(() => {
    if (!data || autoJoinAttemptedRef.current) return;
    if (searchParams.get('action') !== 'join') return;
    autoJoinAttemptedRef.current = true;

    // Strip the query param regardless of outcome so a refresh doesn't re-trigger it
    const cleanUrl = `/tournament/${resolvedParams.id}`;
    window.history.replaceState(null, '', cleanUrl);

    if (data.canJoin && !data.isRegistered) {
      handleJoin();
    }
  }, [data, searchParams, resolvedParams.id]);

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
  const hasEntryFee = (t.entry_fee || 0) > 0;
  const displayPrizePool = t.actual_prize_pool ?? t.prize_pool ?? 0;
  const hasPrizePool = displayPrizePool > 0;
    const isLive = t.status === 'active';
  const isArena = t.type === 'arena';
  const arenaGames = data.arenaGames || [];
  const arenaTimeLeft = t.ends_at ? Math.max(0, Math.floor((new Date(t.ends_at).getTime() - Date.now()) / 1000)) : 0;

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

  // Compute Swiss tiebreaks client-side so live standings use the same
  // ranking logic as the final results (score → Buchholz Cut 1 →
  // Sonneborn-Berger → wins → seed). This prevents confusing rank jumps
  // when the tournament finishes and server-side tiebreaks kick in.
  const allHaveFinalRank = participants.length > 0 && participants.every((p) => p.final_rank != null);
  const tiebreaks = isArena ? new Map<string, { buchholz_cut1: number; sonneborn_berger: number }>() : computeTiebreaks(participants, rounds);

  const sortedParticipants = [...participants].sort((a, b) => {
    if (allHaveFinalRank) {
      return (a.final_rank || 0) - (b.final_rank || 0);
    }
    // Arena: sort by score desc, wins desc, games_played desc
    if (isArena) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return (b.games_played || 0) - (a.games_played || 0);
    }
    // Same tiebreak order as server-side calculateTiebreaks
    if (b.score !== a.score) return b.score - a.score;
    const ta = tiebreaks.get(a.player_id) || { buchholz_cut1: 0, sonneborn_berger: 0 };
    const tb = tiebreaks.get(b.player_id) || { buchholz_cut1: 0, sonneborn_berger: 0 };
    if (tb.buchholz_cut1 !== ta.buchholz_cut1) return tb.buchholz_cut1 - ta.buchholz_cut1;
    if (tb.sonneborn_berger !== ta.sonneborn_berger) return tb.sonneborn_berger - ta.sonneborn_berger;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.seed || 0) - (b.seed || 0);
  });

  const top3 = sortedParticipants.slice(0, 3);

  return (
    <div className="pb-20 sm:pb-8">
      {/* BACK LINK */}
      <div className="px-3 sm:px-6 lg:px-8 mb-4">
        <Link href="/league" className="inline-flex items-center gap-1.5 text-sm text-ccb-muted hover:text-ccb-text transition-colors">
          <ArrowLeft className="w-4 h-4" /> Compete
        </Link>
      </div>

      {/* HERO HEADER */}
      <div className="px-3 sm:px-6 lg:px-8 mb-5">
        <div className={`relative overflow-hidden rounded-2xl border ${isLive ? 'border-ccb-success/30' : 'border-ccb-border'} bg-gradient-to-br from-ccb-card via-ccb-card to-ccb-surface`}>
          {isLive && <div className="absolute -right-20 -top-20 w-64 h-64 bg-ccb-success/5 rounded-full blur-3xl pointer-events-none" />}
          {!isLive && hasPrizePool && <div className="absolute -right-20 -top-20 w-64 h-64 bg-ccb-accent/5 rounded-full blur-3xl pointer-events-none" />}

          <div className="relative p-4 sm:p-6 space-y-4">
            {/* THUMBNAIL */}
            {t.thumbnail_url && (
              <div className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-2 h-32 sm:h-40 overflow-hidden rounded-t-2xl">
                <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ccb-card via-ccb-card/50 to-transparent" />
              </div>
            )}

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
              <StatTile icon={Calendar} label="Starts" value={formatDate(t.starts_at)} sub={formatTime(t.starts_at)} />
              <StatTile icon={Award} label={isArena ? "Duration" : "Rounds"} value={isArena ? `${t.duration_minutes || 60}min` : (t.rounds || '—')} />
            </div>

            {/* PRIZE & FEE BADGES */}
            <div className="flex items-center gap-2 flex-wrap">
              {hasPrizePool && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30">
                  <Trophy className="w-3.5 h-3.5 text-ccb-accent" />
                  <span className="text-xs font-bold text-ccb-accent">{formatMoney(displayPrizePool)} Pool</span>
                </div>
              )}
              
              {hasEntryFee ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-ccb-surface border border-ccb-border">
                  <DollarSign className="w-3.5 h-3.5 text-ccb-muted" />
                  <span className="text-xs font-bold">{formatMoney(t.entry_fee)} Entry</span>
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
              {((t.status === "upcoming" || t.status === "active") && (
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
                    <>
                      <button
                        onClick={handleJoin}
                        disabled={actionLoading}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-ccb-primary/20 flex items-center justify-center gap-2"
                      >
                        {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                          hasEntryFee ? <><DollarSign className="w-4 h-4" /> Join — {formatMoney(t.entry_fee)}</> :
                          <><Swords className="w-4 h-4" /> Join Tournament</>
                        }
                      </button>
                      {isLive && (
                        <p className="text-center text-xs text-ccb-muted mt-1">You'll be paired in the next round</p>
                      )}
                    </>
                  ) : joinReason === 'not_authenticated' ? (
                    <div className="space-y-2">
                      <Link
                        href={`/signup?redirect=${encodeURIComponent(`/tournament/${resolvedParams.id}`)}&action=join`}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-ccb-primary/20 flex items-center justify-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        {hasEntryFee ? `Sign Up to Join — ${formatMoney(t.entry_fee)}` : 'Sign Up to Join Tournament'}
                      </Link>
                      <Link
                        href={`/login?redirect=${encodeURIComponent(`/tournament/${resolvedParams.id}`)}&action=join`}
                        className="w-full py-2.5 rounded-xl bg-ccb-surface border border-ccb-border text-ccb-text font-bold text-sm hover:bg-ccb-primary/10 hover:border-ccb-primary/30 transition-all flex items-center justify-center gap-2"
                      >
                        <LogIn className="w-4 h-4" />
                        Already have an account? Log In
                      </Link>
                    </div>
                  ) : (
                    <div className="w-full py-3 rounded-xl bg-ccb-surface border border-ccb-border text-center">
                      <p className="text-sm text-ccb-muted">
                        {joinReason === 'already_registered' ? 'Already registered' :
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
              ))}

              {isLive && isArena ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-ccb-success">
                    <div className="w-2 h-2 rounded-full bg-ccb-success animate-pulse" />
                    <span className="font-bold">Arena Live</span>
                    {arenaTimeLeft > 0 && (
                      <span className="ml-3 text-xs font-bold px-2.5 py-1 rounded-full bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30 tabular-nums">
                        ⏱ {Math.floor(arenaTimeLeft / 60)}:{(arenaTimeLeft % 60).toString().padStart(2, '0')} left
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ccb-muted font-medium">
                    {arenaGames.length} live {arenaGames.length === 1 ? 'match' : 'matches'}
                  </span>
                </div>
              ) : isLive && !isArena ? (
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
              ) : null}

              {isFinished && (
                <div className="text-center py-2 flex items-center justify-center gap-2">
                  <Trophy className="w-5 h-5 text-ccb-accent" />
                  <p className="text-sm font-bold text-ccb-muted">Tournament Completed</p>
                </div>
              )}

              {/* Share button — always visible */}
              <button
                onClick={handleShare}
                className="w-full mt-3 py-2.5 rounded-xl bg-ccb-surface border border-ccb-border text-ccb-text font-bold text-sm hover:bg-ccb-primary/10 hover:border-ccb-primary/30 transition-all flex items-center justify-center gap-2"
              >
                {copied ? (
                  <><Check className="w-4 h-4 text-ccb-success" /> Link Copied!</>
                ) : (
                  <><Share2 className="w-4 h-4" /> Share Tournament</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PRIZE DISTRIBUTION */}
      {hasPrizePool && (
        <div className="px-3 sm:px-6 lg:px-8 mb-4">
          <PrizeDistribution t={t} formatMoney={formatMoney} />
        </div>
      )}

      {/* TAB BAR */}
      <div className="px-3 sm:px-6 lg:px-8 mb-4">
        <div className="flex gap-1.5 p-1 bg-ccb-surface rounded-xl border border-ccb-border">
          {(['rounds', 'standings', 'info'] as const).map(tab => (
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
              {tab === 'rounds' && isArena ? 'matches' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="px-3 sm:px-6 lg:px-8">

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
                {/* Player count */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">Standings</span>
                  <span className="text-xs font-semibold text-ccb-muted">{sortedParticipants.length} {sortedParticipants.length === 1 ? 'Player' : 'Players'}</span>
                </div>

                {/* PODIUM — Top 3 (only when finished) */}
                {isFinished && top3.length >= 3 && (
                  <div className="grid grid-cols-3 gap-2.5">
                    {/* 2nd */}
                    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-3 text-center flex flex-col justify-end" style={{ minHeight: '110px' }}>
                      <Medal className="w-6 h-6 text-ccb-muted mx-auto mb-1" />
                      <div className="text-xs font-bold truncate">{top3[1].profile?.display_name || top3[1].profile?.username || '—'}</div>
                      <div className="text-[10px] text-ccb-muted">{(top3[1].score ?? 0).toFixed(1)} pts</div>
                      {top3[0].score === top3[1].score && (() => {
                        const tb0 = tiebreaks.get(top3[0].player_id) || { buchholz_cut1: 0, sonneborn_berger: 0 };
                        const tb1 = tiebreaks.get(top3[1].player_id) || { buchholz_cut1: 0, sonneborn_berger: 0 };
                        return (
                          <div className="text-[9px] text-ccb-muted/70 mt-0.5">
                            TB: {tb1.buchholz_cut1.toFixed(1)} / {tb1.sonneborn_berger.toFixed(1)}
                            {tb1.buchholz_cut1 < tb0.buchholz_cut1 && ' (weaker opp.)'}
                          </div>
                        );
                      })()}
                      <div className="text-[10px] font-bold text-ccb-muted mt-1">2nd</div>
                    </div>
                    {/* 1st */}
                    <div className="bg-gradient-to-b from-ccb-accent/10 to-ccb-card border border-ccb-accent/30 rounded-2xl p-3 text-center flex flex-col justify-start" style={{ minHeight: '130px' }}>
                      <Crown className="w-7 h-7 text-ccb-accent mx-auto mb-1" />
                      <div className="text-xs font-bold truncate">{top3[0].profile?.display_name || top3[0].profile?.username || '—'}</div>
                      <div className="text-[10px] text-ccb-accent font-semibold">{(top3[0].score ?? 0).toFixed(1)} pts</div>
                      {top3.length > 1 && top3[0].score === top3[1].score && (() => {
                        const tb0 = tiebreaks.get(top3[0].player_id) || { buchholz_cut1: 0, sonneborn_berger: 0 };
                        const tb1 = tiebreaks.get(top3[1].player_id) || { buchholz_cut1: 0, sonneborn_berger: 0 };
                        return (
                          <div className="text-[9px] text-ccb-accent/70 mt-0.5">
                            TB: {tb0.buchholz_cut1.toFixed(1)} / {tb0.sonneborn_berger.toFixed(1)}
                            {tb0.buchholz_cut1 > tb1.buchholz_cut1 && ' (stronger opp.)'}
                          </div>
                        );
                      })()}
                      <div className="text-[10px] font-bold text-ccb-accent mt-1">CHAMPION</div>
                    </div>
                    {/* 3rd */}
                    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-3 text-center flex flex-col justify-end" style={{ minHeight: '100px' }}>
                      <Award className="w-6 h-6 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                      <div className="text-xs font-bold truncate">{top3[2].profile?.display_name || top3[2].profile?.username || '—'}</div>
                      <div className="text-[10px] text-ccb-muted">{(top3[2].score ?? 0).toFixed(1)} pts</div>
                      {top3.length > 2 && top3[1].score === top3[2].score && (() => {
                        const tb1 = tiebreaks.get(top3[1].player_id) || { buchholz_cut1: 0, sonneborn_berger: 0 };
                        const tb2 = tiebreaks.get(top3[2].player_id) || { buchholz_cut1: 0, sonneborn_berger: 0 };
                        return (
                          <div className="text-[9px] text-ccb-muted/70 mt-0.5">
                            TB: {tb2.buchholz_cut1.toFixed(1)} / {tb2.sonneborn_berger.toFixed(1)}
                            {tb2.buchholz_cut1 < tb1.buchholz_cut1 && ' (weaker opp.)'}
                          </div>
                        );
                      })()}
                      <div className="text-[10px] font-bold text-ccb-muted mt-1">3rd</div>
                    </div>
                  </div>
                )}

                {/* TIEBREAK INFO NOTE */}
                {(() => {
                  // Show a note when there are tied scores
                  const tiedScores = new Set(sortedParticipants.filter((p, i) =>
                    i > 0 && p.score === sortedParticipants[i - 1].score
                  ).map(p => p.score));
                  return tiedScores.size > 0 ? (
                    <div className="flex items-center gap-1.5 px-1 text-[10px] text-ccb-muted">
                      <AlertCircle className="w-3 h-3" />
                      <span>Tied scores are broken by {isArena ? 'wins, then games played' : 'Buchholz Cut 1, then Sonneborn-Berger (shown in columns below)'}.</span>
                    </div>
                  ) : null;
                })()}

                {/* STANDINGS TABLE */}
                <div className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden overflow-x-auto">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-5 py-2.5 bg-ccb-surface border-b border-ccb-border text-[10px] uppercase tracking-wider text-ccb-muted font-semibold min-w-[600px] sm:min-w-0">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-5 sm:col-span-4">Player</div>
                    <div className="col-span-2 text-center">Score</div>
                    <div className="col-span-2 text-center hidden sm:block">W/L/D</div>
                    {isArena ? (
                      <div className="col-span-2 text-center hidden sm:block" title="Current win streak">Streak</div>
                    ) : (
                      <>
                        <div className="col-span-1 text-center hidden sm:block" title="Buchholz Cut 1 — sum of opponents' scores minus worst opponent">BH-C1</div>
                        <div className="col-span-1 text-center hidden sm:block" title="Sonneborn-Berger — weighted sum of results vs opponents' scores">SB</div>
                      </>
                    )}
                    <div className="col-span-2 text-center">Played</div>
                  </div>

                  {/* Rows */}
                  {sortedParticipants.map((p, i) => {
                    const rank = allHaveFinalRank ? (p.final_rank as number) : (i + 1);
                    const isTop3 = rank <= 3;
                    const medalColor = rank === 1 ? 'text-ccb-accent' : rank === 2 ? 'text-ccb-muted' : rank === 3 ? 'text-amber-600 dark:text-amber-400' : '';
                    const tb = tiebreaks.get(p.player_id) || { buchholz_cut1: 0, sonneborn_berger: 0 };
                    const tiedWithNext = i < sortedParticipants.length - 1 && p.score === sortedParticipants[i + 1].score;
                    return (
                      <Link
                        key={p.player_id}
                        href={`/profile/${p.profile?.username}`}
                        className={`grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-5 py-3 hover:bg-ccb-surface transition-colors items-center border-b border-ccb-border/50 last:border-0 min-w-[600px] sm:min-w-0 ${
                          isTop3 ? 'bg-ccb-surface/30' : ''
                        }`}
                      >
                        <div className={`col-span-1 text-center text-sm font-bold ${medalColor || 'text-ccb-muted'}`}>
                          {isTop3 && rank === 1 ? <Crown className="w-4 h-4 mx-auto" /> : rank}
                        </div>
                        <div className="col-span-5 sm:col-span-4 flex items-center gap-2.5 min-w-0">
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
                          <span className="text-sm font-bold">{(p.score ?? 0).toFixed(1)}</span>
                        </div>
                        <div className="col-span-2 text-center text-xs text-ccb-muted hidden sm:block">
                          <span className="text-ccb-success font-medium">{p.wins}</span>/
                          <span className="text-ccb-danger">{p.losses}</span>/
                          <span>{p.draws}</span>
                        </div>
                        {isArena ? (
                          <div className="col-span-2 text-center text-xs hidden sm:block">
                            {(p.streak || 0) > 0 ? (
                              <span className="font-bold text-ccb-success flex items-center justify-center gap-1">
                                <Flame className="w-3 h-3" />{p.streak}
                              </span>
                            ) : (
                              <span className="text-ccb-muted">—</span>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className={`col-span-1 text-center text-xs hidden sm:block ${tiedWithNext ? 'text-ccb-text font-semibold' : 'text-ccb-muted'}`}>
                              {tb.buchholz_cut1.toFixed(1)}
                            </div>
                            <div className={`col-span-1 text-center text-xs hidden sm:block ${tiedWithNext ? 'text-ccb-text font-semibold' : 'text-ccb-muted'}`}>
                              {tb.sonneborn_berger.toFixed(1)}
                            </div>
                          </>
                        )}
                        <div className="col-span-2 text-center text-xs text-ccb-muted">
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
                isArena && isLive ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">Live Matches</span>
                    <span className="text-xs font-semibold text-ccb-muted">{arenaGames.length} {arenaGames.length === 1 ? 'match' : 'matches'}</span>
                  </div>
                  {arenaGames.length === 0 ? (
                    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
                      <div className="w-8 h-8 rounded-full border-2 border-ccb-primary border-t-transparent animate-spin mx-auto mb-3" />
                      <p className="text-xs text-ccb-muted">Matching players…</p>
                    </div>
                  ) : (
                    arenaGames.map((g) => {
                      const isMyGame = g.whiteId === data.currentPlayerId || g.blackId === data.currentPlayerId;
                      const initials = (name: string) => (name || '?').trim().charAt(0).toUpperCase();
                      const Avatar = ({ src, name }: { src?: string | null; name: string }) => (
                        <div className="relative shrink-0 w-9 h-9">
                          <div className="absolute inset-0 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-sm font-bold text-ccb-text">
                            {initials(name)}
                          </div>
                          {src && (
                            <img
                              src={src}
                              alt=""
                              className="absolute inset-0 w-9 h-9 rounded-full object-cover border border-ccb-border"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                      );
                      return (
                        <Link
                          key={g.id}
                          href={`/game/${g.id}`}
                          className={`group block relative overflow-hidden bg-ccb-card border rounded-2xl transition-all active:scale-[0.99] ${
                            isMyGame ? 'border-ccb-primary/50 shadow-lg shadow-ccb-primary/10' : 'border-ccb-border hover:border-ccb-primary/30'
                          }`}
                        >
                          {isMyGame && <div className="absolute inset-y-0 left-0 w-1 bg-ccb-primary" />}

                          <div className="flex items-center justify-between px-4 pt-3">
                            {isMyGame ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-primary/15 text-ccb-primary border border-ccb-primary/30">
                                Your Match
                              </span>
                            ) : <span />}
                            {g.status === 'playing' ? (
                              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-ccb-success/10 text-ccb-success border border-ccb-success/30 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-ccb-success animate-pulse" /> Live
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-ccb-accent/10 text-ccb-accent border border-ccb-accent/30">
                                Starting
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 px-4 py-3.5">
                            {/* White player */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <Avatar src={g.whiteAvatar} name={g.whiteName} />
                              <div className="min-w-0">
                                <div className="text-sm font-bold truncate leading-tight">{g.whiteName}</div>
                                <div className="text-[11px] text-ccb-muted font-medium">{g.whiteRating}</div>
                              </div>
                            </div>

                            {/* VS divider */}
                            <div className="shrink-0 w-8 h-8 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center">
                              <Swords className="w-3.5 h-3.5 text-ccb-muted" />
                            </div>

                            {/* Black player */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end text-right">
                              <div className="min-w-0">
                                <div className="text-sm font-bold truncate leading-tight">{g.blackName}</div>
                                <div className="text-[11px] text-ccb-muted font-medium">{g.blackRating}</div>
                              </div>
                              <Avatar src={g.blackAvatar} name={g.blackName} />
                            </div>
                          </div>

                          <div className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold border-t ${
                            isMyGame
                              ? 'bg-ccb-primary/10 text-ccb-primary border-ccb-primary/20 group-hover:bg-ccb-primary/15'
                              : 'text-ccb-muted border-ccb-border group-hover:text-ccb-text group-hover:bg-ccb-surface/50'
                          } transition-colors`}>
                            {isMyGame ? (
                              <><Play className="w-3.5 h-3.5" /> Play Your Game</>
                            ) : (
                              <><Eye className="w-3.5 h-3.5" /> Watch</>
                            )}
                          </div>
                        </Link>
                      );
                    })
                  )}

                  {/* RECENT RESULTS STRIP */}
                  {(() => {
                    const recent = data.arenaRecentResults || [];
                    if (recent.length === 0) return null;
                    return (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-1.5 px-1">
                          <History className="w-3.5 h-3.5 text-ccb-muted" />
                          <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">Recent Results</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {recent.map((r) => {
                            const whiteWon = r.result === 'white';
                            const blackWon = r.result === 'black';
                            const isDraw = r.result === 'draw';
                            return (
                              <Link
                                key={r.id}
                                href={`/game/${r.id}`}
                                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-ccb-card border border-ccb-border hover:border-ccb-primary/30 transition-all group"
                              >
                                <div className={`text-xs font-bold truncate flex-1 text-right ${whiteWon ? 'text-ccb-text' : isDraw ? 'text-ccb-muted' : 'text-ccb-muted/60'}`}>
                                  {r.whiteName}
                                </div>
                                <div className="shrink-0">
                                  {isDraw ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted">½-½</span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-ccb-primary/10 border border-ccb-primary/20 text-ccb-primary">
                                      {whiteWon ? '1-0' : '0-1'}
                                    </span>
                                  )}
                                </div>
                                <div className={`text-xs font-bold truncate flex-1 ${blackWon ? 'text-ccb-text' : isDraw ? 'text-ccb-muted' : 'text-ccb-muted/60'}`}>
                                  {r.blackName}
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : isArena ? (
              <div className="bg-ccb-card border border-ccb-border rounded-2xl p-10 text-center">
                <Swords className="w-10 h-10 text-ccb-muted mx-auto mb-3" />
                <h3 className="font-bold text-sm mb-1">
                  {isFinished ? 'Arena has ended' : 'No matches yet'}
                </h3>
                <p className="text-xs text-ccb-muted">
                  {isFinished
                    ? 'Check the Standings tab for final results.'
                    : 'Live matches will appear here once the arena starts.'}
                </p>
              </div>
              ) : (
              <div className="bg-ccb-card border border-ccb-border rounded-2xl p-10 text-center">
                <Swords className="w-10 h-10 text-ccb-muted mx-auto mb-3" />
                <h3 className="font-bold text-sm mb-1">No rounds yet</h3>
                <p className="text-xs text-ccb-muted">
                  {t.status === 'upcoming' ? 'Pairings will appear when the tournament starts.' : 'No rounds have been generated.'}
                </p>
              </div>
              )
            ) : (
              <>
                {/* Round count */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">Rounds</span>
                  <span className="text-xs font-semibold text-ccb-muted">{rounds.length} {rounds.length === 1 ? 'Round' : 'Rounds'}</span>
                </div>

                {rounds.map((round) => {
                  // Generate knockout-aware round label
                  const tType = t.type;
                  const tRoundCount = t.rounds || rounds.length;
                  const tKoFormat = t.knockout_format || 'pure';
                  const groupSchedule = (t as any).group_schedule;
                  const numGroupRounds = Array.isArray(groupSchedule) ? groupSchedule.length : 0;
                  let roundLabel = `Round ${round.round_number}`;
                  let phaseLabel = '';

                  if (tType === 'knockout') {
                    if (tKoFormat === 'group_stage' && numGroupRounds > 0) {
                      if (round.round_number <= numGroupRounds) {
                        phaseLabel = 'Group Stage';
                        roundLabel = `Group Round ${round.round_number}`;
                      } else {
                        const koRound = round.round_number - numGroupRounds;
                        const totalKoRounds = tRoundCount - numGroupRounds;
                        const remaining = Math.pow(2, totalKoRounds - koRound + 1);
                        if (remaining === 2) { roundLabel = 'Final'; phaseLabel = 'Knockout'; }
                        else if (remaining === 4) { roundLabel = 'Semi-Finals'; phaseLabel = 'Knockout'; }
                        else if (remaining === 8) { roundLabel = 'Quarter-Finals'; phaseLabel = 'Knockout'; }
                        else if (remaining === 16) { roundLabel = 'Round of 16'; phaseLabel = 'Knockout'; }
                        else { roundLabel = `Knockout Round ${koRound}`; phaseLabel = 'Knockout'; }
                      }
                    } else {
                      const remaining = Math.pow(2, tRoundCount - round.round_number + 1);
                      if (remaining === 2) roundLabel = 'Final';
                      else if (remaining === 4) roundLabel = 'Semi-Finals';
                      else if (remaining === 8) roundLabel = 'Quarter-Finals';
                      else if (remaining === 16) roundLabel = 'Round of 16';
                      else roundLabel = `Round of ${remaining}`;
                    }
                  }

                  // Check if any pairing in this round is a 3rd-place match
                  const hasThirdPlace = round.pairings?.some((p: any) => p.is_third_place === true);
                  const hasGroups = round.pairings?.some((p) => (p as any).group !== null && (p as any).group !== undefined);
                  const groupMap = new Map<number, typeof round.pairings>();
                  if (hasGroups) {
                    for (const p of round.pairings) {
                      const g = (p as any).group ?? 0;
                      if (!groupMap.has(g)) groupMap.set(g, []);
                      groupMap.get(g)!.push(p);
                    }
                  }

                return (
                <div key={round.id} className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
                  {/* Round header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-ccb-border">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center">
                        <Swords className="w-4 h-4 text-ccb-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold">{roundLabel}</h4>
                        {phaseLabel && <span className="text-[10px] text-ccb-muted font-medium">{phaseLabel}</span>}
                      </div>
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
                          ) : (pairing as any).is_third_place ? (
                            <div className="flex items-center gap-3">
                              <div className={`flex-1 flex items-center gap-2 min-w-0 ${pairing.result === 'white' ? '' : pairing.result === 'black' || pairing.result === 'draw' ? 'opacity-50' : ''}`}>
                                <div className="w-7 h-7 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-[10px] font-bold text-ccb-muted shrink-0">
                                  {(pairing.whiteName || '?').charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <div className={`text-sm truncate ${pairing.result === 'white' ? 'font-bold text-amber-600 dark:text-amber-400' : ''}`}>
                                    {pairing.whiteName}
                                  </div>
                                  <div className="text-[10px] text-ccb-muted">{pairing.whiteRating}</div>
                                </div>
                              </div>
                              <div className="shrink-0 flex flex-col items-center gap-0.5">
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-600/10 text-amber-600 dark:text-amber-400 border border-amber-600/30">3RD</span>
                                {pairing.result !== null && pairing.result !== undefined ? (
                                  <span className="text-xs font-bold px-2 py-1 rounded-lg bg-ccb-muted/10 text-ccb-muted">
                                    {pairing.result === 'draw' ? '½-½' : pairing.result === 'white' ? '1-0' : '0-1'}
                                  </span>
                                ) : pairing.game_id ? (
                                  <Link href={`/game/${pairing.game_id}`} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-ccb-primary text-white hover:bg-ccb-primary/90 transition-colors flex items-center gap-1">
                                    {currentPlayerId && (pairing.white === currentPlayerId || pairing.black === currentPlayerId) ? (
                                      <><Gamepad2 className="w-3.5 h-3.5" /> Play</>
                                    ) : (
                                      <><Eye className="w-3.5 h-3.5" /> Watch</>
                                    )}
                                  </Link>
                                ) : (
                                  <span className="text-xs text-ccb-muted px-2">vs</span>
                                )}
                              </div>
                              <div className={`flex-1 flex items-center justify-end gap-2 min-w-0 ${pairing.result === 'black' ? '' : pairing.result === 'white' || pairing.result === 'draw' ? 'opacity-50' : ''}`}>
                                <div className="min-w-0 text-right">
                                  <div className={`text-sm truncate ${pairing.result === 'black' ? 'font-bold text-amber-600 dark:text-amber-400' : ''}`}>
                                    {pairing.blackName}
                                  </div>
                                  <div className="text-[10px] text-ccb-muted">{pairing.blackRating || '—'}</div>
                                </div>
                                <div className="w-7 h-7 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-[10px] font-bold text-ccb-muted shrink-0">
                                  {(pairing.blackName || '?').charAt(0)}
                                </div>
                              </div>
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
                                    {currentPlayerId && (pairing.white === currentPlayerId || pairing.black === currentPlayerId) ? (
                                      <><Gamepad2 className="w-3.5 h-3.5" /> {isRoundStartingSoon ? 'Enter' : 'Play'}</>
                                    ) : (
                                      <><Eye className="w-3.5 h-3.5" /> Watch</>
                                    )}
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
                );
                })}
              </>
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
                {hasPrizePool && <InfoRow icon={Trophy} label={t.pool_source === 'fixed' ? "Cash Prize Pool (Fixed)" : "Cash Prize Pool (Entry Fees)"} value={formatMoney(displayPrizePool)} />}
                {hasEntryFee ? (
                  <InfoRow icon={DollarSign} label="Entry Fee" value={formatMoney(t.entry_fee)} />
                ) : (
                  <InfoRow icon={CheckCircle} label="Entry Fee" value="Free" />
                )}
                {!hasPrizePool && (
                  <p className="text-xs text-ccb-muted">{t.entry_fee > 0 ? "Prize pool grows as players join." : "No prize pool for this tournament."}</p>
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

function StatTile({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-ccb-surface/50 rounded-xl px-3 py-2.5 border border-ccb-border/50">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-ccb-muted font-semibold mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-sm font-bold truncate">{value}</div>
      {sub && <div className="text-[11px] text-ccb-muted font-medium truncate">{sub}</div>}
    </div>
  );
}

function PrizeDistribution({ t, formatMoney }: { t: any; formatMoney: (c: number) => string }) {
  const dist = t.prize_distribution;
  if (!dist || !dist.payouts || dist.payouts.length === 0) return null;

  const pool = t.actual_prize_pool ?? t.prize_pool ?? 0;
  const isFixed = t.pool_source === 'fixed';
  const isFlat = dist.type === 'flat';

  return (
    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
      <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-3 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5" /> Prize Distribution
      </h4>
      <div className="space-y-2">
        {dist.payouts.map((payout: any) => {
          const amount = isFlat
            ? payout.amount
            : pool > 0 ? Math.floor(pool * (payout.percentage / 100)) : 0;
          const rankLabel = payout.rank === 1 ? '1st' : payout.rank === 2 ? '2nd' : payout.rank === 3 ? '3rd' : `${payout.rank}th`;
          const medalIcon = payout.rank === 1 ? <Crown className="w-4 h-4 text-ccb-accent" /> :
                            payout.rank === 2 ? <Medal className="w-4 h-4 text-ccb-muted" /> :
                            payout.rank === 3 ? <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : null;
          return (
            <div key={payout.rank} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${payout.rank <= 3 ? 'bg-ccb-surface/60' : 'bg-ccb-surface/30'}`}>
              <div className="flex items-center gap-2">
                {medalIcon || <span className="w-4 text-center text-xs font-bold text-ccb-muted">{payout.rank}</span>}
                <span className="text-sm font-bold">{rankLabel}</span>
              </div>
              <div className="flex items-center gap-3">
                {!isFlat && (
                  <span className="text-[10px] text-ccb-muted font-medium">{payout.percentage}%</span>
                )}
                <span className="text-sm font-bold text-ccb-accent">
                  {pool > 0 ? formatMoney(amount) : isFlat ? formatMoney(amount) : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-ccb-muted mt-3 leading-relaxed">
        {isFlat
          ? 'Fixed amounts per rank.'
          : 'Percentages of the prize pool. Final amounts depend on total pool.'}
      </p>
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
