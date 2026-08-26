'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Trophy, Swords, Calendar, Users, RefreshCw, ShieldAlert,
  CheckCircle2, Lock, Zap, Clock, DollarSign,
} from 'lucide-react';

interface Competition {
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
  thumbnailUrl?: string | null;
  isRegistered?: boolean;
  qualification: { canJoin: boolean; reason: string | null };
}

function getStatusInfo(status: string) {
  switch (status) {
    case 'active': return { label: 'LIVE', color: 'text-ccb-success bg-ccb-success/10 border-ccb-success/30', dot: 'bg-ccb-success' };
    case 'upcoming': return { label: 'UPCOMING', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30', dot: 'bg-blue-400' };
    case 'completed': return { label: 'COMPLETED', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30', dot: 'bg-ccb-muted' };
    case 'pending': return { label: 'PENDING', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', dot: 'bg-yellow-400' };
    default: return { label: status.toUpperCase(), color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30', dot: 'bg-ccb-muted' };
  }
}

function formatCurrency(cents: number, symbol?: string, code?: string) {
  const amount = (cents / 100).toLocaleString();
  if (symbol) return `${symbol}${amount}`;
  if (code) return `${amount} ${code}`;
  return amount;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

type FilterTab = 'all' | 'active' | 'upcoming' | 'completed';

export default function TournamentsTab() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [joining, setJoining] = useState<string | null>(null);
  const [joinMsg, setJoinMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/competitions');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setTournaments(json.tournaments || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleJoin = async (comp: Competition) => {
    setJoining(comp.id);
    setJoinMsg(null);
    try {
      const res = await fetch(`/api/tournaments/${comp.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        setJoinMsg({ type: 'success', text: json.message || 'Joined!' });
        fetchData();
      } else {
        setJoinMsg({ type: 'error', text: json.error || 'Failed to join' });
      }
    } catch (err: any) {
      setJoinMsg({ type: 'error', text: err.message });
    } finally {
      setJoining(null);
    }
  };

  const filtered = tournaments.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'active') return t.status === 'active';
    if (filter === 'upcoming') return t.status === 'upcoming' || t.status === 'pending';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: tournaments.length },
    { id: 'active', label: 'Live', count: tournaments.filter(t => t.status === 'active').length },
    { id: 'upcoming', label: 'Upcoming', count: tournaments.filter(t => t.status === 'upcoming' || t.status === 'pending').length },
    { id: 'completed', label: 'Past', count: tournaments.filter(t => t.status === 'completed').length },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 space-y-5">
      {/* TOURNAMENT TYPES */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { id: 'daily', label: 'Daily', desc: 'Quick fire every day' },
          { id: 'weekly', label: 'Weekly', desc: 'Swiss Battles with rewards' },
          { id: 'monthly', label: 'Monthly', desc: 'Championships with prizes' },
        ].map(tt => (
          <div key={tt.id} className="bg-ccb-card border border-ccb-border rounded-xl p-3 text-center">
            <div className="w-8 h-8 rounded-lg bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center mx-auto mb-2">
              <Trophy className="w-4 h-4 text-ccb-primary" />
            </div>
            <h3 className="text-xs font-bold">{tt.label}</h3>
            <p className="text-[10px] text-ccb-muted mt-0.5 leading-tight hidden sm:block">{tt.desc}</p>
          </div>
        ))}
      </div>

      {/* JOIN MESSAGE */}
      {joinMsg && (
        <div className={`p-3 rounded-xl border text-sm font-medium flex items-center gap-2 ${
          joinMsg.type === 'success' ? 'bg-ccb-success/10 border-ccb-success/30 text-ccb-success' : 'bg-ccb-danger/10 border-ccb-danger/30 text-ccb-danger'
        }`}>
          {joinMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
          {joinMsg.text}
        </div>
      )}

      {/* FILTER TABS */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {tabs.map(ft => (
          <button key={ft.id} onClick={() => setFilter(ft.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              filter === ft.id ? 'bg-ccb-accent/10 text-ccb-accent border border-ccb-accent/30' : 'bg-ccb-surface text-ccb-muted border border-ccb-border hover:text-ccb-text'
            }`}>
            {ft.label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter === ft.id ? 'bg-ccb-accent/20 text-ccb-accent' : 'bg-ccb-border/30 text-ccb-muted'}`}>{ft.count}</span>
          </button>
        ))}
      </div>

      {/* TOURNAMENTS */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="bg-ccb-card border border-ccb-border rounded-2xl h-36" />)}
        </div>
      ) : error ? (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <ShieldAlert className="w-8 h-8 text-ccb-danger mx-auto mb-3" />
          <p className="text-sm text-ccb-muted">{error}</p>
          <button onClick={fetchData} className="mt-3 btn-primary text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <Swords className="w-10 h-10 text-ccb-muted mx-auto mb-3" />
          <h3 className="font-bold mb-1 text-sm">No tournaments yet</h3>
          <p className="text-xs text-ccb-muted">Tournaments will appear here when they are scheduled.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(comp => {
            const status = getStatusInfo(comp.status);
            const isPaid = comp.entryType === 'paid';
            const isLive = comp.status === 'active';
            const canJoin = comp.qualification.canJoin;
            const isParticipating = comp.isRegistered;

            return (
              <div
                key={comp.id}
                onClick={() => router.push(`/tournament/${comp.id}`)}
                className={`bg-ccb-card border rounded-2xl flex flex-col overflow-hidden cursor-pointer transition-all hover:border-ccb-accent/40 ${isLive ? 'border-ccb-success/30' : 'border-ccb-border'}`}
              >
                {/* THUMBNAIL BANNER (only when thumbnail exists) */}
                {comp.thumbnailUrl && (
                  <div className="relative h-28 overflow-hidden">
                    <img src={comp.thumbnailUrl} alt={comp.name} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-ccb-card/90 via-ccb-card/30 to-transparent" />
                    <div className="absolute top-2 right-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isPaid ? 'bg-ccb-primary/90 text-white border border-ccb-primary/50' : 'bg-ccb-success/90 text-white border border-ccb-success/50'}`}>
                        {isPaid ? 'PAID' : 'FREE'}
                      </span>
                    </div>
                    <div className="absolute bottom-2 left-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${status.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </div>
                  </div>
                )}
                <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {!comp.thumbnailUrl && (
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isLive ? 'bg-ccb-success/10 border border-ccb-success/30' : 'bg-ccb-accent/10 border border-ccb-accent/30'}`}>
                      <Swords className={`w-5 h-5 ${isLive ? 'text-ccb-success' : 'text-ccb-accent'}`} />
                    </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm truncate">{comp.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-ccb-muted">Swiss</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${status.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  {!comp.thumbnailUrl && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${isPaid ? 'bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30' : 'bg-ccb-success/10 text-ccb-success border border-ccb-success/30'}`}>
                    {isPaid ? 'PAID' : 'FREE'}
                  </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mb-3 text-xs text-ccb-muted flex-wrap">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {comp.playerCount}{comp.maxPlayers ? `/${comp.maxPlayers}` : ' players'}
                  </span>
                  {comp.rounds ? (
                    <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> {comp.rounds} rounds</span>
                  ) : null}
                  {comp.timeControl ? (
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {comp.timeControl}</span>
                  ) : null}
                  {comp.startsAt ? (
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(comp.startsAt)}</span>
                  ) : null}
                  {isPaid && comp.entryFee != null ? (
                    <span className="flex items-center gap-1 text-ccb-accent font-medium">
                      <DollarSign className="w-3.5 h-3.5" /> {formatCurrency(comp.entryFee, comp.currencySymbol, comp.currency)}
                    </span>
                  ) : null}
                </div>

                <div className="pt-3 border-t border-ccb-border mt-auto">
                  {isParticipating ? (
                    <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-success/10 text-ccb-success border border-ccb-success/30 font-semibold text-sm">
                      <CheckCircle2 className="w-4 h-4" /> Participating
                    </div>
                  ) : canJoin ? (
                    <button onClick={(e) => { e.stopPropagation(); handleJoin(comp); }} disabled={joining === comp.id}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-accent text-ccb-dark font-bold text-sm hover:bg-ccb-gold transition-all disabled:opacity-50">
                      {joining === comp.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Join
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-ccb-border bg-ccb-surface/50 text-ccb-muted font-medium text-sm">
                      <Lock className="w-4 h-4" />
                      {comp.qualification.reason === 'already_started' ? 'In Progress' :
                       comp.qualification.reason === 'completed' ? 'Ended' :
                       comp.qualification.reason === 'pending_approval' ? 'Pending' :
                       comp.qualification.reason === 'not_authenticated' ? 'Sign in' :
                       'Unavailable'}
                    </div>
                  )}
                </div>

                <Link href={`/tournament/${comp.id}`} className="mt-2 text-center text-xs text-ccb-muted hover:text-ccb-accent transition-colors">
                  Details &rarr;
                </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
