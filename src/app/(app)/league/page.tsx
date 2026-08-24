'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import LeagueNav from '@/components/league/league-nav';
import {
  Trophy, Crown, Swords, Calendar, Users, RefreshCw, ShieldAlert,
  CheckCircle2, Lock, Sparkles, Star, Zap,
  ChevronRight, Info, LogIn, X, ArrowRight, ArrowUp, ArrowDown,
  UserCheck, Phone, CreditCard, Gamepad2 as ChessIcon, Clock,
  DollarSign, Pencil,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
  action?: string | null;
  actionLabel?: string | null;
}

interface Competition {
  type: 'league' | 'tournament';
  id: string;
  name: string;
  country?: string;
  status: string;
  tier?: number;
  genderRestriction?: string;
  entryType?: string;
  description?: string;
  playerCount: number;
  maxPlayers?: number | null;
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
  rounds?: number;
  startsAt?: string;
  timeControl?: string;
  entryFee?: number;
  isRegistered?: boolean;
}

interface ApiResponse {
  success: boolean;
  isAdmin: boolean;
  tiered: Record<number, { men: Competition[]; women: Competition[]; open: Competition[] }>;
  tournaments: Competition[];
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
    case 'pending': return { label: 'PENDING', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' };
    default: return { label: status.toUpperCase(), color: 'text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30' };
  }
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString();
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================================
// Main Component
// ============================================================

export default function LeagueHomepage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tournaments' | 'leagues'>('tournaments');
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
    if (competition.qualification.checklist) {
      const requiredItems = competition.qualification.checklist.filter(c => c.required);
      const unmetItems = requiredItems.filter(c => !c.done);
      if (unmetItems.length > 0) {
        setChecklistCompetition(competition);
        return;
      }
    }

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

  const isAdmin = data?.isAdmin || false;
  const tiered = data?.tiered || {};
  const tournaments = data?.tournaments || [];
  const tiers = Object.keys(tiered).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      <LeagueNav />

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

