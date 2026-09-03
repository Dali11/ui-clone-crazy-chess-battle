'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Crown, Trophy, ArrowUp, ArrowDown, Calendar,
  ChevronRight, TrendingUp, Swords, Star,
  Loader2, Gamepad2, ListOrdered, BarChart3,
} from 'lucide-react';

interface Standing {
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
    country: string | null;
    rating: number;
  } | null;
}

interface Fixture {
  id: string;
  matchday: number;
  home_player_id: string | null;
  away_player_id: string | null;
  played: boolean;
  result: string | null;
  scheduled_at: string | null;
  home_player: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    rating: number;
  } | null;
  away_player: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    rating: number;
  } | null;
}

interface League {
  id: string;
  name: string;
  tier: number;
  current_matchday: number;
  total_matchdays: number;
  promotes_count: number;
  relegates_count: number;
  prize_pool: number;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  status: string;
  playerCount: number;
  qualification: { isRegistered: boolean; canJoin: boolean };
  standings: Standing[];
}

interface HomepageResponse {
  success: boolean;
  league: League & { currentMatchday: number; total_matchdays: number; qualifying_spots: number };
  standings: Standing[];
  upcomingMatchday: { matchday: number; totalMatchdays: number; fixtures: Fixture[] };
  latestResults: { matchday: number; fixtures: Fixture[] };
  topPlayers: Standing[];
  movements: any[];
}

interface PremiumLeaguesResponse {
  success: boolean;
  userId: string | null;
  leagues: League[];
}

const LEAGUE_ICONS: Record<number, typeof Crown> = {
  1: Crown, 2: Trophy, 3: TrendingUp, 4: Swords, 5: Star,
};

