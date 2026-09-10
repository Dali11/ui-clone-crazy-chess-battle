'use client';

import React from 'react';
import { Zap } from 'lucide-react';
import XpLeagueTab from './_components/xp-league-tab';

/**
 * Leagues — the Duolingo-style XP League is the one and only league
 * system: players earn XP from every PvP game, climb their tier, and
 * the top performers are rewarded + promoted weekly (Monday 00:00 CAT).
 * The old weekend fixture leagues have been fully retired.
 */
export default function CompetePage() {
  return (
    <div className="space-y-5 pb-20 sm:pb-0">
      {/* Clean header — matches history page style */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Leagues</h1>
        <p className="text-sm text-ccb-muted mt-1">
          Play games, earn XP, climb your league — weekly rewards
        </p>
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ccb-primary/10 text-sm font-bold text-ccb-primary w-fit">
        <Zap className="w-4 h-4" /> XP League
      </div>

      <XpLeagueTab />
    </div>
  );
}
