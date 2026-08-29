'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Crown, Trophy, ArrowUp, ArrowDown, Users, Calendar, RefreshCw,
  AlertCircle, Lock, Star, Award, Shield, ChevronRight, Sparkles,
  TrendingUp, Medal, Swords, Target, CheckCircle, XCircle, Loader2,
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

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
  action: string | null;
  actionLabel: string | null;
}

interface Qualification {
  canJoin: boolean;
  reason: string | null;
  isRegistered: boolean;
  checklist: ChecklistItem[] | null;
  regStatus: string | null;
}

interface League {
  id: string;
  name: string;
  status: string;
  entry_type: string;
  tier: number;
  gender_restriction: string;
  league_size: number;
  prize_pool: number;
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
  qualification: Qualification;
}

interface ApiResponse {
  success: boolean;
  isAdmin: boolean;
  hasMembership: boolean;
  userId: string | null;
  userGender: string | null;
  userIdentityVerified: boolean | null;
  recommendedTier: number | null;
  market: {
    currencyCode: string;
    currencySymbol: string;
    membershipPrice: number;
    membershipActive: boolean;
  };
  leagues: League[];
}

interface PremiumCompetition {
  id: string;
  name: string;
  type: 'champions_league' | 'shield' | 'cup' | 'custom';
  description: string | null;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  format: { stages?: string[]; groupStage?: boolean; knockoutRounds?: boolean };
  prize_pool: number;
  prize_currency: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  requires_membership: boolean;
  participantCount: number;
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

function formatMoney(cents: number, symbol: string, rate: number = 1) {
  const converted = Math.round(cents * rate);
  return `${symbol}${converted.toLocaleString()}`;
}

function getSymbol(currencyCode: string): string {
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    return parts.find(p => p.type === "currency")?.value || currencyCode;
  } catch {
    return currencyCode;
  }
}

function getPayout(cents: number, position: number, config: Record<string, number> | null) {
  if (!config) return 0;
  const pct = config[String(position)];
  if (!pct) return 0;
  return Math.round(cents * pct);
}

const REASON_LABELS: Record<string, string> = {
  not_authenticated: 'Sign in to register',
  already_joined: 'You are a player in this league',
  already_registered: 'Registration pending approval',
  completed: 'League season completed',
  not_registration_phase: 'Registration not open yet',
  registration_closed: 'Registration deadline passed',
  requirements_not_met: 'Requirements not met',
  full: 'League is full',
};

