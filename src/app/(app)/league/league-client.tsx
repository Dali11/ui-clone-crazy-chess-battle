'use client';

import React, { useState, useEffect } from 'react';
import PremiumLeaguesTab from './_components/premium-leagues-tab';
import LeagueWelcomeChecklist from './_components/league-welcome-checklist';
import LiveSeasonTab from './_components/live-season-tab';

interface PremiumLeaguesResponse {
  success: boolean;
  userId: string | null;
  leagues: any[];
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

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      <LeagueWelcomeChecklist />

      <div className="px-4 sm:px-6 lg:px-8">
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
          {hasActiveLeague ? 'Live Season' : 'Premium Leagues'}
        </h1>
        <p className="text-sm text-ccb-muted mt-1">
          {hasActiveLeague ? 'Season 1 · In Progress · Weekends' : 'Season 1 · Free Entry · 5 Tiers · Weekends'}
        </p>
      </div>

      {dataLoaded && hasActiveLeague && premiumData ? (
        <div className="px-4 sm:px-6 lg:px-8">
          <LiveSeasonTab premiumData={premiumData} />
        </div>
      ) : (
        <PremiumLeaguesTab />
      )}
    </div>
  );
}
