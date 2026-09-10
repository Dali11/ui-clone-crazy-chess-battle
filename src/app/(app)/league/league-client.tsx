'use client';

import React, { useState } from 'react';
import { Zap, Swords } from 'lucide-react';
import XpLeagueTab from './_components/xp-league-tab';
import PremiumLeaguesTab from './_components/premium-leagues-tab';

/**
 * Leagues — Duolingo-style XP League is the main experience: players are
 * seeded into a tier by rating, earn XP from every PvP game, and the top
 * 5 in each tier are rewarded + promoted weekly (Monday 00:00 CAT reset).
 * The premium weekend fixture leagues remain available in a secondary tab.
 */
export default function CompetePage() {
  const [tab, setTab] = useState<'xp' | 'weekend'>('xp');

  return (
    <div className="space-y-5 pb-20 sm:pb-0">
      {/* Clean header — matches history page style */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Leagues</h1>
        <p className="text-sm text-ccb-muted mt-1">
          Play games, earn XP, climb your league — weekly rewards
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('xp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'xp' ? 'bg-ccb-primary text-white shadow' : 'bg-ccb-muted/10 text-ccb-muted hover:bg-ccb-muted/15'}`}
        >
          <Zap className="w-4 h-4" /> XP League
        </button>
        <button
          onClick={() => setTab('weekend')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'weekend' ? 'bg-ccb-primary text-white shadow' : 'bg-ccb-muted/10 text-ccb-muted hover:bg-ccb-muted/15'}`}
        >
          <Swords className="w-4 h-4" /> Weekend Leagues
        </button>
      </div>

      {tab === 'xp' ? <XpLeagueTab /> : <PremiumLeaguesTab />}
    </div>
  );
}
