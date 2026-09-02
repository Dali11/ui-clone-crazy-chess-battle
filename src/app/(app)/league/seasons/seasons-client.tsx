'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Trophy, Crown, Medal, ChevronLeft, RefreshCw, Calendar, ChevronRight,
} from 'lucide-react';
import LeagueSubNav from '@/components/league/league-sub-nav';

interface Player {
  id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  country?: string | null;
  rating?: number;
}

interface Standing {
  player_id: string;
  position: number;
  played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  points?: number;
  form?: string[];
  player?: Player | null;
}

interface SeasonArchive {
  id: string;
  league_id: string;
  league_name: string;
  league_tier: number | null;
  season_id: string | null;
  completed_at: string;
  champion: Player | null;
  runner_up: Player | null;
  final_standings: Standing[];
}

function getCountryFlag(countryCode?: string | null): string {
  if (!countryCode || typeof countryCode !== 'string') return '♟️';
  const code = countryCode.trim().toUpperCase();
  if (code.length !== 2) return '♟️';
  const char1 = code.charCodeAt(0) - 65 + 0x1F1E6;
  const char2 = code.charCodeAt(1) - 65 + 0x1F1E6;
  if (char1 < 0x1F1E6 || char1 > 0x1F1FF || char2 < 0x1F1E6 || char2 > 0x1F1FF) return '♟️';
  return String.fromCodePoint(char1, char2);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function PlayerBadge({ player, rank }: { player: Player | null; rank: 1 | 2 }) {
  if (!player) {
    return (
      <div className="flex items-center gap-2 text-ccb-muted text-sm">
        {rank === 1 ? <Crown className="w-4 h-4" /> : <Medal className="w-4 h-4" />}
        <span>TBD</span>
      </div>
    );
  }
  const Icon = rank === 1 ? Crown : Medal;
  const color = rank === 1 ? 'text-ccb-accent' : 'text-ccb-muted';
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-4 h-4 ${color} shrink-0`} />
      {player.avatar_url ? (
        <img src={player.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
      ) : (
        <span className="w-6 h-6 rounded-full bg-ccb-surface text-[10px] font-bold flex items-center justify-center shrink-0 text-ccb-muted">
          {(player.display_name || '?')[0]?.toUpperCase()}
        </span>
      )}
      <span className="text-sm font-medium truncate">
        {getCountryFlag(player.country)} {player.display_name || player.username || 'Unknown'}
      </span>
      {player.rating && (
        <span className="text-[10px] text-ccb-muted shrink-0">{player.rating} ELO</span>
      )}
    </div>
  );
}

export default function SeasonsClient() {
  const [seasons, setSeasons] = useState<SeasonArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeasons = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/seasons');
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSeasons(json.seasons || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load season archives');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSeasons(); }, []);

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/league" className="inline-flex items-center gap-1.5 text-sm text-ccb-muted hover:text-ccb-accent transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Leagues
        </Link>
        <LeagueSubNav />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Past Seasons</h1>
          <p className="text-xs text-ccb-muted mt-0.5">Champions, runners-up, and final standings from completed seasons</p>
        </div>
        <button
          onClick={fetchSeasons}
          disabled={loading}
          className="p-2.5 bg-ccb-surface hover:bg-ccb-border border border-ccb-border rounded-xl text-ccb-muted hover:text-ccb-text transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RefreshCw className="w-8 h-8 text-ccb-accent animate-spin" />
          <p className="text-sm text-ccb-muted">Loading season archives...</p>
        </div>
      )}

      {!loading && error && (
        <div className="bg-ccb-danger/10 border border-ccb-danger/30 rounded-xl p-6 text-center">
          <p className="text-sm font-semibold text-ccb-danger mb-1">Failed to load seasons</p>
          <p className="text-xs text-ccb-muted">{error}</p>
          <button onClick={fetchSeasons} className="mt-3 px-4 py-2 bg-ccb-surface border border-ccb-border rounded-lg text-xs font-medium hover:bg-ccb-border transition-colors">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && seasons.length === 0 && (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <Trophy className="w-10 h-10 text-ccb-muted mx-auto mb-3" />
          <p className="text-sm font-semibold text-ccb-text">No completed seasons yet</p>
          <p className="text-xs text-ccb-muted mt-1">Season archives will appear here once the first league season finishes.</p>
        </div>
      )}

      {!loading && !error && seasons.length > 0 && (
        <div className="space-y-4">
          {seasons.map((season) => {
            const top5 = (season.final_standings || [])
              .sort((a, b) => (a.position || 999) - (b.position || 999))
              .slice(0, 5);
            return (
              <div key={season.id} className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-ccb-border flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-ccb-surface flex items-center justify-center shrink-0">
                      <Trophy className="w-4 h-4 text-ccb-accent" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm truncate">{season.league_name}</h3>
                      <p className="text-[11px] text-ccb-muted flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        {formatDate(season.completed_at)}
                      </p>
                    </div>
                  </div>
                  {season.league_tier && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-ccb-surface text-ccb-muted border border-ccb-border">
                      Tier {season.league_tier}
                    </span>
                  )}
                </div>

                <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-ccb-border">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ccb-accent/5 border border-ccb-accent/20">
                    <PlayerBadge player={season.champion} rank={1} />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border">
                    <PlayerBadge player={season.runner_up} rank={2} />
                  </div>
                </div>

                {top5.length > 0 && (
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted mb-2">Final Standings — Top 5</p>
                    <div className="space-y-1.5">
                      {top5.map((s) => {
                        const player = s.player;
                        return (
                          <div key={s.player_id} className="flex items-center gap-2.5 py-1">
                            <span className={`text-xs font-bold w-6 text-center ${
                              s.position === 1 ? 'text-ccb-accent' : 'text-ccb-muted'
                            }`}>{s.position}</span>
                            {player?.avatar_url ? (
                              <img src={player.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-ccb-surface text-[9px] font-bold flex items-center justify-center shrink-0 text-ccb-muted">
                                {(player?.display_name || '?')[0]?.toUpperCase()}
                              </span>
                            )}
                            <span className="flex-1 text-xs font-medium truncate">
                              {player ? `${getCountryFlag(player.country)} ${player.display_name || player.username || 'Unknown'}` : 'Unknown'}
                            </span>
                            <span className="text-[10px] text-ccb-muted shrink-0">{s.played || 0}P</span>
                            <span className="text-xs font-bold shrink-0">{s.points || 0}<span className="text-[9px] text-ccb-muted ml-0.5">pts</span></span>
                          </div>
                        );
                      })}
                    </div>
                    {season.final_standings.length > 5 && (
                      <button
                        onClick={() => { window.location.href = `/league/seasons/${season.id}`; }}
                        className="mt-2 text-[11px] font-medium text-ccb-accent hover:underline flex items-center gap-1"
                      >
                        View full standings ({season.final_standings.length} players)
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
