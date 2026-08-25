'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import TournamentsTab from './_components/tournaments-tab';
import PremiumLeaguesTab from './_components/premium-leagues-tab';
import { Swords, Crown } from 'lucide-react';

type Tab = 'tournaments' | 'premium';

export default function CompetePage() {
  const [tab, setTab] = useState<Tab>('tournaments');

  return (
    <div className="space-y-6 pb-20 sm:pb-8">

      {/* HEADER */}
      <div className="px-4 sm:px-6 lg:px-8">
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Compete</h1>
        <p className="text-sm text-ccb-muted mt-1">Play. Compete. Climb. Become Champion.</p>
      </div>

      {/* TWO-MODE TAB SWITCHER */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex gap-2 p-1 bg-ccb-surface rounded-2xl border border-ccb-border">
          <button
            onClick={() => setTab('tournaments')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              tab === 'tournaments'
                ? 'bg-ccb-primary text-white shadow-lg shadow-ccb-primary/20'
                : 'text-ccb-muted hover:text-ccb-text'
            }`}
          >
            <Swords className="w-4 h-4" />
            Tournaments
          </button>
          <button
            onClick={() => setTab('premium')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              tab === 'premium'
                ? 'bg-gradient-to-r from-ccb-accent to-ccb-primary text-white shadow-lg shadow-ccb-accent/20'
                : 'text-ccb-muted hover:text-ccb-text'
            }`}
          >
            <Crown className="w-4 h-4" />
            Premium Leagues
          </button>
        </div>
      </div>

      {/* TAB CONTENT */}
      {tab === 'tournaments' ? <TournamentsTab /> : <PremiumLeaguesTab />}
    </div>
  );
}
