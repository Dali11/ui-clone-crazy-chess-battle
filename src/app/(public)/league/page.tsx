'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import LeagueNav from '@/components/league/league-nav';
import {
  Trophy, Crown, Swords, Calendar, Users, RefreshCw, ShieldAlert,
  CheckCircle2, Lock, Sparkles, TrendingUp, Star, Zap, Medal,
  ChevronRight, Info, LogIn, X, ArrowRight, ArrowUp, ArrowDown,
  UserCheck, Phone, CreditCard, Gamepad2 as ChessIcon,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
  action?: string;
  actionLabel?: string;
  description?: string;
}

interface Competition {
  type: 'league' | 'swiss';
  id: string;
  name: string;
  country?: string;
  status: string;
  tier: number;
  genderRestriction: string;
  entryType: string;
  description?: string;
  playerCount: number;
  registrationCount?: number;
  maxPlayers?: number;
  currentMatchday?: number;
  totalMatchdays?: number;
  registrationDeadline?: string;
  promotesCount?: number;
  relegatesCount?: number;
  requiresPhoneVerification?: boolean;
  requiresIdentityVerification?: boolean;
  requiresChesscomVerification?: boolean;
  minGamesPlayed?: number;
  minAccountAgeDays?: number;
  minRating?: number;
  maxRating?: number;
  qualification: {
    canJoin: boolean;
    reason: string | null;
    status?: string;
    checklist?: ChecklistItem[];
  };
  // Swiss
  rounds?: number;
  startsAt?: string;
  isRegistered?: boolean;
}

interface TieredResponse {
  success: boolean;
  tiered: Record<number, { men: Competition[]; women: Competition[]; open: Competition[] }>;
  swissQualifiers: Competition[];
  user: { id: string } | null;
}

// ============================================================
// Helpers
// ============================================================

function getTierName(tier: number): string {
  switch (tier) {
    case 1: return 'Premier League';
    case 2: return 'Championship';
    case 3: return 'Division 2';
    case 4: return 'Division 3';
    default: return `Division ${tier}`;
  }
}

function getTierColor(tier: number): string {
  switch (tier) {
    case 1: return 'text-ccb-primary bg-ccb-primary/10 border-ccb-primary/30';
    case 2: return 'text-ccb-accent bg-ccb-accent/10 border-ccb-accent/30';
    default: return 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30';
  }
}

