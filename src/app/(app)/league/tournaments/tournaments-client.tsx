'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Trophy, Crown, Swords, Calendar, Users, RefreshCw, ShieldAlert,
  CheckCircle2, Lock, Zap, Clock, DollarSign, Sparkles, Target, TrendingUp,
} from 'lucide-react';
import { useCurrency } from '@/hooks/use-currency';

interface Competition {
  type: 'league' | 'tournament';
  id: string;
  name: string;
  status: string;
  entryType?: string;
  playerCount: number;
  maxPlayers?: number | null;
  rounds?: number;
  startsAt?: string;
  timeControl?: string;
  entryFee?: number;
  currency?: string;
  currencySymbol?: string;
  isRegistered?: boolean;
  qualification: { canJoin: boolean; reason: string | null };
}

interface ApiResponse {
  success: boolean;
  isAdmin: boolean;
  tournaments: Competition[];
  user: { id: string } | null;
}

function getStatusLabel(status: string): { label: string; color: string; dot: string } {
  switch (status) {
    case 'active': return { label: 'LIVE', color: 'text-ccb-success bg-ccb-success/10 border-ccb-success/30', dot: 'bg-ccb-success' };
    case 'upcoming': return { label: 'UPCOMING', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30', dot: 'bg-blue-400' };
    case 'completed': return { label: 'COMPLETED', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30', dot: 'bg-ccb-muted' };
    case 'pending': return { label: 'PENDING', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', dot: 'bg-yellow-400' };
    default: return { label: status.toUpperCase(), color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30', dot: 'bg-ccb-muted' };
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'TBD';
  const d = new Date(dateStr);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

type FilterTab = 'active' | 'upcoming' | 'completed';

export default function TournamentsPage() {
  const { formatMoney: fmtCurrency } = useCurrency();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState<FilterTab>('upcoming');

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/competitions');
      if (!res.ok) throw new Error('Failed to load tournaments');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);

  const handleJoin = async (competition: Competition) => {
    setJoining(competition.id);
    setJoinMessage(null);
    try {
      const res = await fetch('/api/league/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: competition.id, competitionType: 'swiss' }),
      });
      const json = await res.json();
      if (json.success) {
        setJoinMessage({ type: 'success', text: json.message || 'Successfully joined!' });
        fetchTournaments();
      } else {
        setJoinMessage({ type: 'error', text: json.error || 'Failed to join' });
      }
    } catch (err: any) {
      setJoinMessage({ type: 'error', text: err.message });
    } finally {
      setJoining(null);
    }
  };

  const allTournaments = data?.tournaments || [];

  const filtered = allTournaments.filter(t => {
    if (filter === 'active') return t.status === 'active';
    if (filter === 'upcoming') return t.status === 'upcoming' || t.status === 'pending';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  }).sort((a, b) => {
    // Sort by event date: upcoming = soonest first, completed = most recent first
    const aDate = a.startsAt ? new Date(a.startsAt).getTime() : Infinity;
    const bDate = b.startsAt ? new Date(b.startsAt).getTime() : Infinity;
    if (filter === 'completed') return bDate - aDate;
    return aDate - bDate;
  });

  const activeCount = allTournaments.filter(t => t.status === 'active').length;
  const upcomingCount = allTournaments.filter(t => t.status === 'upcoming' || t.status === 'pending').length;
  const completedCount = allTournaments.filter(t => t.status === 'completed').length;

  const filterTabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'active', label: 'Live', count: activeCount },
    { id: 'upcoming', label: 'Upcoming', count: upcomingCount },
    { id: 'completed', label: 'Past', count: completedCount },
  ];

  return (
    <div className="space-y-6 pb-20 sm:pb-8">

      {/* HERO BANNER */}
      <div className="relative overflow-hidden rounded-2xl border border-ccb-border bg-ccb-card p-5 sm:p-6">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-ccb-success animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-success">{activeCount} Live</span>
            <span className="text-ccb-muted text-[10px]">·</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">{upcomingCount} Upcoming</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Tournaments</h1>
          <p className="text-sm text-ccb-muted mt-1">Swiss · Arena · Knockout — play, climb, win.</p>
          <div className="flex items-center gap-4 mt-4">
            <Link href="/league" className="text-xs font-bold text-ccb-accent hover:underline flex items-center gap-1">
              <Crown className="w-3.5 h-3.5" /> Premium Leagues
            </Link>
            <Link href="/leaderboard" className="text-xs font-bold text-ccb-muted hover:text-ccb-text flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Rankings
            </Link>
          </div>
        </div>
        {/* Decorative bg */}
        <Trophy className="absolute -bottom-4 -right-4 w-28 h-28 text-ccb-accent/5 rotate-12" />
      </div>

      {/* JOIN MESSAGE */}
      {joinMessage && (
        <div className={`p-3 rounded-xl border text-sm font-medium flex items-center gap-2 ${
          joinMessage.type === 'success'
            ? 'bg-ccb-success/10 border-ccb-success/30 text-ccb-success'
            : 'bg-ccb-danger/10 border-ccb-danger/30 text-ccb-danger'
        }`}>
          {joinMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
          {joinMessage.text}
        </div>
      )}

      {/* LOADING */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="card h-44" />)}
        </div>
      ) : error ? (
        <div className="card text-center p-8">
          <ShieldAlert className="w-10 h-10 text-ccb-danger mx-auto mb-3" />
          <p className="text-ccb-muted text-sm">{error}</p>
          <button onClick={fetchTournaments} className="mt-4 btn-primary text-sm">
            <RefreshCw className="w-4 h-4 mr-2" /> Try Again
          </button>
        </div>
      ) : allTournaments.length === 0 ? (
        <div className="card text-center p-12">
          <div className="w-16 h-16 rounded-2xl bg-ccb-accent/10 border border-ccb-accent/30 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-ccb-accent" />
          </div>
          <h3 className="text-lg font-bold mb-2">No tournaments yet</h3>
          <p className="text-ccb-muted text-sm max-w-sm mx-auto">
            New Swiss Battles are coming soon. Check back or follow us for updates — the first tournaments of the season will be announced here.
          </p>
        </div>
      ) : (
        <>
          {/* FILTER TABS */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {filterTabs.map(ft => (
              <button
                key={ft.id}
                onClick={() => setFilter(ft.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  filter === ft.id
                    ? 'bg-ccb-accent/10 text-ccb-accent border border-ccb-accent/30'
                    : 'bg-ccb-surface text-ccb-muted border border-ccb-border hover:text-ccb-text'
                }`}
              >
                {ft.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  filter === ft.id ? 'bg-ccb-accent/20 text-ccb-accent' : 'bg-ccb-border/30 text-ccb-muted'
                }`}>{ft.count}</span>
              </button>
            ))}
          </div>

          {/* TOURNAMENT GRID */}
          {filtered.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-ccb-muted text-sm">No {filter} tournaments right now.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(comp => (
                <TournamentCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} fmtCurrency={fmtCurrency} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TournamentCard({ competition, onJoin, joining, fmtCurrency }: { competition: Competition; onJoin: (c: Competition) => void; joining: boolean; fmtCurrency: (amt: number) => string }) {
  const statusInfo = getStatusLabel(competition.status);
  const isPaid = competition.entryType === 'paid';
  const canJoin = competition.qualification.canJoin;
  const isParticipating = competition.isRegistered;
  const isLive = competition.status === 'active';

  return (
    <div className={`card flex flex-col ${isLive ? 'border-ccb-success/30' : ''}`}>
      {/* TOP ROW */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isLive ? 'bg-ccb-success/10 border border-ccb-success/30' : 'bg-ccb-accent/10 border border-ccb-accent/30'
          }`}>
            <Swords className={`w-5 h-5 ${isLive ? 'text-ccb-success' : 'text-ccb-accent'}`} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm truncate">{competition.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-ccb-muted">Swiss</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusInfo.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
          isPaid
            ? 'bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30'
            : 'bg-ccb-success/10 text-ccb-success border border-ccb-success/30'
        }`}>
          {isPaid ? 'PAID' : 'FREE'}
        </span>
      </div>

      {/* STATS ROW */}
      <div className="flex items-center gap-3 mb-3 text-xs text-ccb-muted flex-wrap">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {competition.playerCount}{competition.maxPlayers ? `/${competition.maxPlayers}` : ' players'}
        </span>
        {competition.rounds ? (
          <span className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" />
            {competition.rounds} rounds
          </span>
        ) : null}
        {competition.timeControl ? (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {competition.timeControl}
          </span>
        ) : null}
        {competition.startsAt ? (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(competition.startsAt)}
          </span>
        ) : null}
        {isPaid && competition.entryFee != null ? (
          <span className="flex items-center gap-1 text-ccb-accent font-medium">
            <DollarSign className="w-3.5 h-3.5" />
            {fmtCurrency(competition.entryFee)}
          </span>
        ) : null}
      </div>

      {/* ACTION */}
      <div className="pt-3 border-t border-ccb-border mt-auto">
        {isParticipating ? (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-success/10 text-ccb-success border border-ccb-success/30 font-semibold text-sm">
            <CheckCircle2 className="w-4 h-4" /> Participating
          </div>
        ) : canJoin ? (
          <button onClick={() => onJoin(competition)} disabled={joining}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-accent text-ccb-dark font-bold text-sm hover:bg-ccb-gold transition-all disabled:opacity-50">
            {joining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Join Tournament
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-ccb-border bg-ccb-surface/50 text-ccb-muted font-medium text-sm">
            <Lock className="w-4 h-4" />
            {competition.qualification.reason === 'already_started' ? 'In Progress' :
             competition.qualification.reason === 'completed' ? 'Tournament Ended' :
             competition.qualification.reason === 'pending_approval' ? 'Pending Approval' :
             competition.qualification.reason === 'not_authenticated' ? 'Sign in to Join' :
             'Not Available'}
          </div>
        )}
      </div>

      {/* VIEW DETAILS LINK */}
      <Link href={`/tournament/${competition.id}`} className="mt-2 text-center text-xs text-ccb-muted hover:text-ccb-accent transition-colors">
        View details &rarr;
      </Link>
    </div>
  );
}
