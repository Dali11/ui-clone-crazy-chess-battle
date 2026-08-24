'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Swords, Trophy, Calendar, Users, DollarSign, Zap, RefreshCw,
  AlertCircle, Star, Crown, TrendingUp, Gift,
} from 'lucide-react';

interface Tournament {
  id: string;
  name: string;
  type: string;
  time_control: string;
  status: string;
  starts_at: string;
  max_players: number | null;
  participant_count: number;
  current_round: number;
  rounds: number | null;
  entry_fee_cents: number;
  entryType?: string;
  currency?: string;
  currencySymbol?: string;
}

export default function TournamentsTab() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'active' | 'finished'>('all');

  const fetchTournaments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/competitions');
      const json = await res.json();
      setTournaments(json.tournaments || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTournaments(); }, []);

  const formatCurrency = (cents: number, symbol?: string, code?: string) => {
    const amount = (cents / 100).toLocaleString();
    if (symbol) return `${symbol}${amount}`;
    if (code) return `${amount} ${code}`;
    return amount;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'upcoming': return { label: 'UPCOMING', color: 'text-ccb-accent bg-ccb-accent/10 border-ccb-accent/30' };
      case 'active': return { label: 'LIVE', color: 'text-ccb-success bg-ccb-success/10 border-ccb-success/30' };
      case 'finished': return { label: 'DONE', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
      default: return { label: status.toUpperCase(), color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
    }
  };

  const filtered = tournaments.filter(t => filter === 'all' || t.status === filter);

  // Tournament type metadata
  const tournamentTypes = [
    { id: 'daily', label: 'Daily', icon: Calendar, desc: 'Quick fire tournaments every day' },
    { id: 'weekly', label: 'Weekly', icon: Star, desc: 'Weekly Swiss Battles with rewards' },
    { id: 'monthly', label: 'Monthly', icon: Crown, desc: 'Monthly championships with prize pools' },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 space-y-6">
      {/* TOURNAMENT TYPES */}
      <div className="grid grid-cols-3 gap-3">
        {tournamentTypes.map(tt => {
          const Icon = tt.icon;
          return (
            <div key={tt.id} className="bg-ccb-card border border-ccb-border rounded-xl p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center mx-auto mb-2">
                <Icon className="w-4 h-4 text-ccb-primary" />
              </div>
              <h3 className="text-xs font-bold">{tt.label}</h3>
              <p className="text-[10px] text-ccb-muted mt-0.5 leading-tight hidden sm:block">{tt.desc}</p>
            </div>
          );
        })}
      </div>

      {/* FILTER PILLS */}
      <div className="flex gap-2">
        {(['all', 'upcoming', 'active', 'finished'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
              filter === f
                ? 'bg-ccb-primary text-white'
                : 'bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* TOURNAMENTS LIST */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="bg-ccb-card border border-ccb-border rounded-2xl h-32" />)}
        </div>
      ) : error ? (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <AlertCircle className="w-8 h-8 text-ccb-danger mx-auto mb-3" />
          <p className="text-sm text-ccb-muted">{error}</p>
          <button onClick={fetchTournaments} className="mt-3 btn-primary text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <Swords className="w-10 h-10 text-ccb-muted mx-auto mb-3" />
          <h3 className="font-bold mb-1">No tournaments yet</h3>
          <p className="text-sm text-ccb-muted">Tournaments will appear here when they&apos;re scheduled.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const status = getStatusInfo(t.status);
            const isPaid = t.entry_fee_cents > 0;
            const capacity = t.max_players;
            const isFull = capacity ? t.participant_count >= capacity : false;

            return (
              <Link
                key={t.id}
                href={`/tournament/${t.id}`}
                className="block bg-ccb-card border border-ccb-border rounded-2xl p-4 hover:border-ccb-primary/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{t.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] uppercase tracking-wider text-ccb-muted font-semibold">{t.type}</span>
                      <span className="text-[10px] text-ccb-muted">·</span>
                      <span className="text-[10px] uppercase tracking-wider text-ccb-muted font-semibold">{t.time_control}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${status.color}`}>
                    {status.label}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-ccb-muted">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {t.participant_count}{capacity ? `/${capacity}` : ''}
                  </span>
                  {t.status === 'active' && t.rounds && (
                    <span className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" />
                      Rd {t.current_round}/{t.rounds}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(t.starts_at)}
                  </span>
                  {isPaid && (
                    <span className="flex items-center gap-1.5 text-ccb-accent">
                      <DollarSign className="w-3.5 h-3.5" />
                      {formatCurrency(t.entry_fee_cents, t.currencySymbol, t.currency)}
                    </span>
                  )}
                  {!isPaid && (
                    <span className="flex items-center gap-1.5 text-ccb-success">
                      <Gift className="w-3.5 h-3.5" /> Free Entry
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* SWISS BATTLES BANNER */}
      <div className="bg-gradient-to-br from-ccb-primary/10 to-ccb-accent/10 border border-ccb-primary/30 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-ccb-primary/20 border border-ccb-primary/30 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-ccb-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm mb-1">Swiss Battles</h3>
            <p className="text-xs text-ccb-muted leading-relaxed">
              Open Swiss-format tournaments for all players. No cap, free or paid entry, daily/weekly/monthly.
              Qualify for premium leagues through performance.
            </p>
            <Link href="/league/tournaments" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-ccb-primary hover:gap-2 transition-all">
              View All Swiss <TrendingUp className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
