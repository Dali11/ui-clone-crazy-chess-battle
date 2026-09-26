"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Zap, Trophy, Crown } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { countryFlag } from "@/lib/geo/flags";
import AdSlot from "@/components/ads/ad-slot";

interface TopPlayer {
  userId: string;
  name: string;
  country: string | null;
  isClub: boolean;
  xp: number;
  lifetimeXp: number;
  rank: number;
}

interface OverviewResponse {
  month: string;
  monthEnd: string;
  totalPlayers: number;
  activeThisMonth: number;
  clubPlayers: number;
  top: TopPlayer[];
  rewards: number[];
  rewardsPaused?: boolean;
  topCount: number;
}

export default function LeagueOverviewTab() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const currency = useCurrency();

  useEffect(() => {
    fetch("/api/league/xp/overview")
      .then((r) => (r.status === 401 ? null : r.json()))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-ccb-muted">Sign in to see the leaderboard overview.</p>
      </div>
    );
  }

  const rewardsTotal = (data.rewards ?? []).reduce((s, r) => s + r, 0);
  const monthLabel = new Date(data.month + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <div className="card p-4 border-ccb-primary/30">
        <div className="flex items-start gap-3">
          <Trophy className="w-5 h-5 text-ccb-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">Monthly XP Championship — {monthLabel}</h3>
            <p className="text-xs text-ccb-muted mt-1 leading-relaxed">
              One board, one cycle: XP accumulates all month and resets on the 1st, while lifetime
              XP is kept forever. Club members earn up to 2x XP on every result — the fastest XP
              comes from Club members playing cash games.
              {data.rewardsPaused ? " Cash rewards are paused for now — the board itself keeps running." : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-[10px] text-ccb-muted font-semibold uppercase tracking-wide">Players</p>
          <p className="text-lg font-bold mt-1">{data.totalPlayers}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-[10px] text-ccb-muted font-semibold uppercase tracking-wide">Active this month</p>
          <p className="text-lg font-bold mt-1">{data.activeThisMonth}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-[10px] text-ccb-muted font-semibold uppercase tracking-wide flex items-center justify-center gap-1">
            <Crown className="w-3 h-3 text-ccb-accent" /> Club members
          </p>
          <p className="text-lg font-bold mt-1">{data.clubPlayers}</p>
        </div>
      </div>

      {/* Monthly pot */}
      {!data.rewardsPaused && rewardsTotal > 0 && (
        <div className="card p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-ccb-primary" />
            <h3 className="text-sm font-semibold">Monthly pot — top {data.topCount}</h3>
          </div>
          <p className="text-sm font-bold text-ccb-primary tabular-nums">{currency.formatRewardMoney(rewardsTotal)}</p>
        </div>
      )}

      {/* Top 10 of the month */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-ccb-muted/10">
          <h3 className="text-sm font-semibold">Top of the month</h3>
        </div>
        {data.top.length === 0 ? (
          <p className="p-6 text-center text-sm text-ccb-muted">No games on the board yet this month.</p>
        ) : (
          <div className="divide-y divide-ccb-muted/5">
            {data.top.map((p) => (
              <div key={p.userId} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-7 text-center text-sm font-bold ${p.rank === 1 ? "text-amber-400" : "text-ccb-muted"}`}>
                  {p.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {p.name}
                    {countryFlag(p.country) && <span className="ml-1">{countryFlag(p.country)}</span>}
                    {p.isClub && <Crown className="w-3 h-3 text-ccb-accent inline-block ml-1 -mt-0.5" aria-label="Club member" />}
                  </p>
                  <p className="text-[11px] text-ccb-muted">Lifetime {p.lifetimeXp.toLocaleString()} XP</p>
                </div>
                <p className="text-sm font-bold tabular-nums shrink-0">{p.xp.toLocaleString()} XP</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdSlot placement="leagues_inline" />
    </div>
  );
}
