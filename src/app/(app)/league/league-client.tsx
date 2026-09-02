'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, Trophy, User, Sparkles, Gamepad2, Swords } from 'lucide-react';
import PremiumLeaguesTab from './_components/premium-leagues-tab';
import LiveSeasonTab from './_components/live-season-tab';

interface PremiumLeaguesResponse {
  success: boolean;
  userId: string | null;
  leagues: any[];
  hasMembership?: boolean;
  profileComplete?: boolean;
  displayName?: string | null;
  country?: string | null;
}

export default function CompetePage() {
  const [premiumData, setPremiumData] = useState<PremiumLeaguesResponse | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/league/premium-leagues')
      .then(r => r.json())
      .then(d => { setPremiumData(d); setDataLoaded(true); })
      .catch(() => setDataLoaded(true));
  }, []);

  const hasActiveLeague = premiumData?.leagues?.some(l => l.status === 'active') ?? false;
  const profileComplete = premiumData?.profileComplete ?? true;
  const displayName = premiumData?.displayName;

  // Show getting started card for new/incomplete users
  const showGettingStarted = dataLoaded && !profileComplete;

  return (
    <div className="space-y-5 pb-20 sm:pb-0">
      {/* Clean header — matches history page style */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">
          {hasActiveLeague ? 'Live Season' : 'Leagues'}
        </h1>
        <p className="text-sm text-ccb-muted mt-1">
          {hasActiveLeague
            ? 'Season in progress — follow your fixtures and standings'
            : 'Season 1 · Free Entry · Weekends'}
        </p>
      </div>

      {/* Inline Getting Started card — replaces the old invasive modal */}
      {showGettingStarted && (
        <div className="card p-4 border-ccb-primary/20 bg-ccb-primary/5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-ccb-primary/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-ccb-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Getting Started</h3>
              <p className="text-xs text-ccb-muted mt-0.5">
                Complete your profile to join a league and start competing.
              </p>
              <Link
                href="/settings"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-ccb-primary hover:underline"
              >
                <User className="w-3.5 h-3.5" /> Edit Profile
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick stats — matches history page pattern */}
      {dataLoaded && premiumData?.leagues && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="card text-center py-2.5">
            <div className="text-xl font-bold">{premiumData.leagues.length}</div>
            <div className="text-[11px] text-ccb-muted">Leagues</div>
          </div>
          <div className="card text-center py-2.5">
            <div className="text-xl font-bold text-ccb-success">
              {premiumData.leagues.filter(l => l.status === 'registration').length}
            </div>
            <div className="text-[11px] text-ccb-muted">Open</div>
          </div>
          <div className="card text-center py-2.5">
            <div className="text-xl font-bold text-ccb-accent">
              {premiumData.leagues.filter(l => l.status === 'active').length}
            </div>
            <div className="text-[11px] text-ccb-muted">Live</div>
          </div>
        </div>
      )}

      {/* Main content */}
      {dataLoaded && hasActiveLeague && premiumData ? (
        <LiveSeasonTab premiumData={premiumData} />
      ) : (
        <PremiumLeaguesTab />
      )}
    </div>
  );
}