function getGenderLabel(gender: string): { label: string; badge: string } {
  switch (gender) {
    case 'male': return { label: "Men's", badge: 'text-blue-400 bg-blue-400/10 border-blue-400/30' };
    case 'female': return { label: "Women's", badge: 'text-pink-400 bg-pink-400/10 border-pink-400/30' };
    default: return { label: 'Open', badge: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
  }
}

function getStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case 'active': return { label: 'LIVE', color: 'text-ccb-success bg-ccb-success/10 border-ccb-success/30' };
    case 'registration': return { label: 'OPEN', color: 'text-ccb-accent bg-ccb-accent/10 border-ccb-accent/30' };
    case 'upcoming': return { label: 'SOON', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' };
    case 'completed': return { label: 'DONE', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
    default: return { label: status.toUpperCase(), color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
  }
}

// ============================================================
// Main Component
// ============================================================

export default function LeagueHomepage() {
  const [data, setData] = useState<TieredResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [checklistCompetition, setChecklistCompetition] = useState<Competition | null>(null);

  const fetchCompetitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/competitions');
      if (!res.ok) throw new Error('Failed to load competitions');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompetitions(); }, [fetchCompetitions]);

  const handleJoin = async (competition: Competition) => {
    // If there's a checklist and not all requirements are met, show the checklist
    if (competition.qualification.checklist) {
      const requiredItems = competition.qualification.checklist.filter(c => c.required);
      const unmetItems = requiredItems.filter(c => !c.done);
      if (unmetItems.length > 0) {
        setChecklistCompetition(competition);
        return;
      }
    }

    // All requirements met — proceed with joining
    setJoining(competition.id);
    setJoinMessage(null);
    try {
      const body: any = {};
      if (competition.type === 'league') body.leagueId = competition.id;
      else { body.tournamentId = competition.id; body.competitionType = 'swiss'; }

      const res = await fetch('/api/league/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setJoinMessage({ type: 'success', text: json.message || 'Successfully joined!' });
        fetchCompetitions();
      } else {
        setJoinMessage({ type: 'error', text: json.error || 'Failed to join' });
      }
    } catch (err: any) {
      setJoinMessage({ type: 'error', text: err.message });
    } finally {
      setJoining(null);
    }
  };

  const isGuest = !data?.user;
  const tiered = data?.tiered || {};
  const swissQualifiers = data?.swissQualifiers || [];
  const tiers = Object.keys(tiered).map(Number).sort((a, b) => a - b);

  const totalActive = [...tiers.flatMap(t => [...tiered[t].men, ...tiered[t].women, ...tiered[t].open])]
    .filter(c => c.status === 'active' || c.status === 'registration').length;
  const totalPlayers = [...tiers.flatMap(t => [...tiered[t].men, ...tiered[t].women, ...tiered[t].open])]
    .reduce((sum, c) => sum + (c.playerCount || 0), 0);

  return (
    <div className="min-h-screen bg-ccb-dark text-ccb-text font-sans pb-12">
      <LeagueNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">

        {/* HERO */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ccb-dark via-ccb-surface to-ccb-card border border-ccb-border shadow-2xl p-6 sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-ccb-accent/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-1/3 -bottom-20 w-80 h-80 bg-ccb-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent text-xs font-semibold tracking-wider uppercase">
                <Crown className="w-3.5 h-3.5" /> CrazyChess Competitive
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase">
                PLAY. COMPETE. <span className="text-ccb-accent">CLIMB.</span>
              </h1>
              <p className="text-xl sm:text-2xl font-bold text-ccb-primary tracking-wide">Become Champion.</p>
              <p className="text-ccb-muted text-sm sm:text-base max-w-2xl">
                {isGuest
                  ? 'Start at the bottom. Win your way up. Every season, the top 2 promote and the bottom 2 relegate. Qualify through Swiss tournaments and climb the pyramid to become champion.'
                  : 'Browse your division below. Complete your qualification checklist to join competitions. Win to promote, avoid relegation.'
                }
              </p>
              {isGuest && (
                <div className="flex flex-wrap gap-3 pt-2">
                  <Link href="/signup" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ccb-accent text-ccb-dark font-semibold hover:bg-ccb-gold transition-all shadow-lg shadow-ccb-accent/20">
                    <Sparkles className="w-4 h-4" /> Get Started
                  </Link>
                  <Link href="/login" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-ccb-border bg-ccb-surface text-ccb-text font-semibold hover:bg-ccb-card transition-all">
                    <LogIn className="w-4 h-4" /> Sign In
                  </Link>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 min-w-[260px]">
              <div className="bg-ccb-surface/90 border border-ccb-border rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-2 text-ccb-muted text-xs uppercase tracking-wider font-semibold mb-1">
                  <Trophy className="w-3.5 h-3.5 text-ccb-accent" /> Active
                </div>
                <div className="text-2xl font-black">{totalActive}</div>
                <div className="text-xs text-ccb-muted">competitions</div>
              </div>
              <div className="bg-ccb-surface/90 border border-ccb-border rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-2 text-ccb-muted text-xs uppercase tracking-wider font-semibold mb-1">
                  <Users className="w-3.5 h-3.5 text-ccb-accent" /> Players
                </div>
                <div className="text-2xl font-black">{totalPlayers}</div>
                <div className="text-xs text-ccb-muted">competing</div>
              </div>
              <div className="bg-ccb-surface/90 border border-ccb-border rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-2 text-ccb-muted text-xs uppercase tracking-wider font-semibold mb-1">
                  <Medal className="w-3.5 h-3.5 text-ccb-accent" /> Tiers
                </div>
                <div className="text-2xl font-black">{tiers.length || '—'}</div>
                <div className="text-xs text-ccb-muted">divisions</div>
              </div>
              <div className="bg-ccb-surface/90 border border-ccb-border rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-2 text-ccb-muted text-xs uppercase tracking-wider font-semibold mb-1">
                  <Swords className="w-3.5 h-3.5 text-ccb-accent" /> Qualifiers
                </div>
                <div className="text-2xl font-black">{swissQualifiers.length}</div>
                <div className="text-xs text-ccb-muted">Swiss events</div>
              </div>
            </div>
          </div>

          {joinMessage && (
            <div className={`relative z-10 mt-4 p-3 rounded-xl border text-sm font-medium ${
              joinMessage.type === 'success'
                ? 'bg-ccb-success/10 border-ccb-success/30 text-ccb-success'
                : 'bg-ccb-danger/10 border-ccb-danger/30 text-ccb-danger'
            }`}>
              {joinMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 inline mr-2" /> : <ShieldAlert className="w-4 h-4 inline mr-2" />}
              {joinMessage.text}
            </div>
          )}
        </header>

        {/* PYRAMID EXPLANATION */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 flex items-center justify-center">
                <ArrowUp className="w-5 h-5 text-ccb-success" />
              </div>
              <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">Promotion</span>
            </div>
            <h3 className="text-lg font-bold mb-1">Top 2 Go Up</h3>
            <p className="text-sm text-ccb-muted">Finish in the top 2 of your division to earn promotion to the tier above.</p>
          </div>
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center">
                <Crown className="w-5 h-5 text-ccb-primary" />
              </div>
              <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">The Pyramid</span>
            </div>
            <h3 className="text-lg font-bold mb-1">Start At The Bottom</h3>
            <p className="text-sm text-ccb-muted">New players enter at the lowest tier. Win your way up to the Premier League.</p>
          </div>
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-ccb-danger/10 border border-ccb-danger/30 flex items-center justify-center">
                <ArrowDown className="w-5 h-5 text-ccb-danger" />
              </div>
              <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">Relegation</span>
            </div>
            <h3 className="text-lg font-bold mb-1">Bottom 2 Go Down</h3>
            <p className="text-sm text-ccb-muted">Finish in the bottom 2 and you'll be relegated to the tier below. Fight to stay up!</p>
          </div>
        </section>

        {/* LOADING */}
        {loading && !data && (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="bg-ccb-card border border-ccb-border rounded-2xl p-6 h-40" />)}
          </div>
        )}

        {/* ERROR */}
        {error && !data && (
          <div className="bg-ccb-card border border-ccb-danger/30 rounded-2xl p-8 text-center">
            <ShieldAlert className="w-10 h-10 text-ccb-danger mx-auto mb-3" />
            <p className="text-ccb-muted">{error}</p>
            <button onClick={fetchCompetitions} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ccb-accent text-ccb-dark font-semibold hover:bg-ccb-gold">
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        )}

        {/* SWISS QUALIFIERS */}
        {!loading && swissQualifiers.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Swords className="w-5 h-5 text-ccb-accent" /> Swiss Qualifiers
              </h2>
              <span className="text-xs text-ccb-muted">{swissQualifiers.length} upcoming</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {swissQualifiers.map(comp => (
                <CompetitionCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} onShowChecklist={setChecklistCompetition} />
              ))}
            </div>
          </section>
        )}

        {/* TIERED LEAGUES */}
        {!loading && tiers.length > 0 && (
          <div className="space-y-8">
            {tiers.map(tier => {
              const tierData = tiered[tier];
              const allComps = [...(tierData.men || []), ...(tierData.women || []), ...(tierData.open || [])];
              if (allComps.length === 0) return null;

              return (
                <section key={tier}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getTierColor(tier)}`}>
                        TIER {tier}
                      </span>
                      <h2 className="text-xl font-bold">{getTierName(tier)}</h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ccb-muted">
                      <span className="flex items-center gap-1 text-ccb-success">
                        <ArrowUp className="w-3.5 h-3.5" /> 2 promote
                      </span>
                      <span className="flex items-center gap-1 text-ccb-danger">
                        <ArrowDown className="w-3.5 h-3.5" /> 2 relegate
                      </span>
                    </div>
                  </div>

                  {/* Men's Division */}
                  {tierData.men?.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold px-2 py-1 rounded-full border text-blue-400 bg-blue-400/10 border-blue-400/30">
                          MEN'S
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tierData.men.map(comp => (
                          <CompetitionCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} onShowChecklist={setChecklistCompetition} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Women's Division */}
                  {tierData.women?.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold px-2 py-1 rounded-full border text-pink-400 bg-pink-400/10 border-pink-400/30">
                          WOMEN'S
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tierData.women.map(comp => (
                          <CompetitionCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} onShowChecklist={setChecklistCompetition} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Open Division */}
                  {tierData.open?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold px-2 py-1 rounded-full border text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30">
                          OPEN
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tierData.open.map(comp => (
                          <CompetitionCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} onShowChecklist={setChecklistCompetition} />
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* EMPTY */}
        {!loading && !error && tiers.length === 0 && swissQualifiers.length === 0 && (
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-12 text-center">
            <Trophy className="w-12 h-12 text-ccb-muted mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">No competitions yet</h3>
            <p className="text-ccb-muted text-sm">New competitions are coming soon. Check back or follow us for updates.</p>
          </div>
        )}

        {/* INFO */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-ccb-accent" /> How Promotion Works
            </h3>
            <p className="text-xs text-ccb-muted leading-relaxed">
              At the end of each season, the top 2 players in each division are promoted to the tier above. The bottom 2 are relegated down. New players start at the lowest tier and must win their way up to the Premier League.
            </p>
          </div>
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-ccb-accent" /> Qualification Checklist
            </h3>
            <p className="text-xs text-ccb-muted leading-relaxed">
              Before joining any competition, you must complete a qualification checklist. This includes profile completion, gender selection, phone verification, and identity verification. Some competitions also require Chess.com linkage and an active membership.
            </p>
          </div>
        </section>
      </div>

      {/* QUALIFICATION CHECKLIST MODAL */}
      {checklistCompetition && (
        <QualificationModal
          competition={checklistCompetition}
          onClose={() => setChecklistCompetition(null)}
          onJoin={() => {
            setChecklistCompetition(null);
            handleJoin({ ...checklistCompetition, qualification: { ...checklistCompetition.qualification, checklist: checklistCompetition.qualification.checklist?.map(c => ({ ...c, done: true })) } });
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Competition Card
// ============================================================

function CompetitionCard({
  competition,
  onJoin,
  joining,
  onShowChecklist,
}: {
  competition: Competition;
  onJoin: (c: Competition) => void;
  joining: boolean;
  onShowChecklist: (c: Competition) => void;
}) {
  const statusInfo = getStatusLabel(competition.status);
  const genderInfo = getGenderLabel(competition.genderRestriction);
  const isLeague = competition.type === 'league';
  const isMembership = competition.entryType === 'membership';
  const canJoin = competition.qualification.canJoin;
  const isParticipating = competition.qualification.status === 'participating' || competition.isRegistered;
  const checklist = competition.qualification.checklist;
  const requiredItems = checklist?.filter(c => c.required) || [];
  const completedItems = requiredItems.filter(c => c.done);
  const progress = requiredItems.length > 0 ? Math.round((completedItems.length / requiredItems.length) * 100) : 100;

  return (
    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5 hover:border-ccb-accent/30 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isLeague ? 'bg-ccb-primary/10 border border-ccb-primary/30' : 'bg-ccb-accent/10 border border-ccb-accent/30'
          }`}>
            {isLeague ? <Crown className="w-5 h-5 text-ccb-primary" /> : <Swords className="w-5 h-5 text-ccb-accent" />}
          </div>
          <div>
            <h3 className="font-bold text-sm">{competition.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-ccb-muted">
                {isLeague ? `Tier ${competition.tier} · ${genderInfo.label}` : 'Swiss Qualifier'}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isMembership ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30">MEMBERSHIP</span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-success/10 text-ccb-success border border-ccb-success/30">FREE</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-3 text-xs text-ccb-muted">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> {competition.playerCount}
          {competition.maxPlayers ? `/${competition.maxPlayers}` : ''}
        </span>
        {isLeague && competition.currentMatchday != null && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> MD {competition.currentMatchday}/{competition.totalMatchdays || '?'}
          </span>
        )}
        {!isLeague && competition.rounds && (
          <span className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" /> {competition.rounds} rounds
          </span>
        )}
        {isLeague && competition.promotesCount && (
          <span className="flex items-center gap-1 text-ccb-success">
            <ArrowUp className="w-3.5 h-3.5" /> {competition.promotesCount} promote
          </span>
        )}
        {isLeague && competition.relegatesCount && (
          <span className="flex items-center gap-1 text-ccb-danger">
            <ArrowDown className="w-3.5 h-3.5" /> {competition.relegatesCount} relegate
          </span>
        )}
      </div>

      {/* Rating requirements */}
      {(competition.minRating || 0) > 0 && (
        <div className="flex items-center gap-2 mb-3 text-xs text-ccb-muted">
          <Star className="w-3.5 h-3.5 text-ccb-accent" />
          {competition.maxRating
            ? `Rating: ${competition.minRating}–${competition.maxRating}`
            : `Min rating: ${competition.minRating}`}
        </div>
      )}

      {/* Qualification progress bar (if not eligible and has checklist) */}
      {checklist && !canJoin && competition.qualification.reason === 'requirements_not_met' && requiredItems.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-ccb-muted">Qualification: {completedItems.length}/{requiredItems.length} done</span>
            <span className="text-ccb-accent font-semibold">{progress}%</span>
          </div>
          <div className="w-full bg-ccb-surface h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-ccb-accent to-ccb-primary h-full rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="pt-3 border-t border-ccb-border">
        {isParticipating ? (
          <Link
            href={isLeague ? '/league/table' : '/league'}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-success/10 text-ccb-success border border-ccb-success/30 font-semibold text-sm hover:bg-ccb-success/20 transition-all"
          >
            <CheckCircle2 className="w-4 h-4" /> Participating — View
            <ChevronRight className="w-4 h-4" />
          </Link>
        ) : canJoin ? (
          <button
            onClick={() => onJoin(competition)}
            disabled={joining}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-accent text-ccb-dark font-bold text-sm hover:bg-ccb-gold transition-all shadow-lg shadow-ccb-accent/20 disabled:opacity-50"
          >
            {joining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Join Now
          </button>
        ) : competition.qualification.reason === 'requirements_not_met' ? (
          <button
            onClick={() => onShowChecklist(competition)}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30 font-bold text-sm hover:bg-ccb-primary/20 transition-all"
          >
            <UserCheck className="w-4 h-4" /> View Checklist ({completedItems.length}/{requiredItems.length})
          </button>
        ) : competition.qualification.reason === 'not_authenticated' ? (
          <Link href="/login" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-ccb-border bg-ccb-surface text-ccb-text font-medium text-sm hover:bg-ccb-card">
            <LogIn className="w-4 h-4" /> Sign In to Join
          </Link>
        ) : (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-ccb-border bg-ccb-surface/50 text-ccb-muted font-medium text-sm">
            <Lock className="w-4 h-4" />
            {competition.qualification.reason === 'already_started' ? 'In Progress' :
             competition.qualification.reason === 'registration_closed' ? 'Registration Closed' :
             competition.qualification.reason === 'completed' ? 'Competition Ended' :
             competition.qualification.reason === 'full' ? 'Competition Full' :
             'Not Available'}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Qualification Modal
// ============================================================

function QualificationModal({
  competition,
  onClose,
  onJoin,
}: {
  competition: Competition;
  onClose: () => void;
  onJoin: () => void;
}) {
  const checklist = competition.qualification.checklist || [];
  const requiredItems = checklist.filter(c => c.required);
  const completedItems = requiredItems.filter(c => c.done);
  const allMet = requiredItems.every(c => c.done);
  const genderInfo = getGenderLabel(competition.genderRestriction);

  const checklistIcons: Record<string, React.ReactNode> = {
    profile_complete: <UserCheck className="w-5 h-5" />,
    gender_selected: <UserCheck className="w-5 h-5" />,
    gender_requirement: <UserCheck className="w-5 h-5" />,
    phone_verified: <Phone className="w-5 h-5" />,
    identity_verified: <CreditCard className="w-5 h-5" />,
    chesscom_linked: <ChessIcon className="w-5 h-5" />,
    min_games: <Swords className="w-5 h-5" />,
    account_age: <Calendar className="w-5 h-5" />,
    rating: <Star className="w-5 h-5" />,
    membership: <Crown className="w-5 h-5" />,
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-ccb-card border border-ccb-border rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-ccb-card border-b border-ccb-border p-5 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-ccb-primary" />
            </div>
            <div>
              <h3 className="font-bold text-base">Qualification Checklist</h3>
              <p className="text-xs text-ccb-muted">
                {competition.name} · {getTierName(competition.tier)} · {genderInfo.label}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-ccb-surface transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="p-5 border-b border-ccb-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Progress: {completedItems.length}/{requiredItems.length}</span>
            <span className={`text-sm font-bold ${allMet ? 'text-ccb-success' : 'text-ccb-accent'}`}>
              {allMet ? 'All requirements met!' : 'Requirements pending'}
            </span>
          </div>
          <div className="w-full bg-ccb-surface h-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allMet ? 'bg-ccb-success' : 'bg-gradient-to-r from-ccb-accent to-ccb-primary'}`}
              style={{ width: `${requiredItems.length > 0 ? (completedItems.length / requiredItems.length) * 100 : 100}%` }}
            />
          </div>
        </div>

        {/* Checklist items */}
        <div className="p-5 space-y-3">
          {checklist.filter(c => c.required).map((item) => (
            <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
              item.done ? 'border-ccb-success/30 bg-ccb-success/5' : 'border-ccb-border bg-ccb-surface/50'
            }`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                item.done ? 'bg-ccb-success/10 text-ccb-success' : 'bg-ccb-muted/10 text-ccb-muted'
              }`}>
                {checklistIcons[item.id] || <UserCheck className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${item.done ? 'text-ccb-text' : 'text-ccb-muted'}`}>
                    {item.label}
                  </span>
                  {item.done && <CheckCircle2 className="w-4 h-4 text-ccb-success shrink-0" />}
                </div>
                {item.description && (
                  <p className="text-xs text-ccb-muted mt-0.5">{item.description}</p>
                )}
                {!item.done && item.action && (
                  <Link
                    href={item.action}
                    className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-ccb-accent hover:underline"
                  >
                    {item.actionLabel} <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
                {!item.done && !item.action && (
                  <p className="text-xs text-ccb-muted mt-1 italic">No action available — please wait.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-ccb-card border-t border-ccb-border p-5 rounded-b-2xl">
          {allMet ? (
            <button
              onClick={onJoin}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-ccb-accent text-ccb-dark font-bold text-sm hover:bg-ccb-gold transition-all shadow-lg shadow-ccb-accent/20"
            >
              <Zap className="w-4 h-4" /> Join Competition
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-ccb-muted text-center">
                Complete the remaining requirements above to unlock this competition.
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl border border-ccb-border bg-ccb-surface text-ccb-text font-medium text-sm hover:bg-ccb-card"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