export default function PremiumLeaguesTab() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLeague, setExpandedLeague] = useState<number | null>(null);
  const [genderView, setGenderView] = useState<'male' | 'female' | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [registerMsg, setRegisterMsg] = useState<{ leagueId: string; type: 'success' | 'error'; msg: string } | null>(null);
  const [competitions, setCompetitions] = useState<PremiumCompetition[]>([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/premium-leagues');
      const json = await res.json();
      setData(json);
      // Lock to player's own gender — no browsing the other gender's leagues
      if (json.userGender === 'female') setGenderView('female');
      else if (json.userGender === 'male') setGenderView('male');
      else setGenderView('male'); // default for unverified/unset
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompetitions = async () => {
    setCompetitionsLoading(true);
    try {
      const res = await fetch('/api/league/premium-competitions');
      const json = await res.json();
      setCompetitions(json.competitions || []);
    } catch {
      setCompetitions([]);
    } finally {
      setCompetitionsLoading(false);
    }
  };

  const [visitorCurrency, setVisitorCurrency] = useState<string>('MWK');
  const [fxRate, setFxRate] = useState<number>(1);

  useEffect(() => {
    fetchData();
    fetchCompetitions();
    // Fetch visitor's currency for prize pool conversion
    fetch('/api/currency').then(r => r.json()).then(c => {
      if (c.currencyCode) setVisitorCurrency(c.currencyCode);
      if (c.rate) setFxRate(c.rate);
    }).catch(() => {});
  }, []);

  const handleRegister = async (leagueId: string) => {
    setRegistering(leagueId);
    setRegisterMsg(null);
    try {
      const res = await fetch('/api/league/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to register');
      setRegisterMsg({ leagueId, type: 'success', msg: 'Registration submitted! Pending approval.' });
      await fetchData();
    } catch (err: any) {
      setRegisterMsg({ leagueId, type: 'error', msg: err.message });
    } finally {
      setRegistering(null);
    }
  };

  const symbol = fxRate !== 1 ? getSymbol(visitorCurrency) : (data?.market?.currencySymbol || 'MK');
  const allLeagues = data?.leagues || [];
  // 'open' leagues (Season 1) are visible to everyone. Gender-restricted
  // leagues ('male'/'female') are locked to the player's own gender.
  const leagues = allLeagues.filter(l => l.gender_restriction === 'open' || l.gender_restriction === genderView);
  const hasMembership = data?.hasMembership || false;
  // Only show the membership upsell if there's actually a membership-gated league
  // the player hasn't unlocked yet. Season 1 leagues are all free entry, so this
  // stays hidden until paid tiers exist — avoids contradicting "Free Entry" messaging.
  const hasMembershipGatedLeague = allLeagues.some(l => l.entry_type === 'membership');

  return (
    <div className="px-4 sm:px-6 lg:px-8 space-y-6">
      {/* MEMBERSHIP GATE */}
      {!hasMembership && hasMembershipGatedLeague && !loading && (
        <div className="bg-gradient-to-br from-ccb-primary/10 to-ccb-accent/10 border border-ccb-primary/30 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-ccb-primary/20 border border-ccb-primary/30 flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6 text-ccb-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm mb-1">Premium Membership Required</h3>
              <p className="text-xs text-ccb-muted leading-relaxed">
                Premium Leagues are exclusive to CrazyChess Club members. Join for{' '}
                {formatMoney(data?.market?.membershipPrice || 1000000, symbol, fxRate)}/month
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
          {['Open Tournaments', 'Open League', 'Amateur', 'Bronze', 'Championship', 'Premier', 'Champion'].map((step, i, arr) => (
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
      ) : leagues.length === 0 ? (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <AlertCircle className="w-8 h-8 text-ccb-muted mx-auto mb-3" />
          <p className="text-sm text-ccb-muted">No leagues available right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leagues.map((league) => {
            const meta = getLeagueMeta(league.tier);
            const Icon = meta.icon;
            const isExpanded = expandedLeague === league.tier;
            const prizeFormatted = formatMoney(league.prize_pool, fxRate !== 1 ? symbol : (league.prize_currency || symbol), fxRate !== 1 ? fxRate : 1);
            const standings = league.standings || [];
            const capacity = league.league_size || 0;
            const qual = league.qualification;
            const showRegisterBtn = qual?.canJoin === true;
            const isRegistered = qual?.isRegistered;
            const isFull = capacity > 0 && league.playerCount >= capacity;

            return (
              <div
                key={league.id}
                className={`bg-ccb-card border rounded-2xl overflow-hidden transition-all ${
                  isExpanded ? `${meta.borderColor} shadow-xl` : 'border-ccb-border'
                }`}
              >
                {/* ── COMPACT LEAGUE HEADER ── */}
                <button
                  onClick={() => setExpandedLeague(isExpanded ? null : league.tier)}
                  className="w-full p-3.5 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${meta.bgColor} border ${meta.borderColor} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5.5 h-5.5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Title row: tier badge, name, status badges — all inline */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.bgColor} ${meta.color}`}>L{league.tier}</span>
                        {data?.recommendedTier === league.tier && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ccb-primary/20 text-ccb-primary flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5" /> Recommended
                          </span>
                        )}
                        <h3 className="font-bold text-sm truncate flex-1 min-w-0">{league.name}</h3>
                      </div>
                      {/* Meta: players · prize · status — wraps on small screens */}
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-ccb-muted flex-wrap">
                        <span className="flex items-center gap-0.5 shrink-0"><Users className="w-3 h-3" />{league.playerCount}{capacity > 0 ? `/${capacity}` : ''}</span>
                        <span className="text-ccb-border">|</span>
                        <span className="flex items-center gap-0.5 shrink-0"><Trophy className="w-3 h-3" />{prizeFormatted}</span>
                        {league.status === 'registration' && (
                          <>
                            <span className="text-ccb-border">|</span>
                            <span className="flex items-center gap-0.5 shrink-0 text-ccb-success font-medium">OPEN{isFull ? ' · FULL' : league.entry_type !== 'membership' ? ' · FREE' : ''}</span>
                          </>
                        )}
                        {league.status === 'active' && (
                          <>
                            <span className="text-ccb-border">|</span>
                            <span className="flex items-center gap-0.5 shrink-0 text-ccb-primary font-medium">MD {league.current_matchday}/{league.total_matchdays || '?'}</span>
                          </>
                        )}
                        {league.status === 'completed' && (
                          <>
                            <span className="text-ccb-border">|</span>
                            <span className="flex items-center gap-0.5 shrink-0 text-ccb-muted">Finished</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Register/Registering status on collapsed card */}
                    {!isExpanded && (
                      <div className="shrink-0">
                        {isRegistered ? (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-success/10 text-ccb-success flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> In
                          </span>
                        ) : showRegisterBtn && league.status === 'registration' && !isFull ? (
                          <span className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-ccb-primary to-ccb-accent text-white">
                            Join
                          </span>
                        ) : league.status === 'registration' && isFull ? (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted">Full</span>
                        ) : null}
                      </div>
                    )}
                    <ChevronRight className={`w-5 h-5 text-ccb-muted shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {/* ── EXPANDED CONTENT ── */}
                {isExpanded && (
                  <div className="border-t border-ccb-border p-4 space-y-4">
                    {/* Registration progress bar */}
                    {league.status === 'registration' && capacity > 0 && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-ccb-muted">Registration</span>
                          <span className="font-medium">{league.playerCount}/{capacity}{isFull ? ' · Full' : ''}</span>
                        </div>
                        <div className="h-2 rounded-full bg-ccb-surface overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-ccb-primary to-ccb-accent transition-all"
                            style={{ width: `${Math.min(100, (league.playerCount / capacity) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Active season progress bar */}
                    {league.status === 'active' && league.total_matchdays > 0 && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-ccb-muted">Season Progress</span>
                          <span className="font-medium">Matchday {league.current_matchday} of {league.total_matchdays}</span>
                        </div>
                        <div className="h-2 rounded-full bg-ccb-surface overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-ccb-primary to-ccb-accent transition-all"
                            style={{ width: `${Math.min(100, (league.current_matchday / league.total_matchdays) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* PRIZE + PROMOTION/RELEGATION — compact 2-col */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-ccb-surface rounded-xl p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted mb-1">Prize Pool</div>
                        <div className="text-sm font-bold">{prizeFormatted}</div>
                        {league.payout_config && (
                          <div className="text-[10px] text-ccb-muted mt-0.5">
                            1st: {formatMoney(getPayout(league.prize_pool, 1, league.payout_config), fxRate !== 1 ? symbol : (league.prize_currency || symbol), fxRate !== 1 ? fxRate : 1)}
                          </div>
                        )}
                      </div>
                      <div className="bg-ccb-surface rounded-xl p-3 space-y-1">
                        {league.promotes_count > 0 && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <ArrowUp className="w-3 h-3 text-ccb-success" />
                            <span className="text-ccb-success font-medium">Top {league.promotes_count} ↑</span>
                          </div>
                        )}
                        {league.relegates_count > 0 && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <ArrowDown className="w-3 h-3 text-ccb-danger" />
                            <span className="text-ccb-danger font-medium">Bot {league.relegates_count} ↓</span>
                          </div>
                        )}
                        {league.qualifying_positions > 0 && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Sparkles className="w-3 h-3 text-ccb-accent" />
                            <span className="text-ccb-accent font-medium">Top {league.qualifying_positions} qualify</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* MID-SEASON JOIN INFO */}
                    {league.status === 'active' && (
                      <div className="bg-ccb-primary/5 border border-ccb-primary/20 rounded-xl p-3 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-ccb-primary shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold text-ccb-primary">Join Anytime</div>
                          <div className="text-[10px] text-ccb-muted mt-0.5 leading-snug">New players can join mid-season — you'll get fixtures for remaining matchdays and start with 0 points.</div>
                        </div>
                      </div>
                    )}

                    {/* QUALIFICATION CHECKLIST */}
                    {qual?.checklist && qual.checklist.filter((c) => c.required).length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2">Requirements</h4>
                        <div className="space-y-1">
                          {qual.checklist.filter((c) => c.required).map((item) => (
                            <div key={item.id} className="flex items-center gap-2 text-xs">
                              {item.done ? (
                                <CheckCircle className="w-4 h-4 text-ccb-success shrink-0" />
                              ) : (
                                <XCircle className="w-4 h-4 text-ccb-danger shrink-0" />
                              )}
                              <span className={item.done ? 'text-ccb-muted' : 'text-ccb-text font-medium'}>{item.label}</span>
                              {!item.done && item.action && (
                                <Link href={item.action} className="ml-auto text-[10px] font-bold text-ccb-primary hover:underline">
                                  {item.actionLabel}
                                </Link>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* REGISTRATION STATUS / BUTTON */}
                    {league.status === 'registration' && (
                      <div>
                        {isRegistered ? (
                          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${
                            qual.regStatus === 'player' || qual.regStatus === 'approved'
                              ? 'bg-ccb-success/10 border-ccb-success/30 text-ccb-success'
                              : 'bg-ccb-accent/10 border-ccb-accent/30 text-ccb-accent'
                          }`}>
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-xs font-bold">
                              {qual.regStatus === 'player' ? 'You\'re in this league!' :
                               qual.regStatus === 'approved' ? 'Registration approved!' :
                               'Registration pending approval'}
                            </span>
                          </div>
                        ) : showRegisterBtn && !isFull ? (
                          <button
                            onClick={() => handleRegister(league.id)}
                            disabled={registering === league.id}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-ccb-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {registering === league.id ? (
                              <><Loader2 className="w-4 h-4 animate-spin" /> Registering...</>
                            ) : (
                              <><Swords className="w-4 h-4" /> Register for {league.name}</>
                            )}
                          </button>
                        ) : (
                          <div className="px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border text-center">
                            <p className="text-xs text-ccb-muted">{REASON_LABELS[qual?.reason || ''] || (isFull ? 'League is full' : 'Registration not available')}</p>
                          </div>
                        )}
                        {registerMsg?.leagueId === league.id && (
                          <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${
                            registerMsg.type === 'success' ? 'bg-ccb-success/10 text-ccb-success' : 'bg-ccb-danger/10 text-ccb-danger'
                          }`}>
                            {registerMsg.msg}
                          </div>
                        )}
                      </div>
                    )}

                    {/* MID-SEASON JOIN BUTTON */}
                    {league.status === 'active' && !isRegistered && qual?.canJoin !== false && (
                      <button
                        onClick={() => handleRegister(league.id)}
                        disabled={registering === league.id}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-ccb-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {registering === league.id ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</>
                        ) : (
                          <><Swords className="w-4 h-4" /> Join Mid-Season</>
                        )}
                      </button>
                    )}

                    {/* STANDINGS — compact */}
                    {standings.length > 0 ? (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2">Standings</h4>
                        <div className="space-y-0.5">
                          {standings.slice(0, 10).map((s) => {
                            const isPromotion = league.promotes_count > 0 && s.position <= league.promotes_count;
                            const isRelegation = league.relegates_count > 0 && s.position > (standings.length - league.relegates_count);
                            const isQualifying = s.position <= league.qualifying_positions;

                            return (
                              <div
                                key={s.player?.id || s.position}
                                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${
                                  isPromotion ? 'bg-ccb-success/5' :
                                  isRelegation ? 'bg-ccb-danger/5' :
                                  isQualifying ? 'bg-ccb-accent/5' : ''
                                }`}
                              >
                                <span className={`text-xs font-bold w-5 text-center ${
                                  isPromotion ? 'text-ccb-success' :
                                  isRelegation ? 'text-ccb-danger' :
                                  isQualifying ? 'text-ccb-accent' : 'text-ccb-muted'
                                }`}>{s.position}</span>
                                {/* Avatar or initials */}
                                {s.player?.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={s.player.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                                ) : (
                                  <span className="w-5 h-5 rounded-full bg-ccb-surface text-[9px] font-bold flex items-center justify-center shrink-0 text-ccb-muted">
                                    {(s.player?.display_name || s.player?.username || '?')[0]?.toUpperCase()}
                                  </span>
                                )}
                                <span className="text-xs font-medium flex-1 truncate">
                                  {s.player?.display_name || s.player?.username || 'Unknown'}
                                </span>
                                <span className="text-[10px] text-ccb-muted shrink-0">{s.played}P</span>
                                <span className="text-xs font-bold shrink-0">{s.points}pts</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <Trophy className="w-7 h-7 text-ccb-muted mx-auto mb-2" />
                        <p className="text-xs text-ccb-muted">
                          {league.status === 'upcoming' ? 'League not started yet' :
                           league.status === 'registration' ? (
                             league.playerCount > 0
                               ? `${league.playerCount} player${league.playerCount === 1 ? '' : 's'} registered — season starts once we kick off`
                               : 'No players registered yet — be the first!'
                           ) : league.status === 'active' ? (
                             league.playerCount > 0
                               ? `${league.playerCount} player${league.playerCount === 1 ? '' : 's'} in the league — standings update after matchday 1`
                               : 'No players in this league yet'
                           ) : 'No standings available'}
                        </p>
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
        {competitionsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
            {[1, 2].map(i => <div key={i} className="bg-ccb-card border border-ccb-border rounded-2xl h-28" />)}
          </div>
        ) : competitions.length === 0 ? (
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-6 text-center">
            <Swords className="w-8 h-8 text-ccb-muted mx-auto mb-2" />
            <p className="text-sm font-bold text-ccb-text mb-1">Nothing on the board yet</p>
            <p className="text-xs text-ccb-muted">
              Champions League, Cups and sponsored showdowns land here first.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {competitions.map(comp => {
              const Icon = comp.type === 'shield' || comp.type === 'cup' ? Shield : Crown;
              const stages = comp.format?.stages && comp.format.stages.length > 0
                ? comp.format.stages
                : [
                    ...(comp.format?.groupStage ? ['Groups'] : []),
                    ...(comp.format?.knockoutRounds ? ['Knockouts', 'Semis', 'Final'] : []),
                  ];
              return (
                <div key={comp.id} className="bg-gradient-to-br from-ccb-primary/10 to-ccb-accent/10 border border-ccb-primary/30 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-ccb-primary/20 border border-ccb-primary/30 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-ccb-primary" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm truncate">{comp.name}</h4>
                      <p className="text-[10px] text-ccb-muted truncate">
                        {comp.sponsor_name ? `Sponsored by ${comp.sponsor_name}` : comp.description || 'Premium competition'}
                        {comp.participantCount > 0 ? ` · ${comp.participantCount} players` : ''}
                      </p>
                    </div>
                  </div>
                  {stages.length > 0 ? (
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      {stages.map((stage, i, arr) => (
                        <div key={stage} className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted">{stage}</span>
                          {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-ccb-muted" />}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted capitalize">{comp.status.replace('_', ' ')}</span>
                    {comp.prize_pool > 0 && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted">
                        {formatMoney(comp.prize_pool, fxRate !== 1 ? symbol : (comp.prize_currency === 'MWK' ? 'MK' : comp.prize_currency), fxRate !== 1 ? fxRate : 1)} prize
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
