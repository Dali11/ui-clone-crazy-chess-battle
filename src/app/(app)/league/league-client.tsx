'use client';

import React, { useState } from 'react';
import { Zap, LayoutGrid } from 'lucide-react';
import XpLeagueTab from './_components/xp-league-tab';
import LeagueOverviewTab from './_components/league-overview-tab';
import AdSlot from '@/components/ads/ad-slot';

/**
 * Leagues — the monthly XP championship is the one and only league
 * system (owner redesign 2026-09-26): ONE cycle, the calendar month.
 * XP accumulates all month, the board resets on the 1st, and lifetime
 * XP is kept forever. The only player level is Club membership
 * (Non-Club vs Club Member), which sets the XP rates.
 */
export default function CompetePage() {
  const [tab, setTab] = useState<"mine" | "overview">("mine");

  return (
    <div className="space-y-5 pb-20 sm:pb-0">
      {/* Clean header — matches history page style */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Leagues</h1>
        <p className="text-sm text-ccb-muted mt-1">
          Play games, earn XP — monthly leaderboard, lifetime XP kept
        </p>
      </div>

      {/* Tab switcher: my league vs all-leagues overview */}
      <div className="flex gap-2 w-fit p-1 rounded-xl bg-ccb-surface border border-ccb-border">
        <button
          onClick={() => setTab("mine")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            tab === "mine" ? "bg-ccb-primary text-ccb-primary-foreground" : "text-ccb-muted hover:text-ccb-text"
          }`}
        >
          <Zap className="w-4 h-4" /> Leaderboard
        </button>
        <button
          onClick={() => setTab("overview")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            tab === "overview" ? "bg-ccb-primary text-ccb-primary-foreground" : "text-ccb-muted hover:text-ccb-text"
          }`}
        >
          <LayoutGrid className="w-4 h-4" /> Overview
        </button>
      </div>

      {tab === "mine" ? <XpLeagueTab /> : <LeagueOverviewTab />}

      {/* Bottom-of-content banner — visible under both the weekly and
          monthly leaderboards. Zero-cost until enabled in admin → Ads. */}
      <AdSlot placement="leagues" />
    </div>
  );
}
