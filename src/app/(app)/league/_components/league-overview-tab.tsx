"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Zap, Trophy } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import AdSlot from "@/components/ads/ad-slot";

interface TopPlayer {
  userId: string;
  name: string;
  country: string | null;
  xp: number;
}

interface LeagueSummary {
  tier: number;
  name: string;
  emoji: string;
  ratingBand: string;
  players: number;
  activeThisWeek: number;
  rewards: number[];
  monthlyRewards: number[];
  top: TopPlayer[];
}

interface OverviewResponse {
  week: string;
  leagues: LeagueSummary[];
}

/** One league card: roster, rewards, and this week's top 5. */
function LeagueCard({ league, currency }: { league: LeagueSummary; currency: ReturnType<typeof useCurrency> }) {
  const weeklyTotal = league.rewards.reduce((s, r) => s + r, 0);
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl shrink-0">{league.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold truncate">{league.name}</h3>
          <p className="text-[11px] text-ccb-muted">{league.ratingBand} · {league.players} player{league.players === 1 ? "" : "s"} · {league.activeThisWeek} active</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-ccb-muted">Weekly pot</p>
          <p className="text-sm font-bold text-ccb-primary tabular-nums">{currency.convertFormatted(weeklyTotal)}</p>
        </div>
      </div>

      {/* Top 5 this week with per-rank rewards */}
      <div className="mt-4 space-y-1.5">
        {league.top.length === 0 ? (
          <p className="text-xs text-ccb-muted/70 italic">No games played yet this week.</p>
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
                <p className="text-xs font-semibold truncate">{p.name}{p.country ? ` · ${p.country}` : ""}</p>
                <p className="text-[10px] text-ccb-muted">{p.xp.toLocaleString()} XP</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold tabular-nums">{currency.convertFormatted(league.rewards[i] ?? 0)}</p>
                <p className="text-[9px] text-ccb-muted/70">{currency.convertFormatted(league.monthlyRewards[i] ?? 0)} monthly</p>
              </div>
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

  return (
    <div className="space-y-4">
      <div className="card p-4 border-ccb-primary/30">
        <div className="flex items-start gap-3">
          <Trophy className="w-5 h-5 text-ccb-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold">All leagues — Season 1</h3>
            <p className="text-xs text-ccb-muted mt-1 leading-relaxed">
              Weeks run the 1st–7th, 8th–14th, 15th–21st and 22nd–month end; rewards are paid
              the morning after each week closes. Top 5 climb, bottom 5 drop. Amounts in your currency.
            </p>
          </div>
        </div>
      </div>

      {[...data.leagues].sort((a, b) => b.tier - a.tier).map((lg, i) => (
        <React.Fragment key={lg.tier}>
          <LeagueCard league={lg} currency={currency} />
          {/* Mid-feed inline ad: between the 2nd and 3rd league card
             (e.g. Premier / Knights done, Bronze / Amateur / Open below).
             Separate placement from the bottom "leagues" ad — smaller
             unit, native-feeling between compact cards. */}
          {i === 1 && <AdSlot placement="leagues_inline" />}
        </React.Fragment>
      ))}
    </div>
  );
}
