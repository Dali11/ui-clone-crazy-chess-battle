'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
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
    <div className="pb-20 sm:pb-8">
      <LeagueWelcomeChecklist />

      {/* Compact hero header */}
      <div className="px-4 sm:px-6 lg:px-8 mb-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
              {hasActiveLeague ? 'Live Season' : 'Leagues'}
            </h1>
            <p className="text-xs text-ccb-muted mt-0.5">
              {hasActiveLeague
                ? 'Season in progress — follow your fixtures and standings'
                : 'Season 1 · Free Entry · Weekends'}
            </p>
          </div>
          {hasActiveLeague && (
            <Link
              href="/league/table"
              className="shrink-0 text-xs font-bold text-ccb-primary hover:underline flex items-center gap-1"
            >
              Full Table
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
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
