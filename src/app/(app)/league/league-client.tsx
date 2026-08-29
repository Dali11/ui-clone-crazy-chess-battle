'use client';

import React from 'react';
import PremiumLeaguesTab from './_components/premium-leagues-tab';
import LeagueWelcomeChecklist from './_components/league-welcome-checklist';

export default function CompetePage() {
  return (
    <div className="space-y-6 pb-20 sm:pb-8">

      {/* WELCOME CHECKLIST MODAL */}
      <LeagueWelcomeChecklist />

      {/* HEADER */}
      <div className="px-4 sm:px-6 lg:px-8">
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Premium Leagues</h1>
        <p className="text-sm text-ccb-muted mt-1">Season 1 · Free Entry · 5 Tiers · Weekends</p>
      </div>

      {/* CONTENT */}
      <PremiumLeaguesTab />
    </div>
  );
}
