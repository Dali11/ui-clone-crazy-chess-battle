'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Crown, Trophy, ArrowUp, ArrowDown, Users, Calendar, RefreshCw,
  AlertCircle, Lock, Star, Award, Shield, ChevronRight, Sparkles,
  TrendingUp, Medal, Swords, Target,
} from 'lucide-react';

interface LeagueStanding {
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  form: string[];
  player: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    rating: number;
  } | null;
}

interface League {
  id: string;
  name: string;
  status: string;
  tier: number;
  league_size: number;
  prize_pool_cents: number;
  prize_currency: string;
  promotes_count: number;
  relegates_count: number;
  qualifying_positions: number;
  season_duration_weeks: number;
  current_matchday: number;
  total_matchdays: number;
  player_ids: string[];
  playerCount: number;
  registrationCount: number;
  standings: LeagueStanding[];
  payout_config: Record<string, number> | null;
  sponsor_name: string | null;
  description: string | null;
}

interface ApiResponse {
  success: boolean;
  isAdmin: boolean;
  hasMembership: boolean;
  market: {
    currencyCode: string;
    currencySymbol: string;
    membershipPrice: number;
    membershipActive: boolean;
  };
  leagues: League[];
}

const LEAGUE_META: Record<number, { color: string; bgColor: string; borderColor: string; icon: typeof Crown }> = {
  1: { color: 'text-ccb-primary', bgColor: 'bg-ccb-primary/10', borderColor: 'border-ccb-primary/30', icon: Crown },
  2: { color: 'text-ccb-accent', bgColor: 'bg-ccb-accent/10', borderColor: 'border-ccb-accent/30', icon: Trophy },
  3: { color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30', icon: Medal },
  4: { color: 'text-ccb-muted', bgColor: 'bg-ccb-muted/10', borderColor: 'border-ccb-muted/30', icon: Shield },
  5: { color: 'text-ccb-success', bgColor: 'bg-ccb-success/10', borderColor: 'border-ccb-success/30', icon: Star },
};

function getLeagueMeta(tier: number) {
  return LEAGUE_META[tier] || LEAGUE_META[5];
}

function formatMoney(cents: number, symbol: string) {
  return `${symbol}${(cents / 100).toLocaleString()}`;
}

function getPayout(cents: number, position: number, config: Record<string, number> | null) {
  if (!config) return 0;
  const pct = config[String(position)];
  if (!pct) return 0;
  return Math.round(cents * pct);
}

export default function PremiumLeaguesTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLeague, setExpandedLeague] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/premium-leagues');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const symbol = data?.market?.currencySymbol || 'MK';
  const leagues = data?.leagues || [];
  const hasMembership = data?.hasMembership || false;
  const isAdmin = data?.isAdmin || false;

  return (
    <div className="px-4 sm:px-6 lg:px-8 space-y-6">
      {/* MEMBERSHIP GATE */}
      {!hasMembership && !loading && (
        <div className="bg-gradient-to-br from-ccb-primary/10 to-ccb-accent/10 border border-ccb-primary/30 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-ccb-primary/20 border border-ccb-primary/30 flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6 text-ccb-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm mb-1">Premium Membership Required</h3>
              <p className="text-xs text-ccb-muted leading-relaxed">
                Premium Leagues are exclusive to CrazyChess Club members. Join for{' '}
                {formatMoney(data?.market?.membershipPrice || 1000000, symbol)}/month
                to access tiered leagues, prize pools, promotion/relegation, and exclusive competitions.
              </p>
              <Link href="/league/subscribe" className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white text-xs font-bold shadow-lg shadow-ccb-primary/20">
                <Crown className="w-4 h-4" /> Join the Club
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* PLAYER JOURNEY */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-3 flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> Player Journey
        </h3>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {['Open Tournaments', 'Premium', 'Open League', 'Amateur', 'Bronze', 'Championship', 'Premier', 'Champion'].map((step, i, arr) => (
            <div key={step} className="flex items-center gap-1.5 shrink-0">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${
                i === 0 ? 'bg-ccb-accent/10 text-ccb-accent' :
                i === 1 ? 'bg-ccb-primary/10 text-ccb-primary' :
                i === arr.length - 1 ? 'bg-gradient-to-r from-ccb-primary to-ccb-accent text-white' :
                'bg-ccb-surface text-ccb-muted'
              }`}>
                {step}
              </span>
              {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-ccb-muted shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* LEAGUE CARDS */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="bg-ccb-card border border-ccb-border rounded-2xl h-48" />)}
        </div>
      ) : error ? (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <AlertCircle className="w-8 h-8 text-ccb-danger mx-auto mb-3" />
          <p className="text-sm text-ccb-muted">{error}</p>
          <button onClick={fetchData} className="mt-3 btn-primary text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {leagues.map((league) => {
            const meta = getLeagueMeta(league.tier);
            const Icon = meta.icon;
            const isExpanded = expandedLeague === league.tier;
            const prizeFormatted = formatMoney(league.prize_pool_cents, league.prize_currency || symbol);
            const standings = league.standings || [];
            const capacity = league.league_size || 0;
            const isFull = capacity > 0 && league.playerCount >= capacity;

            return (
              <div
                key={league.id}
                className={`bg-ccb-card border rounded-2xl overflow-hidden transition-all ${
                  isExpanded ? `${meta.borderColor} shadow-xl` : 'border-ccb-border'
                }`}
              >
                {/* LEAGUE HEADER */}
                <button
                  onClick={() => setExpandedLeague(isExpanded ? null : league.tier)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl ${meta.bgColor} border ${meta.borderColor} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-6 h-6 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.bgColor} ${meta.color}`}>L{league.tier}</span>
                        <h3 className="font-bold text-sm truncate">{league.name}</h3>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-ccb-muted">
                        <span className="flex items-center gap-1"><Trophy className="w-3 h-3" /> {prizeFormatted}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {league.playerCount}{capacity > 0 ? `/${capacity}` : ''}</span>
                        {league.status === 'active' && (
                          <span className="flex items-center gap-1 text-ccb-success"><Calendar className="w-3 h-3" /> MD {league.current_matchday}/{league.total_matchdays || '?'}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className={`w-5 h-5 text-ccb-muted shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {/* EXPANDED CONTENT */}
                {isExpanded && (
                  <div className="border-t border-ccb-border p-4 space-y-4">
                    {/* PRIZE POOL BREAKDOWN */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5" /> Prize Pool — {prizeFormatted}
                      </h4>
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map(pos => {
                          const payout = getPayout(league.prize_pool_cents, pos, league.payout_config);
                          return (
                            <div key={pos} className="text-center bg-ccb-surface rounded-lg p-2">
                              <div className={`text-[10px] font-bold ${meta.color}`}>#{pos}</div>
                              <div className="text-xs font-bold mt-0.5">{formatMoney(payout, league.prize_currency || symbol)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* PROMOTION / RELEGATION */}
                    <div className="flex gap-2">
                      {league.promotes_count > 0 && (
                        <div className="flex-1 bg-ccb-success/10 border border-ccb-success/30 rounded-xl p-3 text-center">
                          <ArrowUp className="w-4 h-4 text-ccb-success mx-auto mb-1" />
                          <div className="text-xs font-bold text-ccb-success">Top {league.promotes_count} Promoted</div>
                        </div>
                      )}
                      {league.relegates_count > 0 && (
                        <div className="flex-1 bg-ccb-danger/10 border border-ccb-danger/30 rounded-xl p-3 text-center">
                          <ArrowDown className="w-4 h-4 text-ccb-danger mx-auto mb-1" />
                          <div className="text-xs font-bold text-ccb-danger">Bottom {league.relegates_count} Relegated</div>
                        </div>
                      )}
                    </div>

                    {/* QUALIFYING POSITIONS */}
                    <div className="bg-ccb-accent/10 border border-ccb-accent/30 rounded-xl p-3 flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-ccb-accent shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-ccb-accent">Top {league.qualifying_positions} Qualify for Premium Competitions</div>
                        <div className="text-[10px] text-ccb-muted mt-0.5">Champions League, Sponsored Shield & more</div>
                      </div>
                    </div>

                    {/* STANDINGS */}
                    {standings.length > 0 ? (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2">Current Standings</h4>
                        <div className="space-y-1">
                          {standings.slice(0, 15).map((s) => {
                            const isPromotion = league.promotes_count > 0 && s.position <= league.promotes_count;
                            const isRelegation = league.relegates_count > 0 && s.position > (standings.length - league.relegates_count);
                            const isQualifying = s.position <= league.qualifying_positions;

                            return (
                              <div
                                key={s.player?.id || s.position}
                                className={`flex items-center gap-3 p-2 rounded-lg ${
                                  isPromotion ? 'bg-ccb-success/5' :
                                  isRelegation ? 'bg-ccb-danger/5' :
                                  isQualifying ? 'bg-ccb-accent/5' : ''
                                }`}
                              >
                                <span className={`text-xs font-bold w-6 text-center ${
                                  isPromotion ? 'text-ccb-success' :
                                  isRelegation ? 'text-ccb-danger' :
                                  isQualifying ? 'text-ccb-accent' : 'text-ccb-muted'
                                }`}>{s.position}</span>
                                <span className="text-xs font-medium flex-1 truncate">
                                  {s.player?.display_name || s.player?.username || 'Unknown'}
                                </span>
                                <span className="text-[10px] text-ccb-muted hidden sm:block">{s.player?.rating || '—'}</span>
                                <span className="text-xs font-bold">{s.points}pts</span>
                                <span className="text-[10px] text-ccb-muted hidden sm:block">{s.played}P</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Trophy className="w-8 h-8 text-ccb-muted mx-auto mb-2" />
                        <p className="text-xs text-ccb-muted">
                          {league.status === 'upcoming' ? 'League not started yet' : 'No standings available'}
                        </p>
                        {league.status === 'upcoming' && (
                          <p className="text-[10px] text-ccb-muted mt-1">{league.registrationCount} registered</p>
                        )}
                      </div>
                    )}

                    {/* SPONSOR */}
                    {league.sponsor_name && (
                      <div className="flex items-center gap-2 text-xs text-ccb-muted">
                        <span>Sponsored by</span>
                        <span className="font-semibold">{league.sponsor_name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* PREMIUM COMPETITIONS SECTION */}
      <div className="pt-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ccb-muted mb-3 flex items-center gap-1.5">
          <Swords className="w-4 h-4" /> Exclusive Premium Competitions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Champions League */}
          <div className="bg-gradient-to-br from-ccb-primary/10 to-ccb-accent/10 border border-ccb-primary/30 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-ccb-primary/20 border border-ccb-primary/30 flex items-center justify-center">
                <Crown className="w-5 h-5 text-ccb-primary" />
              </div>
              <div>
                <h4 className="font-bold text-sm">CrazyChess Champions League</h4>
                <p className="text-[10px] text-ccb-muted">Top 10 from each league · 50 qualifiers</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-3">
              {['Groups', 'Knockouts', 'Semis', 'Final'].map((stage, i, arr) => (
                <div key={stage} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted">{stage}</span>
                  {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-ccb-muted" />}
                </div>
              ))}
            </div>
          </div>

          {/* Sponsored Shield */}
          <div className="bg-gradient-to-br from-ccb-accent/10 to-ccb-primary/10 border border-ccb-accent/30 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-ccb-accent/20 border border-ccb-accent/30 flex items-center justify-center">
                <Shield className="w-5 h-5 text-ccb-accent" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Airtel CrazyChess Shield</h4>
                <p className="text-[10px] text-ccb-muted">Premium-only · Sponsored competition</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted">Configurable</span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted">Groups</span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted">Knockouts</span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted">Prizes</span>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-ccb-muted text-center mt-3">
          Premium competitions appear when leagues are active. Admin can configure format, qualification, prize pools and eligibility.
        </p>
      </div>

      {/* ADMIN NOTE */}
      {isAdmin && (
        <div className="bg-ccb-primary/10 border border-ccb-primary/30 rounded-xl p-3 text-xs text-ccb-primary font-semibold flex items-center gap-2">
          <Crown className="w-4 h-4" /> Admin — League capacity, prize pools, promotion/relegation and payout config are editable from the admin dashboard.
        </div>
      )}
    </div>
  );
}
