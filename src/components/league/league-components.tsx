'use client';

import Link from 'next/link';

// League header / branding
export function LeagueHeader({ league, season }: { league: any; season?: any }) {
  return (
    <div className="bg-gradient-to-r from-ccb-dark to-ccb-surface border border-ccb-border rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ccb-text">
            <span className="text-ccb-accent">CRAZYCHESS</span> PREMIER LEAGUE
          </h1>
          {league?.name && <p className="text-sm text-ccb-muted mt-1">{league.name}</p>}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-ccb-accent">{league?.currentMatchday || league?.current_matchday || 1}</div>
            <div className="text-ccb-muted text-xs uppercase">Matchday</div>
          </div>
          <div className="w-px h-10 bg-ccb-border" />
          <div className="text-center">
            <div className="text-2xl font-bold text-ccb-accent">{league?.totalMatchdays || league?.total_matchdays || 5}</div>
            <div className="text-ccb-muted text-xs uppercase">Total</div>
          </div>
          {season && (
            <>
              <div className="w-px h-10 bg-ccb-border" />
              <div className="text-center">
                <div className="text-sm font-semibold text-ccb-text">{season.name}</div>
                <div className="text-ccb-muted text-xs">{season.status?.toUpperCase()}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Status badge
export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    upcoming: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    live: 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse',
    completed: 'bg-ccb-border text-ccb-muted border-ccb-border',
    scheduled: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    missed: 'bg-ccb-border text-ccb-muted border-ccb-border',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded border ${styles[status] || styles.upcoming}`}>
      {status.toUpperCase()}
    </span>
  );
}

// Position movement indicator
export function PositionMovement({ position, previousPosition }: { position: number; previousPosition?: number }) {
  if (!previousPosition || previousPosition === position) {
    return <span className="text-ccb-muted text-xs">—</span>;
  }
  if (previousPosition > position) {
    return <span className="text-emerald-400 text-xs font-bold">▲{previousPosition - position}</span>;
  }
  return <span className="text-ccb-danger text-xs font-bold">▼{position - previousPosition}</span>;
}

// Form pills (W/D/L)
export function FormPills({ form }: { form?: string[] }) {
  if (!form || form.length === 0) return <span className="text-ccb-muted text-xs">—</span>;
  const colors: Record<string, string> = {
    W: 'bg-ccb-success text-white',
    D: 'bg-ccb-muted text-white',
    L: 'bg-ccb-danger text-white',
  };
  return (
    <div className="flex gap-1">
      {form.map((f, i) => (
        <span key={i} className={`w-5 h-5 flex items-center justify-center text-xs font-bold rounded ${colors[f] || 'bg-ccb-muted'}`}>
          {f}
        </span>
      ))}
    </div>
  );
}

// Match card
export function MatchCard({ fixture, href }: { fixture: any; href?: string }) {
  const getResultText = (result: string) => {
    if (result === 'home_win') return '1-0';
    if (result === 'away_win') return '0-1';
    if (result === 'draw') return '½-½';
    return 'VS';
  };
  const home = fixture.home_player || fixture.homePlayer;
  const away = fixture.away_player || fixture.awayPlayer;
  const isCompleted = fixture.played;

  return (
    <Link href={href || `/league/match/${fixture.id}`} className="block">
      <div className={`bg-ccb-card hover:bg-ccb-surface border border-ccb-border hover:border-ccb-primary/50 rounded-lg p-4 transition-all ${isCompleted ? 'opacity-75' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 text-right">
            <div className="font-semibold text-sm text-ccb-text">{home?.display_name || home?.displayName || 'TBD'}</div>
            <div className="text-xs text-ccb-muted">({home?.rating || '—'})</div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className={`text-sm font-bold ${isCompleted ? 'text-ccb-accent' : 'text-ccb-muted'}`}>
              {getResultText(fixture.result)}
            </div>
            <div className="text-[10px] text-ccb-muted uppercase">MD{fixture.matchday}</div>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm text-ccb-text">{away?.display_name || away?.displayName || 'TBD'}</div>
            <div className="text-xs text-ccb-muted">({away?.rating || '—'})</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Loading spinner
export function LeagueLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-ccb-primary/20 border-t-ccb-primary rounded-full animate-spin" />
        <p className="text-ccb-muted text-sm">Loading league data...</p>
      </div>
    </div>
  );
}

// Error display
export function LeagueError({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="text-center">
        <p className="text-ccb-danger font-semibold">⚠️ {message}</p>
      </div>
    </div>
  );
}

// Section title
export function SectionTitle({ title, link }: { title: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-bold text-ccb-text">{title}</h2>
      {link && (
        <Link href={link.href} className="text-sm text-ccb-primary hover:text-ccb-primaryHover transition-colors">
          {link.label} →
        </Link>
      )}
    </div>
  );
}
