'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import LeagueNav from '@/components/league/league-nav';
import {
  Trophy, Crown, Swords, Calendar, Users, RefreshCw, ShieldAlert,
  CheckCircle2, Lock, Sparkles, Star, Zap, Clock, DollarSign,
} from 'lucide-react';

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

function getStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case 'active': return { label: 'LIVE', color: 'text-ccb-success bg-ccb-success/10 border-ccb-success/30' };
    case 'upcoming': return { label: 'SOON', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' };
    case 'completed': return { label: 'DONE', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
    case 'pending': return { label: 'PENDING', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' };
    default: return { label: status.toUpperCase(), color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
  }
}

function formatCurrency(cents: number, currencySymbol?: string, currencyCode?: string): string {
  const amount = (cents / 100).toLocaleString();
  if (currencySymbol) return `${currencySymbol}${amount}`;
  if (currencyCode) return `${amount} ${currencyCode}`;
  return amount;
}
function formatDate(dateStr?: string): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TournamentsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const tournaments = data?.tournaments || [];

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      <LeagueNav />

      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Tournaments</h1>
        <p className="text-sm text-ccb-muted mt-1">Swiss tournaments — open to all players. Each tournament sets its own player cap and entry fee (free or paid).</p>
      </div>

      {joinMessage && (
        <div className={`p-3 rounded-xl border text-sm font-medium ${
          joinMessage.type === 'success'
            ? 'bg-ccb-success/10 border-ccb-success/30 text-ccb-success'
            : 'bg-ccb-danger/10 border-ccb-danger/30 text-ccb-danger'
        }`}>
          {joinMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 inline mr-2" /> : <ShieldAlert className="w-4 h-4 inline mr-2" />}
          {joinMessage.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="card h-40" />)}
        </div>
      ) : error ? (
        <div className="card text-center p-8">
          <ShieldAlert className="w-10 h-10 text-ccb-danger mx-auto mb-3" />
          <p className="text-ccb-muted">{error}</p>
          <button onClick={fetchTournaments} className="mt-4 btn-primary">
            <RefreshCw className="w-4 h-4 mr-2" /> Try Again
          </button>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="card text-center p-12">
          <Trophy className="w-12 h-12 text-ccb-muted mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">No tournaments yet</h3>
          <p className="text-ccb-muted text-sm">New tournaments are coming soon. Check back or follow us for updates.</p>
        </div>
      ) : (
        <>
          {tournaments.filter(t => t.status === 'upcoming' || t.status === 'active').length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Zap className="w-5 h-5 text-ccb-accent" /> Active &amp; Upcoming
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tournaments.filter(t => t.status === 'upcoming' || t.status === 'active').map(comp => (
                  <TournamentCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} />
                ))}
              </div>
            </div>
          )}

          {tournaments.filter(t => t.status === 'completed').length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-ccb-muted">
                <Trophy className="w-5 h-5" /> Past Tournaments
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tournaments.filter(t => t.status === 'completed').map(comp => (
                  <TournamentCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TournamentCard({ competition, onJoin, joining }: { competition: Competition; onJoin: (c: Competition) => void; joining: boolean }) {
  const statusInfo = getStatusLabel(competition.status);
  const isPaid = competition.entryType === 'paid';
  const canJoin = competition.qualification.canJoin;
  const isParticipating = competition.isRegistered;

  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 flex items-center justify-center">
            <Swords className="w-5 h-5 text-ccb-accent" />
          </div>
          <div>
            <h3 className="font-bold text-sm">{competition.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-ccb-muted">Swiss Tournament</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
          </div>
        </div>
        <div>
          {isPaid ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30">PAID</span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-success/10 text-ccb-success border border-ccb-success/30">FREE</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3 text-xs text-ccb-muted flex-wrap">
        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {competition.playerCount}{competition.maxPlayers ? `/${competition.maxPlayers}` : ' players'}</span>
        {competition.rounds && <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> {competition.rounds} rounds</span>}
        {competition.timeControl && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {competition.timeControl}</span>}
        {competition.startsAt && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(competition.startsAt)}</span>}
        {isPaid && competition.entryFee != null && <span className="flex items-center gap-1 text-ccb-accent"><DollarSign className="w-3.5 h-3.5" /> {formatCurrency(competition.entryFee, competition.currencySymbol, competition.currency)}</span>}
      </div>

      <div className="pt-3 border-t border-ccb-border">
        {isParticipating ? (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-success/10 text-ccb-success border border-ccb-success/30 font-semibold text-sm">
            <CheckCircle2 className="w-4 h-4" /> Participating
          </div>
        ) : canJoin ? (
          <button onClick={() => onJoin(competition)} disabled={joining}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-accent text-ccb-dark font-bold text-sm hover:bg-ccb-gold transition-all shadow-lg shadow-ccb-accent/20 disabled:opacity-50">
            {joining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Join Tournament
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-ccb-border bg-ccb-surface/50 text-ccb-muted font-medium text-sm">
            <Lock className="w-4 h-4" />
            {competition.qualification.reason === 'already_started' ? 'In Progress' :
             competition.qualification.reason === 'completed' ? 'Tournament Ended' :
             competition.qualification.reason === 'pending_approval' ? 'Pending Approval' :
             'Not Available'}
          </div>
        )}
      </div>
    </div>
  );
}
