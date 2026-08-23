'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import LeagueNav from '@/components/league/league-nav';
import {
  Trophy, Crown, Swords, Calendar, Users, RefreshCw, ShieldAlert,
  CheckCircle2, Lock, ArrowRight, Sparkles, TrendingUp, Star,
  Zap, Medal, ChevronRight, Info, LogIn,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface Competition {
  type: 'league' | 'swiss';
  id: string;
  name: string;
  country?: string;
  status: string;
  entryType: string;
  description?: string;
  playerCount: number;
  registrationCount?: number;
  maxPlayers?: number;
  currentMatchday?: number;
  totalMatchdays?: number;
  registrationDeadline?: string;
  requiresQualification?: boolean;
  minRating?: number;
  maxRating?: number;
  qualification: {
    canJoin: boolean;
    reason: string | null;
    status?: string;
  };
  // Swiss-specific
  rounds?: number;
  startsAt?: string;
  timeControl?: string;
  entryFee?: number;
  isRegistered?: boolean;
}

interface CompetitionsResponse {
  success: boolean;
  competitions: Competition[];
  user: { id: string } | null;
  membership: any;
}

// ============================================================
// Helpers
// ============================================================

function getStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case 'active': return { label: 'LIVE', color: 'text-ccb-success bg-ccb-success/10 border-ccb-success/30' };
    case 'registration': return { label: 'OPEN REGISTRATION', color: 'text-ccb-accent bg-ccb-accent/10 border-ccb-accent/30' };
    case 'upcoming': return { label: 'UPCOMING', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' };
    case 'completed': return { label: 'COMPLETED', color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
    case 'pending': return { label: 'PENDING APPROVAL', color: 'text-orange-400 bg-orange-400/10 border-orange-400/30' };
    default: return { label: status.toUpperCase(), color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
  }
}

function getQualificationMessage(reason: string | null): { message: string; action?: string } {
  switch (reason) {
    case 'already_joined': return { message: 'You are in this competition', action: 'View' };
    case 'already_registered': return { message: 'Registration pending', action: 'View' };
    case 'not_registration_phase': return { message: 'Registration not open yet' };
    case 'completed': return { message: 'This competition has ended' };
    case 'membership_required': return { message: 'CrazyChess Club membership required', action: 'Get Membership' };
    case 'rating_too_low': return { message: 'Your rating is below the minimum' };
    case 'rating_too_high': return { message: 'Your rating is above the maximum' };
    case 'registration_closed': return { message: 'Registration deadline passed' };
    case 'not_authenticated': return { message: 'Sign in to join', action: 'Sign In' };
    case 'already_started': return { message: 'Already in progress' };
    case 'full': return { message: 'Competition is full' };
    case 'pending_approval': return { message: 'Awaiting approval' };
    default: return { message: 'Spectate only' };
  }
}

// ============================================================
// Main Component
// ============================================================

export default function LeagueHomepage() {
  const [competitionsData, setCompetitionsData] = useState<CompetitionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchCompetitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/league/competitions');
      if (!res.ok) throw new Error('Failed to load competitions');
      const json = await res.json();
      setCompetitionsData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompetitions();
  }, [fetchCompetitions]);

  const handleJoin = async (competition: Competition) => {
    setJoining(competition.id);
    setJoinMessage(null);
    try {
      const body: any = {};
      if (competition.type === 'league') {
        body.leagueId = competition.id;
      } else {
        body.tournamentId = competition.id;
        body.competitionType = 'swiss';
      }
      const res = await fetch('/api/league/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setJoinMessage({ type: 'success', text: json.message || 'Successfully joined!' });
        fetchCompetitions(); // Refresh
      } else {
        if (json.code === 'membership_required') {
          setJoinMessage({ type: 'error', text: 'You need an active CrazyChess Club membership to join this competition.' });
        } else {
          setJoinMessage({ type: 'error', text: json.error || 'Failed to join' });
        }
      }
    } catch (err: any) {
      setJoinMessage({ type: 'error', text: err.message });
    } finally {
      setJoining(null);
    }
  };

  const competitions = competitionsData?.competitions || [];
  const isGuest = !competitionsData?.user;
  const hasMembership = !!competitionsData?.membership;

  // Group competitions
  const activeCompetitions = competitions.filter(c => c.status === 'active' || c.status === 'registration');
  const upcomingCompetitions = competitions.filter(c => c.status === 'upcoming' || c.status === 'pending');
  const completedCompetitions = competitions.filter(c => c.status === 'completed');

  return (
    <div className="min-h-screen bg-ccb-dark text-ccb-text font-sans pb-12">
      <LeagueNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        
        {/* HERO SECTION */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ccb-dark via-ccb-surface to-ccb-card border border-ccb-border shadow-2xl p-6 sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-ccb-accent/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-1/3 -bottom-20 w-80 h-80 bg-ccb-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent text-xs font-semibold tracking-wider uppercase">
                <Crown className="w-3.5 h-3.5" /> CrazyChess Competitive
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-ccb-text uppercase drop-shadow-sm">
                PLAY. COMPETE. <span className="text-ccb-accent">CLIMB.</span>
              </h1>
              
              <p className="text-xl sm:text-2xl font-bold text-ccb-primary tracking-wide">
                Become Champion.
              </p>

              <p className="text-ccb-muted text-sm sm:text-base max-w-2xl">
                {isGuest
                  ? 'Join the CrazyChess competitive ecosystem. Qualify through Swiss tournaments, earn your place in the Premier League, and climb the rankings.'
                  : hasMembership
                    ? 'Your CrazyChess Club membership is active. Browse competitions below and join those you qualify for.'
                    : 'Browse active competitions below. Some competitions require a CrazyChess Club membership — upgrade anytime to unlock premium leagues.'
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

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3 min-w-[260px]">
              <div className="bg-ccb-surface/90 border border-ccb-border rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-2 text-ccb-muted text-xs uppercase tracking-wider font-semibold mb-1">
                  <Trophy className="w-3.5 h-3.5 text-ccb-accent" /> Active
                </div>
                <div className="text-2xl font-black text-ccb-text">{activeCompetitions.length}</div>
                <div className="text-xs text-ccb-muted">competitions</div>
              </div>
              <div className="bg-ccb-surface/90 border border-ccb-border rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-2 text-ccb-muted text-xs uppercase tracking-wider font-semibold mb-1">
                  <Users className="w-3.5 h-3.5 text-ccb-accent" /> Players
                </div>
                <div className="text-2xl font-black text-ccb-text">
                  {competitions.reduce((sum, c) => sum + (c.playerCount || 0), 0)}
                </div>
                <div className="text-xs text-ccb-muted">competing</div>
              </div>
              <div className="bg-ccb-surface/90 border border-ccb-border rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-2 text-ccb-muted text-xs uppercase tracking-wider font-semibold mb-1">
                  <Calendar className="w-3.5 h-3.5 text-ccb-accent" /> Upcoming
                </div>
                <div className="text-2xl font-black text-ccb-text">{upcomingCompetitions.length}</div>
                <div className="text-xs text-ccb-muted">competitions</div>
              </div>
              <div className="bg-ccb-surface/90 border border-ccb-border rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-2 text-ccb-muted text-xs uppercase tracking-wider font-semibold mb-1">
                  <Medal className="w-3.5 h-3.5 text-ccb-accent" /> Membership
                </div>
                <div className="text-2xl font-black text-ccb-text">
                  {hasMembership ? 'ACTIVE' : 'FREE'}
                </div>
                <div className="text-xs text-ccb-muted">{hasMembership ? 'unlocked' : 'not required for free leagues'}</div>
              </div>
            </div>
          </div>

          {/* Join message toast */}
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

        {/* HOW IT WORKS — On brand */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: 1, title: 'Qualify', desc: 'Compete in Swiss qualifier tournaments to earn your place.', icon: Swords },
            { step: 2, title: 'Compete', desc: 'Enter the Premier League and play weekly fixtures.', icon: Trophy },
            { step: 3, title: 'Climb', desc: 'Climb the standings, earn season points, become champion.', icon: TrendingUp },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.step} className="bg-ccb-card border border-ccb-border rounded-2xl p-5 hover:border-ccb-accent/30 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-ccb-accent" />
                  </div>
                  <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">Step {item.step}</span>
                </div>
                <h3 className="text-lg font-bold text-ccb-text mb-1">{item.title}</h3>
                <p className="text-sm text-ccb-muted">{item.desc}</p>
              </div>
            );
          })}
        </section>

        {/* LOADING STATE */}
        {loading && !competitionsData && (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-ccb-card border border-ccb-border rounded-2xl p-6 h-32" />
            ))}
          </div>
        )}

        {/* ERROR STATE */}
        {error && !competitionsData && (
          <div className="bg-ccb-card border border-ccb-danger/30 rounded-2xl p-8 text-center">
            <ShieldAlert className="w-10 h-10 text-ccb-danger mx-auto mb-3" />
            <p className="text-ccb-muted">{error}</p>
            <button onClick={fetchCompetitions} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ccb-accent text-ccb-dark font-semibold hover:bg-ccb-gold transition-all">
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        )}

        {/* ACTIVE COMPETITIONS */}
        {!loading && activeCompetitions.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Zap className="w-5 h-5 text-ccb-accent" /> Active Competitions
              </h2>
              <span className="text-xs text-ccb-muted">{activeCompetitions.length} live now</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeCompetitions.map(comp => (
                <CompetitionCard key={`${comp.type}-${comp.id}`} competition={comp} onJoin={handleJoin} joining={joining === comp.id} />
              ))}
            </div>
          </section>
        )}

        {/* UPCOMING COMPETITIONS */}
        {!loading && upcomingCompetitions.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-ccb-accent" /> Upcoming Competitions
              </h2>
              <span className="text-xs text-ccb-muted">{upcomingCompetitions.length} scheduled</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingCompetitions.map(comp => (
                <CompetitionCard key={`${comp.type}-${comp.id}`} competition={comp} onJoin={handleJoin} joining={joining === comp.id} />
              ))}
            </div>
          </section>
        )}

        {/* COMPLETED */}
        {!loading && completedCompetitions.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-ccb-muted" /> Past Competitions
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedCompetitions.slice(0, 4).map(comp => (
                <CompetitionCard key={`${comp.type}-${comp.id}`} competition={comp} onJoin={handleJoin} joining={joining === comp.id} />
              ))}
            </div>
          </section>
        )}

        {/* EMPTY STATE */}
        {!loading && !error && competitions.length === 0 && (
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-12 text-center">
            <Trophy className="w-12 h-12 text-ccb-muted mx-auto mb-4" />
            <h3 className="text-lg font-bold text-ccb-text mb-2">No competitions yet</h3>
            <p className="text-ccb-muted text-sm">New competitions are coming soon. Check back or follow us for updates.</p>
          </div>
        )}

        {/* FOOTER INFO */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
            <h3 className="text-sm font-bold text-ccb-text mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-ccb-accent" /> Free vs. Membership
            </h3>
            <p className="text-xs text-ccb-muted leading-relaxed">
              Free competitions are open to all registered players. Premium competitions require an active CrazyChess Club membership (MK5,000/month in Malawi). Look for the <span className="text-ccb-accent font-semibold">FREE</span> or <span className="text-ccb-primary font-semibold">MEMBERSHIP</span> badge on each competition.
            </p>
          </div>
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
            <h3 className="text-sm font-bold text-ccb-text mb-2 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-ccb-accent" /> Qualification
            </h3>
            <p className="text-xs text-ccb-muted leading-relaxed">
              Some leagues require you to qualify through Swiss tournaments first. Win or place highly in qualifiers to earn your spot. Your chess rating may also affect eligibility for certain divisions.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================
// Competition Card Component
// ============================================================

function CompetitionCard({
  competition,
  onJoin,
  joining,
}: {
  competition: Competition;
  onJoin: (c: Competition) => void;
  joining: boolean;
}) {
  const statusInfo = getStatusLabel(competition.status);
  const qualMsg = getQualificationMessage(competition.qualification.reason);
  const isLeague = competition.type === 'league';
  const isMembership = competition.entryType === 'membership';
  const canJoin = competition.qualification.canJoin;
  const isParticipating = competition.qualification.status === 'participating' || competition.isRegistered;

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
            <h3 className="font-bold text-ccb-text text-sm">{competition.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-ccb-muted">{isLeague ? 'Premier League' : 'Swiss Qualifier'}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isMembership ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30">
              MEMBERSHIP
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-success/10 text-ccb-success border border-ccb-success/30">
              FREE
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {competition.description && (
        <p className="text-xs text-ccb-muted mb-3 line-clamp-2">{competition.description}</p>
      )}

      {/* Stats Row */}
      <div className="flex items-center gap-4 mb-3 text-xs text-ccb-muted">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> {competition.playerCount}
          {competition.maxPlayers ? `/${competition.maxPlayers}` : ''} players
        </span>
        {isLeague && competition.currentMatchday && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> MD {competition.currentMatchday}/{competition.totalMatchdays || '?'}
          </span>
        )}
        {!isLeague && competition.rounds && (
          <span className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" /> {competition.rounds} rounds
          </span>
        )}
        {!isLeague && competition.startsAt && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> {new Date(competition.startsAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Rating requirements */}
      {((competition.minRating ?? 0) > 0 || competition.maxRating) && (
        <div className="flex items-center gap-2 mb-3 text-xs text-ccb-muted">
          <Star className="w-3.5 h-3.5 text-ccb-accent" />
          {(competition.minRating ?? 0) > 0 && competition.maxRating
            ? `Rating: ${competition.minRating ?? 0}–${competition.maxRating ?? 0}`
            : (competition.minRating ?? 0) > 0
              ? `Min rating: ${competition.minRating ?? 0}`
              : `Max rating: ${competition.maxRating ?? 0}`}
        </div>
      )}

      {/* CTA / Qualification Status */}
      <div className="pt-3 border-t border-ccb-border">
        {isParticipating ? (
          <Link
            href={isLeague ? '/league/table' : `/league`}
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
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-ccb-muted">
              <Lock className="w-3.5 h-3.5" />
              <span>{qualMsg.message}</span>
            </div>
            {qualMsg.action === 'Sign In' && (
              <Link href="/login" className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-ccb-border bg-ccb-surface text-ccb-text font-medium text-xs hover:bg-ccb-card transition-all">
                <LogIn className="w-3.5 h-3.5" /> Sign In to Join
              </Link>
            )}
            {qualMsg.action === 'Get Membership' && (
              <Link href="/league" className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-ccb-primary/30 bg-ccb-primary/10 text-ccb-primary font-medium text-xs hover:bg-ccb-primary/20 transition-all">
                <Crown className="w-3.5 h-3.5" /> Get Membership
              </Link>
            )}
            {qualMsg.action === 'View' && (
              <Link
                href={isLeague ? '/league/table' : '/league'}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-ccb-border bg-ccb-surface text-ccb-text font-medium text-xs hover:bg-ccb-card transition-all"
              >
                View Details <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
            {!qualMsg.action && (
              <div className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-ccb-border bg-ccb-surface/50 text-ccb-muted font-medium text-xs">
                Spectate Only
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