function FormBadge({ result }: { result: string }) {
  const isWin = result === 'W';
  const isDraw = result === 'D';
  return (
    <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center ${
      isWin ? 'bg-ccb-success/20 text-ccb-success' :
      isDraw ? 'bg-ccb-muted/20 text-ccb-muted' :
      'bg-ccb-danger/20 text-ccb-danger'
    }`}>{result}</span>
  );
}

function PlayerAvatar({ standing, size = 'w-7 h-7' }: { standing: Standing; size?: string }) {
  if (standing.player?.avatar_url) {
    return <img src={standing.player.avatar_url} alt="" className={`${size} rounded-full object-cover shrink-0`} />;
  }
  return (
    <span className={`${size} rounded-full bg-ccb-surface text-[10px] font-bold flex items-center justify-center shrink-0 text-ccb-muted`}>
      {(standing.player?.display_name || '?')[0]?.toUpperCase()}
    </span>
  );
}

function StandingsRow({ standing, isUser, promotesCount, relegatesCount, totalPlayers, compact }: {
  standing: Standing; isUser: boolean; promotesCount: number; relegatesCount: number; totalPlayers: number; compact?: boolean;
}) {
  const isPromotion = promotesCount > 0 && standing.position <= promotesCount;
  const isRelegation = relegatesCount > 0 && standing.position > totalPlayers - relegatesCount;
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
      isUser ? 'bg-ccb-primary/10 border border-ccb-primary/30' : ''
    }`}>
      <span className={`text-xs font-bold w-6 text-center ${
        isPromotion ? 'text-ccb-success' : isRelegation ? 'text-ccb-danger' : 'text-ccb-muted'
      }`}>{standing.position}</span>
      <PlayerAvatar standing={standing} />
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium truncate block ${isUser ? 'text-ccb-primary' : ''}`}>
          {standing.player?.display_name || standing.player?.username || 'Unknown'}
        </span>
        {!compact && <span className="text-[10px] text-ccb-muted">{standing.player?.rating || '—'} elo</span>}
      </div>
      {!compact && standing.form && standing.form.length > 0 && (
        <div className="hidden sm:flex items-center gap-0.5">
          {standing.form.slice(-5).map((r, i) => <FormBadge key={i} result={r} />)}
        </div>
      )}
      <span className="text-[10px] text-ccb-muted shrink-0 hidden sm:block">{standing.played}P</span>
      <span className="text-[10px] text-ccb-muted shrink-0 sm:hidden">{standing.wins}W</span>
      <span className="text-xs font-bold shrink-0">{standing.points}<span className="text-[9px] text-ccb-muted ml-0.5">pts</span></span>
    </div>
  );
}

function StandingsSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3">
      <div className="flex-1 h-px bg-ccb-border" />
      <span className="text-[9px] font-bold uppercase tracking-wider text-ccb-muted">{label}</span>
      <div className="flex-1 h-px bg-ccb-border" />
    </div>
  );
}

function AdSlot({ variant = 'banner' }: { variant?: 'banner' | 'card' }) {
  return (
    <div className={`rounded-xl border border-dashed border-ccb-border flex items-center justify-center text-center ${
      variant === 'banner' ? 'h-16 sm:h-20' : 'h-28'
    }`}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted/50">Ad Space</p>
        <p className="text-[9px] text-ccb-muted/40 mt-0.5">Available for sponsorship</p>
      </div>
    </div>
  );
}

export default function LiveSeasonTab({ premiumData }: { premiumData: PremiumLeaguesResponse | null }) {
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [homeData, setHomeData] = useState<HomepageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'standings' | 'fixtures' | 'results'>('standings');
  const [otherLeagues, setOtherLeagues] = useState<any[]>([]);

  const myLeague = useMemo(() => {
    if (!premiumData?.leagues) return null;
    const registered = premiumData.leagues.find(l => l.qualification?.isRegistered);
    if (registered) return registered;
    const active = premiumData.leagues.filter(l => l.status === 'active');
    if (active.length === 0) return null;
    return active[0];
  }, [premiumData]);

  useEffect(() => { if (myLeague?.id) setActiveLeagueId(myLeague.id); }, [myLeague]);

  useEffect(() => {
    if (!activeLeagueId) return;
    setLoading(true);
    fetch(`/api/league/homepage?leagueId=${activeLeagueId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setHomeData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeLeagueId]);

  useEffect(() => {
    if (!premiumData?.leagues) return;
    const others = premiumData.leagues
      .filter(l => l.id !== activeLeagueId && l.status === 'active')
      .map(l => ({
        id: l.id, name: l.name, tier: l.tier, status: l.status,
        current_matchday: l.current_matchday, total_matchdays: l.total_matchdays,
        playerCount: l.playerCount,
        standings: (l.standings || []).slice(0, 1).map(s => ({ position: s.position, player: s.player, points: s.points })),
      }));
    setOtherLeagues(others);
  }, [premiumData, activeLeagueId]);

  if (!myLeague) {
    return (
      <div className="card p-8 text-center">
        <Trophy className="w-8 h-8 text-ccb-muted mx-auto mb-3" />
        <p className="text-sm text-ccb-muted">No active league season right now.</p>
      </div>
    );
  }

  const league = homeData?.league;
  const standings = homeData?.standings || [];
  const upcoming = homeData?.upcomingMatchday?.fixtures || [];
  const results = homeData?.latestResults?.fixtures || [];
  const userId = premiumData?.userId;
  const promotesCount = league?.promotes_count || 0;
  const relegatesCount = league?.relegates_count || 0;
  const totalPlayers = standings.length;

  const userStanding = userId ? standings.find(s => s.player?.id === userId) : null;
  const userPos = userStanding?.position || 0;
  const top5 = standings.slice(0, 5);
  const bottom5 = standings.slice(-5);
  const aroundUser = userPos > 0
    ? standings.filter(s => Math.abs(s.position - userPos) <= 2 && s.position > 5 && s.position <= totalPlayers - 5)
    : [];

  return (
    <div className="space-y-4">
      {/* SPONSORED LEAGUE HEADER */}
      <div className="card px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {(() => {
            const Icon = LEAGUE_ICONS[myLeague.tier] || Trophy;
            return (
              <div className="w-10 h-10 rounded-xl bg-ccb-surface flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-ccb-primary" />
              </div>
            );
          })()}
          <div className="min-w-0">
            <h2 className="font-bold text-sm truncate">{myLeague.name}</h2>
            <p className="text-[11px] text-ccb-muted">
              {league ? `Matchday ${league.currentMatchday}/${league.total_matchdays}` : 'Loading...'} · {myLeague.playerCount} players
            </p>
          </div>
        </div>
        {league?.sponsor_name && (
          <div className="shrink-0 text-right">
            <p className="text-[9px] uppercase tracking-wider text-ccb-muted">Sponsored by</p>
            <p className="text-xs font-semibold">{league.sponsor_name}</p>
          </div>
        )}
      </div>

      {/* PLAYER RANK CARD */}
      {userStanding ? (
        <div className="card border-ccb-primary/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Your Position</span>
            {userStanding.form && userStanding.form.length > 0 && (
              <div className="flex items-center gap-0.5">
                {userStanding.form.slice(-5).map((r, i) => <FormBadge key={i} result={r} />)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center shrink-0">
              <p className="text-2xl font-black text-ccb-primary">#{userStanding.position}</p>
              <p className="text-[10px] text-ccb-muted">of {totalPlayers}</p>
            </div>
            <div className="w-px h-10 bg-ccb-border" />
            <div className="flex-1 grid grid-cols-4 gap-2 text-center">
              <div><p className="text-sm font-bold text-ccb-success">{userStanding.wins}</p><p className="text-[9px] text-ccb-muted">Wins</p></div>
              <div><p className="text-sm font-bold text-ccb-muted">{userStanding.draws}</p><p className="text-[9px] text-ccb-muted">Draws</p></div>
              <div><p className="text-sm font-bold text-ccb-danger">{userStanding.losses}</p><p className="text-[9px] text-ccb-muted">Losses</p></div>
              <div><p className="text-sm font-bold text-ccb-primary">{userStanding.points}</p><p className="text-[9px] text-ccb-muted">Points</p></div>
            </div>
          </div>
          {(promotesCount > 0 || relegatesCount > 0) && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-ccb-border text-[10px]">
              {promotesCount > 0 && userStanding.position <= promotesCount && (
                <span className="flex items-center gap-1 text-ccb-success font-medium"><ArrowUp className="w-3 h-3" /> Promotion zone</span>
              )}
              {relegatesCount > 0 && userStanding.position > totalPlayers - relegatesCount && (
                <span className="flex items-center gap-1 text-ccb-danger font-medium"><ArrowDown className="w-3 h-3" /> Relegation zone</span>
              )}
              {promotesCount > 0 && userStanding.position > promotesCount && (relegatesCount === 0 || userStanding.position <= totalPlayers - relegatesCount) && (
                <span className="text-ccb-muted">{userStanding.position - promotesCount} spot{userStanding.position - promotesCount === 1 ? '' : 's'} from promotion</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="card p-4 text-center">
          <p className="text-xs text-ccb-muted">
            You&apos;re not in this league yet.
            {myLeague.qualification?.canJoin && <span> Join mid-season to start playing!</span>}
          </p>
        </div>
      )}

      {/* AD SLOT 1 */}
      <AdSlot variant="banner" />

      {/* TAB BAR */}
      <div className="flex items-center gap-1 bg-ccb-surface rounded-xl p-1">
        {[
          { id: 'standings' as const, label: 'Standings', icon: BarChart3 },
          { id: 'fixtures' as const, label: 'Fixtures', icon: ListOrdered },
          { id: 'results' as const, label: 'Results', icon: Gamepad2 },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === id ? 'bg-ccb-card text-ccb-text shadow-sm' : 'text-ccb-muted hover:text-ccb-text'
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-ccb-primary animate-spin" />
        </div>
      ) : tab === 'standings' ? (
        <div className="card overflow-hidden p-0">
          {(promotesCount > 0 || relegatesCount > 0) && (
            <div className="flex items-center gap-3 px-3 py-2 border-b border-ccb-border text-[10px]">
              {promotesCount > 0 && <span className="flex items-center gap-1 text-ccb-success"><span className="w-2 h-2 rounded-full bg-ccb-success" /> Top {promotesCount} promote</span>}
              {relegatesCount > 0 && <span className="flex items-center gap-1 text-ccb-danger"><span className="w-2 h-2 rounded-full bg-ccb-danger" /> Bottom {relegatesCount} relegate</span>}
            </div>
          )}
          {top5.map(s => <StandingsRow key={s.player?.id || s.position} standing={s} isUser={s.player?.id === userId} promotesCount={promotesCount} relegatesCount={relegatesCount} totalPlayers={totalPlayers} />)}
          {aroundUser.length > 0 && (
            <>
              <StandingsSeparator label={`Around you · #${userPos - 2}–#${userPos + 2}`} />
              {aroundUser.map(s => <StandingsRow key={s.player?.id || s.position} standing={s} isUser={s.player?.id === userId} promotesCount={promotesCount} relegatesCount={relegatesCount} totalPlayers={totalPlayers} compact />)}
            </>
          )}
          {bottom5.length > 0 && totalPlayers > 10 && (
            <>
              <StandingsSeparator label="Bottom 5" />
              {bottom5.map(s => <StandingsRow key={s.player?.id || s.position} standing={s} isUser={s.player?.id === userId} promotesCount={promotesCount} relegatesCount={relegatesCount} totalPlayers={totalPlayers} compact />)}
            </>
          )}
          <Link href={`/league/table?league=${activeLeagueId}`} className="flex items-center justify-center gap-1.5 py-3 border-t border-ccb-border text-xs font-medium text-ccb-muted hover:text-ccb-text transition-colors">
            View full standings <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : tab === 'fixtures' ? (
        <div className="space-y-2">
          {upcoming.length > 0 ? (
            <>
              {userId && upcoming.find(f => f.home_player_id === userId || f.away_player_id === userId) && (
                <div className="card border-ccb-primary/30 p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Swords className="w-3.5 h-3.5 text-ccb-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-primary">Your Match</span>
                  </div>
                  <FixtureCard fixture={upcoming.find(f => f.home_player_id === userId || f.away_player_id === userId)!} userId={userId} />
                </div>
              )}
              <div className="card p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted px-1 mb-1">Matchday {league?.currentMatchday} · Other Fixtures</p>
                {upcoming.filter(f => !userId || (f.home_player_id !== userId && f.away_player_id !== userId)).map(f => <FixtureCard key={f.id} fixture={f} userId={userId} compact />)}
              </div>
            </>
          ) : (
            <div className="card p-8 text-center">
              <Calendar className="w-7 h-7 text-ccb-muted mx-auto mb-2" />
              <p className="text-sm text-ccb-muted">No fixtures scheduled for this matchday.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {results.length > 0 ? (
            <div className="card p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted px-1 mb-1">Matchday {homeData?.latestResults?.matchday} · Results</p>
              {results.map(f => <ResultCard key={f.id} fixture={f} userId={userId} />)}
            </div>
          ) : (
            <div className="card p-8 text-center">
              <Gamepad2 className="w-7 h-7 text-ccb-muted mx-auto mb-2" />
              <p className="text-sm text-ccb-muted">No results yet — first matchday hasn&apos;t been played.</p>
            </div>
          )}
        </div>
      )}

      {/* AD SLOT 2 */}
      <AdSlot variant="card" />

      {/* OTHER LEAGUES STRIP */}
      {otherLeagues.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted mb-2 px-1">Other Leagues</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {otherLeagues.map((ol: any) => {
              const leader = ol.standings[0];
              return (
                <Link key={ol.id} href={`/league/table?league=${ol.id}`} className="shrink-0 w-36 bg-ccb-card border border-ccb-border rounded-xl p-3 hover:border-ccb-primary/30 transition-colors">
                  <p className="text-xs font-bold truncate">{ol.name}</p>
                  <p className="text-[10px] text-ccb-muted mt-0.5">MD {ol.current_matchday}/{ol.total_matchdays || '?'}</p>
                  {leader?.player && <p className="text-[10px] text-ccb-text mt-1.5 truncate">🏆 {leader.player.display_name}</p>}
                  <p className="text-[10px] text-ccb-muted">{ol.playerCount} players</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FixtureCard({ fixture, userId, compact }: { fixture: Fixture; userId: string | null | undefined; compact?: boolean }) {
  const isUserHome = fixture.home_player_id === userId;
  const isUserAway = fixture.away_player_id === userId;
  return (
    <div className={`flex items-center gap-2 ${compact ? 'py-1.5' : 'py-2'}`}>
      <div className="flex-1 flex items-center gap-2 min-w-0 justify-end text-right">
        <span className={`text-xs font-medium truncate ${isUserHome ? 'text-ccb-primary' : ''}`}>{fixture.home_player?.display_name || 'TBD'}</span>
        {fixture.home_player?.avatar_url ? (
          <img src={fixture.home_player.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-6 h-6 rounded-full bg-ccb-surface text-[9px] font-bold flex items-center justify-center shrink-0 text-ccb-muted">{(fixture.home_player?.display_name || '?')[0]?.toUpperCase()}</span>
        )}
      </div>
      <span className="text-[10px] font-bold text-ccb-muted shrink-0 px-2">VS</span>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {fixture.away_player?.avatar_url ? (
          <img src={fixture.away_player.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-6 h-6 rounded-full bg-ccb-surface text-[9px] font-bold flex items-center justify-center shrink-0 text-ccb-muted">{(fixture.away_player?.display_name || '?')[0]?.toUpperCase()}</span>
        )}
        <span className={`text-xs font-medium truncate ${isUserAway ? 'text-ccb-primary' : ''}`}>{fixture.away_player?.display_name || 'TBD'}</span>
      </div>
    </div>
  );
}

function ResultCard({ fixture, userId }: { fixture: Fixture; userId: string | null | undefined }) {
  const isUserHome = fixture.home_player_id === userId;
  const isUserAway = fixture.away_player_id === userId;
  const homeWon = fixture.result === 'home_win';
  const awayWon = fixture.result === 'away_win';
  const draw = fixture.result === 'draw';
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-1 flex items-center gap-2 min-w-0 justify-end text-right">
        <span className={`text-xs font-medium truncate ${homeWon ? 'text-ccb-success font-bold' : isUserHome ? 'text-ccb-primary' : ''}`}>{fixture.home_player?.display_name || 'TBD'}</span>
        {fixture.home_player?.avatar_url ? (
          <img src={fixture.home_player.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-6 h-6 rounded-full bg-ccb-surface text-[9px] font-bold flex items-center justify-center shrink-0 text-ccb-muted">{(fixture.home_player?.display_name || '?')[0]?.toUpperCase()}</span>
        )}
      </div>
      <div className="shrink-0 px-2">
        {draw ? <span className="text-[10px] font-bold text-ccb-muted px-2 py-0.5 rounded bg-ccb-surface">DRAW</span> :
         homeWon ? <span className="text-[10px] font-bold text-ccb-success px-2 py-0.5 rounded bg-ccb-success/10">1-0</span> :
         awayWon ? <span className="text-[10px] font-bold text-ccb-success px-2 py-0.5 rounded bg-ccb-success/10">0-1</span> :
         <span className="text-[10px] font-bold text-ccb-muted px-2 py-0.5 rounded bg-ccb-surface">—</span>}
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {fixture.away_player?.avatar_url ? (
          <img src={fixture.away_player.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-6 h-6 rounded-full bg-ccb-surface text-[9px] font-bold flex items-center justify-center shrink-0 text-ccb-muted">{(fixture.away_player?.display_name || '?')[0]?.toUpperCase()}</span>
        )}
        <span className={`text-xs font-medium truncate ${awayWon ? 'text-ccb-success font-bold' : isUserAway ? 'text-ccb-primary' : ''}`}>{fixture.away_player?.display_name || 'TBD'}</span>
      </div>
    </div>
  );
}
