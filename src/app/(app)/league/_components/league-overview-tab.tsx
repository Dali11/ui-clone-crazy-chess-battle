"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Trophy, Crown } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { countryFlag } from "@/lib/geo/flags";
import AdSlot from "@/components/ads/ad-slot";

interface TopPlayer {
  userId: string;
  name: string;
  country: string | null;
  isClub: boolean;
  xp: number;
}

interface LeagueSummary {
  tier: number;
  name: string;
  emoji: string;
  ratingBand: string;
  players: number;
  activeThisMonth: number;
  rewards: number[];
  top: TopPlayer[];
}

interface OverviewResponse {
  month: string;
  monthEnd: string;
  leagues: LeagueSummary[];
  /** Cash-rewards pause (owner 2026-09-24): figures hidden while true. */
  rewardsPaused?: boolean;
}

/** One league card: roster, monthly rewards, and this month's top 5. */
function LeagueCard({
  league,
  currency,
  rewardsPaused,
}: {
  league: LeagueSummary;
  currency: ReturnType<typeof useCurrency>;
  rewardsPaused?: boolean;
}) {
  const monthlyTotal = league.rewards.reduce((s, r) => s + r, 0);
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl shrink-0">{league.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold truncate">{league.name}</h3>
          <p className="text-[11px] text-ccb-muted">{league.ratingBand} · {league.players} player{league.players === 1 ? "" : "s"} · {league.activeThisMonth} active this month</p>
        </div>
        {!rewardsPaused && monthlyTotal > 0 ? (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-ccb-muted">Monthly pot</p>
            <p className="text-sm font-bold text-ccb-primary tabular-nums">{currency.formatRewardMoney(monthlyTotal)}</p>
          </div>
        ) : (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-amber-500 font-semibold">Rewards</p>
            <p className="text-[10px] text-ccb-muted">paused for now</p>
          </div>
        )}
      </div>

      {/* Top 5 this month with per-rank rewards */}
      <div className="mt-4 space-y-1.5">
        {league.top.length === 0 ? (
          <p className="text-xs text-ccb-muted/70 italic">No games played yet this month.</p>
        ) : (
          league.top.map((p, i) => (
            <div
              key={p.userId}
              className="flex items-center gap-2.5 p-2 rounded-lg bg-ccb-surface/60"
            >
              <span className={`w-5 text-center text-xs font-bold shrink-0 ${i === 0 ? "text-amber-400" : "text-ccb-muted"}`}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">
                  {p.name}{countryFlag(p.country) && <span className="ml-1">{countryFlag(p.country)}</span>}
                  {p.isClub && <Crown className="w-2.5 h-2.5 text-ccb-accent inline-block ml-1 -mt-0.5" aria-label="Club member" />}
                </p>
                <p className="text-[10px] text-ccb-muted">{p.xp.toLocaleString()} XP</p>
              </div>
              {!rewardsPaused ? (
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold tabular-nums">{currency.formatRewardMoney(league.rewards[i] ?? 0)}</p>
                </div>
              ) : (
                <span className="text-[10px] text-ccb-muted/60 shrink-0">#{i + 1}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
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
        <p className="text-sm text-ccb-muted">Sign in to see the leagues overview.</p>
      </div>
    );
  }

  const monthLabel = new Date(data.month + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <div className="card p-4 border-ccb-primary/30">
        <div className="flex items-start gap-3">
          <Trophy className="w-5 h-5 text-ccb-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">All leagues — {monthLabel}</h3>
            <p className="text-xs text-ccb-muted mt-1 leading-relaxed">
              The cycle is the calendar month: XP accumulates from the 1st, the boards reset on the
              next 1st, and lifetime XP is kept forever. Rosters rebalance at each monthly settle so
              all five leagues stay evenly filled. Club members earn up to 2x XP on every result.
              {data.rewardsPaused ? " Cash rewards are paused for now — the leagues themselves keep running." : ""}
            </p>
          </div>
        </div>
      </div>

      {[...(data.leagues ?? [])].sort((a, b) => b.tier - a.tier).map((lg, i) => (
        <React.Fragment key={lg.tier}>
          <LeagueCard league={lg} currency={currency} rewardsPaused={data.rewardsPaused} />
          {/* Mid-feed inline ad: between the 2nd and 3rd league card. */}
          {i === 1 && <AdSlot placement="leagues_inline" />}
        </React.Fragment>
      ))}
    </div>
  );
}