      {/* TABS */}
      <div className="flex items-center gap-1 border-b border-ccb-border">
        <button
          onClick={() => setActiveTab('tournaments')}
          className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all -mb-px rounded-t-lg ${
            activeTab === 'tournaments'
              ? 'border-ccb-accent text-ccb-accent bg-ccb-accent/5'
              : 'border-transparent text-ccb-muted hover:text-ccb-text'
          }`}
        >
          <Swords className="w-4 h-4" /> Tournaments
          {tournaments.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-ccb-accent/10 text-ccb-accent">{tournaments.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('leagues')}
          className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 transition-all -mb-px rounded-t-lg ${
            activeTab === 'leagues'
              ? 'border-ccb-primary text-ccb-primary bg-ccb-primary/5'
              : 'border-transparent text-ccb-muted hover:text-ccb-text'
          }`}
        >
          <Crown className="w-4 h-4" /> Premium Leagues
          {!isAdmin && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-ccb-muted/10 text-ccb-muted">Soon</span>
          )}
          {isAdmin && tiers.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-ccb-primary/10 text-ccb-primary">{tiers.length}</span>
          )}
        </button>
      </div>

      {/* TOURNAMENTS TAB */}
      {activeTab === 'tournaments' && (
        <div className="space-y-6">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3].map(i => <div key={i} className="card h-40" />)}
            </div>
          ) : error ? (
            <div className="card text-center p-8">
              <ShieldAlert className="w-10 h-10 text-ccb-danger mx-auto mb-3" />
              <p className="text-ccb-muted">{error}</p>
              <button onClick={fetchCompetitions} className="mt-4 btn-primary">
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
                      <TournamentCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} onShowChecklist={setChecklistCompetition} />
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
                      <TournamentCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} onShowChecklist={setChecklistCompetition} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PREMIUM LEAGUES TAB */}
      {activeTab === 'leagues' && (
        <div className="space-y-6">
          {/* USER VIEW: Simple Coming Soon */}
          {!isAdmin && (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-ccb-primary/20 to-ccb-accent/20 border border-ccb-primary/30 flex items-center justify-center shadow-xl mb-6">
                <Crown className="w-10 h-10 text-ccb-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-2">Coming Soon</h2>
              <p className="text-ccb-muted text-sm sm:text-base max-w-md mb-6">
                Premium Leagues are on the way. Tiered divisions with promotion and relegation, separate men&apos;s and women&apos;s competitions, and a path to becoming champion.
              </p>
              <Link href="/league/subscribe" className="btn-primary">
                <Crown className="w-4 h-4 mr-2" /> Get Membership
              </Link>
            </div>
          )}

          {/* ADMIN VIEW */}
          {isAdmin && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30 text-ccb-primary text-sm font-semibold">
                <Crown className="w-4 h-4" /> Admin View — Users see &quot;Coming Soon&quot;
              </div>

              <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-ccb-success/10 border border-ccb-success/30 flex items-center justify-center">
                      <ArrowUp className="w-5 h-5 text-ccb-success" />
                    </div>
                    <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">Promotion</span>
                  </div>
                  <h3 className="text-lg font-bold mb-1">Top 2 Go Up</h3>
                  <p className="text-sm text-ccb-muted">Finish top 2 to earn promotion to the tier above.</p>
                </div>
                <div className="card">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center">
                      <Crown className="w-5 h-5 text-ccb-primary" />
                    </div>
                    <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">The Pyramid</span>
                  </div>
                  <h3 className="text-lg font-bold mb-1">Start At The Bottom</h3>
                  <p className="text-sm text-ccb-muted">New players enter at the lowest tier. Climb to the Premier League.</p>
                </div>
                <div className="card">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-ccb-danger/10 border border-ccb-danger/30 flex items-center justify-center">
                      <ArrowDown className="w-5 h-5 text-ccb-danger" />
                    </div>
                    <span className="text-xs font-bold text-ccb-muted uppercase tracking-wider">Relegation</span>
                  </div>
                  <h3 className="text-lg font-bold mb-1">Bottom 2 Go Down</h3>
                  <p className="text-sm text-ccb-muted">Finish bottom 2 and you relegate. Fight to stay up!</p>
                </div>
              </section>

              {loading ? (
                <div className="space-y-4 animate-pulse">
                  {[1, 2].map(i => <div key={i} className="card h-40" />)}
                </div>
              ) : tiers.length === 0 ? (
                <div className="card text-center p-12">
                  <Crown className="w-12 h-12 text-ccb-muted mx-auto mb-4" />
                  <h3 className="text-lg font-bold mb-2">No leagues created yet</h3>
                  <p className="text-ccb-muted text-sm">Create leagues from the admin dashboard.</p>
                  <Link href="/admin" className="mt-4 btn-primary inline-flex">
                    <Pencil className="w-4 h-4 mr-2" /> Go to Admin
                  </Link>
                </div>
              ) : (
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
                            <span className="flex items-center gap-1 text-ccb-success"><ArrowUp className="w-3.5 h-3.5" /> 2 promote</span>
                            <span className="flex items-center gap-1 text-ccb-danger"><ArrowDown className="w-3.5 h-3.5" /> 2 relegate</span>
                          </div>
                        </div>

                        {tierData.men?.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-bold px-2 py-1 rounded-full border text-blue-400 bg-blue-400/10 border-blue-400/30">MEN&apos;S</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {tierData.men.map(comp => <LeagueCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} onShowChecklist={setChecklistCompetition} />)}
                            </div>
                          </div>
                        )}
                        {tierData.women?.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-bold px-2 py-1 rounded-full border text-pink-400 bg-pink-400/10 border-pink-400/30">WOMEN&apos;S</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {tierData.women.map(comp => <LeagueCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} onShowChecklist={setChecklistCompetition} />)}
                            </div>
                          </div>
                        )}
                        {tierData.open?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-bold px-2 py-1 rounded-full border text-ccb-muted bg-ccb-muted/10 border-ccb-muted/30">OPEN</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {tierData.open.map(comp => <LeagueCard key={comp.id} competition={comp} onJoin={handleJoin} joining={joining === comp.id} onShowChecklist={setChecklistCompetition} />)}
                            </div>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4 text-ccb-accent" /> How Promotion Works
                  </h3>
                  <p className="text-xs text-ccb-muted leading-relaxed">
                    At the end of each season, top 2 players promote up. Bottom 2 relegate down. New players start at the lowest tier.
                  </p>
                </div>
                <div className="card">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-ccb-accent" /> Qualification Checklist
                  </h3>
                  <p className="text-xs text-ccb-muted leading-relaxed">
                    Players must complete: profile, gender, phone verification, identity verification, Chess.com linkage, and membership before joining.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* QUALIFICATION MODAL */}
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
// Tournament Card
// ============================================================

function TournamentCard({
  competition, onJoin, joining, onShowChecklist,
}: {
  competition: Competition;
  onJoin: (c: Competition) => void;
  joining: boolean;
  onShowChecklist: (c: Competition) => void;
}) {
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
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
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
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> {competition.playerCount}
          {competition.maxPlayers ? `/${competition.maxPlayers}` : ' players'}
        </span>
        {competition.rounds && (
          <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5" /> {competition.rounds} rounds</span>
        )}
        {competition.timeControl && (
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {competition.timeControl}</span>
        )}
        {competition.startsAt && (
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(competition.startsAt)}</span>
        )}
        {isPaid && competition.entryFee != null && (
          <span className="flex items-center gap-1 text-ccb-accent"><DollarSign className="w-3.5 h-3.5" /> {formatCurrency(competition.entryFee)}</span>
        )}
      </div>

      <div className="pt-3 border-t border-ccb-border">
        {isParticipating ? (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-success/10 text-ccb-success border border-ccb-success/30 font-semibold text-sm">
            <CheckCircle2 className="w-4 h-4" /> Participating
          </div>
        ) : canJoin ? (
          <button
            onClick={() => onJoin(competition)}
            disabled={joining}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-accent text-ccb-dark font-bold text-sm hover:bg-ccb-gold transition-all shadow-lg shadow-ccb-accent/20 disabled:opacity-50"
          >
            {joining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Join Tournament
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-ccb-border bg-ccb-surface/50 text-ccb-muted font-medium text-sm">
            <Lock className="w-4 h-4" />
            {competition.qualification.reason === 'already_started' ? 'In Progress' :
             competition.qualification.reason === 'completed' ? 'Tournament Ended' :
             competition.qualification.reason === 'pending_approval' ? 'Pending Approval' :
             competition.qualification.reason === 'full' ? 'Tournament Full' :
             'Not Available'}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// League Card (admin view)
// ============================================================

function LeagueCard({
  competition, onJoin, joining, onShowChecklist,
}: {
  competition: Competition;
  onJoin: (c: Competition) => void;
  joining: boolean;
  onShowChecklist: (c: Competition) => void;
}) {
  const statusInfo = getStatusLabel(competition.status);
  const genderInfo = getGenderLabel(competition.genderRestriction || 'open');
  const isMembership = competition.entryType === 'membership';
  const canJoin = competition.qualification.canJoin;
  const isParticipating = competition.qualification.status === 'participating';
  const checklist = competition.qualification.checklist;
  const requiredItems = checklist?.filter(c => c.required) || [];
  const completedItems = requiredItems.filter(c => c.done);
  const progress = requiredItems.length > 0 ? Math.round((completedItems.length / requiredItems.length) * 100) : 100;

  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center">
            <Crown className="w-5 h-5 text-ccb-primary" />
          </div>
          <div>
            <h3 className="font-bold text-sm">{competition.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-ccb-muted">Tier {competition.tier} · {genderInfo.label}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
          </div>
        </div>
        <div>
          {isMembership ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30">MEMBERSHIP</span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-success/10 text-ccb-success border border-ccb-success/30">FREE</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3 text-xs text-ccb-muted flex-wrap">
        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {competition.playerCount}{competition.maxPlayers ? `/${competition.maxPlayers}` : ''}</span>
        {competition.currentMatchday != null && (
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> MD {competition.currentMatchday}/{competition.totalMatchdays || '?'}</span>
        )}
        {competition.promotesCount && <span className="flex items-center gap-1 text-ccb-success"><ArrowUp className="w-3.5 h-3.5" /> {competition.promotesCount} promote</span>}
        {competition.relegatesCount && <span className="flex items-center gap-1 text-ccb-danger"><ArrowDown className="w-3.5 h-3.5" /> {competition.relegatesCount} relegate</span>}
      </div>

      {(competition.minRating || 0) > 0 && (
        <div className="flex items-center gap-2 mb-3 text-xs text-ccb-muted">
          <Star className="w-3.5 h-3.5 text-ccb-accent" />
          {competition.maxRating ? `Rating: ${competition.minRating}–${competition.maxRating}` : `Min rating: ${competition.minRating}`}
        </div>
      )}

      {checklist && !canJoin && competition.qualification.reason === 'requirements_not_met' && requiredItems.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-ccb-muted">Qualification: {completedItems.length}/{requiredItems.length}</span>
            <span className="text-ccb-accent font-semibold">{progress}%</span>
          </div>
          <div className="w-full bg-ccb-surface h-2 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-ccb-accent to-ccb-primary h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="pt-3 border-t border-ccb-border">
        {isParticipating ? (
          <Link href="/league/table" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-success/10 text-ccb-success border border-ccb-success/30 font-semibold text-sm hover:bg-ccb-success/20 transition-all">
            <CheckCircle2 className="w-4 h-4" /> Participating — View <ChevronRight className="w-4 h-4" />
          </Link>
        ) : canJoin ? (
          <button onClick={() => onJoin(competition)} disabled={joining}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-primary text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50">
            {joining ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Join League
          </button>
        ) : competition.qualification.reason === 'requirements_not_met' ? (
          <button onClick={() => onShowChecklist(competition)}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30 font-bold text-sm hover:bg-ccb-primary/20 transition-all">
            <UserCheck className="w-4 h-4" /> View Checklist ({completedItems.length}/{requiredItems.length})
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-ccb-border bg-ccb-surface/50 text-ccb-muted font-medium text-sm">
            <Lock className="w-4 h-4" />
            {competition.qualification.reason === 'already_started' ? 'In Progress' :
             competition.qualification.reason === 'registration_closed' ? 'Registration Closed' :
             competition.qualification.reason === 'completed' ? 'Season Ended' :
             competition.qualification.reason === 'not_registration_phase' ? 'Not in Registration' :
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
  competition, onClose, onJoin,
}: {
  competition: Competition;
  onClose: () => void;
  onJoin: () => void;
}) {
  const checklist = competition.qualification.checklist || [];
  const requiredItems = checklist.filter(c => c.required);
  const completedItems = requiredItems.filter(c => c.done);
  const allMet = requiredItems.every(c => c.done);

  const checklistIcons: Record<string, React.ReactNode> = {
    profile_complete: <UserCheck className="w-5 h-5" />,
    gender_selected: <UserCheck className="w-5 h-5" />,
    gender_requirement: <Users className="w-5 h-5" />,
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
        <div className="sticky top-0 bg-ccb-card border-b border-ccb-border p-5 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-ccb-primary" />
            </div>
            <div>
              <h3 className="font-bold text-base">Qualification Checklist</h3>
              <p className="text-xs text-ccb-muted">{competition.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-ccb-surface transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 border-b border-ccb-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Progress: {completedItems.length}/{requiredItems.length}</span>
            <span className={`text-sm font-bold ${allMet ? 'text-ccb-success' : 'text-ccb-accent'}`}>{allMet ? 'All requirements met!' : 'Requirements pending'}</span>
          </div>
          <div className="w-full bg-ccb-surface h-3 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${allMet ? 'bg-ccb-success' : 'bg-gradient-to-r from-ccb-accent to-ccb-primary'}`}
              style={{ width: `${requiredItems.length > 0 ? (completedItems.length / requiredItems.length) * 100 : 100}%` }} />
          </div>
        </div>

        <div className="p-5 space-y-3">
          {checklist.filter(c => c.required).map((item) => (
            <div key={item.id} className={`flex items-start gap-3 p-3 rounded-xl border ${item.done ? 'border-ccb-success/30 bg-ccb-success/5' : 'border-ccb-border bg-ccb-surface/50'}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.done ? 'bg-ccb-success/10 text-ccb-success' : 'bg-ccb-muted/10 text-ccb-muted'}`}>
                {checklistIcons[item.id] || <UserCheck className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${item.done ? 'text-ccb-text' : 'text-ccb-muted'}`}>{item.label}</span>
                  {item.done && <CheckCircle2 className="w-4 h-4 text-ccb-success shrink-0" />}
                </div>
                {!item.done && item.action && (
                  <Link href={item.action} className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-ccb-accent hover:underline">
                    {item.actionLabel} <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
                {!item.done && !item.action && <p className="text-xs text-ccb-muted mt-1 italic">No action available — please wait.</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-ccb-card border-t border-ccb-border p-5 rounded-b-2xl">
          {allMet ? (
            <button onClick={onJoin} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-ccb-primary text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-ccb-primary/20">
              <Zap className="w-4 h-4" /> Join Competition
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-ccb-muted text-center">Complete the remaining requirements above to unlock this competition.</p>
              <button onClick={onClose} className="w-full py-3 rounded-xl border border-ccb-border bg-ccb-surface text-ccb-text font-medium text-sm hover:bg-ccb-card">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
