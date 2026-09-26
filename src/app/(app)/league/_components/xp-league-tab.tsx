'use client';

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PauseCircle, Loader2, Swords, ChevronDown, Zap, Gift, ArrowDownCircle, TrendingUp, Trophy, Info, Crown, CalendarClock } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { countryFlag } from "@/lib/geo/flags";
import AdSlot from "@/components/ads/ad-slot";

interface Standing {
  userId: string;
  name: string;
  rating: number;
  xp: number;
  rank: number;
  isMe: boolean;
  /** Active CCB Club membership. */
  isClub: boolean;
  /** Career XP — never resets. */
  lifetimeXp: number;
  country?: string | null;
  /** Games finished in the current month. */
  games?: number;
}

type Allocation = {
  free: Record<"win" | "draw" | "loss", { non_club: number; club: number }>;
  cash: Record<"win" | "draw" | "loss", { non_club: number; club: number }>;
};

interface StandingsResponse {
  seeded: boolean;
  enabled: boolean;
  level: "club" | "non_club";
  levelName: string;
  tier?: { tier: number; name: string; emoji: string };
  myXp?: number;
  myRank?: number | null;
  lifetimeXp?: number;
  promoteCount?: number;
  demoteCount?: number;
  tierCap?: number;
  cycleStart?: string;
  cycleEnd?: string;
  standings?: Standing[];
  xpRules?: { allocation: Allocation; dailyCap: number };
  rewards?: number[];
  rewardsPaused?: boolean;
  topCount?: number;
  tiers?: { tier: number; name: string; emoji: string }[];
  tierRewards?: Record<number, number[]>;
}

/** XP display: whole numbers plain, halves keep one decimal (2.5). */
function fmtXp(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function useCountdown(targetIso?: string) {
  const [label, setLabel] = useState<string>("");
  useEffect(() => {
    if (!targetIso) return;
    const end = new Date(targetIso + "T00:00:00+02:00").getTime();
    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) { setLabel("Resetting"); return; }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setLabel(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`);
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [targetIso]);
  return label;
}

/** The owner's XP allocation table (2026-09-26), rendered as a grid. */
function XpTable({ rules, isClub }: { rules: Allocation; isClub: boolean }) {
  const col = isClub ? "club" : "non_club";
  const rows = [
    { key: "win" as const, label: "Win" },
    { key: "draw" as const, label: "Draw" },
    { key: "loss" as const, label: "Loss" },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ccb-muted">
            <th className="text-left font-semibold pb-2 pr-3">Result</th>
            <th className="text-right font-semibold pb-2 px-2">Free game</th>
            <th className="text-right font-semibold pb-2 pl-2">Cash game</th>
          </tr>
        </thead>
        <tbody className="text-ccb-text">
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-ccb-muted/10">
              <td className="py-1.5 pr-3 font-medium">{r.label}</td>
              <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                {fmtXp(rules.free[r.key][col])} XP
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-ccb-primary">
                {fmtXp(rules.cash[r.key][col])} XP
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function XpLeagueTab() {
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHow, setShowHow] = useState(false);
  const currency = useCurrency();

  useEffect(() => {
    fetch("/api/league/xp/standings")
      .then((r) => (r.status === 401 ? null : r.json()))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const countdown = useCountdown(data?.cycleEnd);

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
        <p className="text-sm text-ccb-muted">Sign in to see your league.</p>
      </div>
    );
  }

  const rules = data.xpRules;
  const rewards = data.rewards ?? [];
  const topCount = data.topCount ?? 5;
  const isClub = data.level === "club";

  // ── Not seeded yet: auto-entry explainer ────────────────────────────
  if (!data.seeded) {
    return (
      <div className="space-y-4">
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-ccb-primary/15 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-ccb-primary" />
            </div>
            <div>
              <h2 className="font-bold">Earn your place in the XP Leagues</h2>
              <p className="text-xs text-ccb-muted mt-0.5">Free entry · fresh board every month · lifetime XP kept forever</p>
            </div>
          </div>
          <p className="text-sm text-ccb-muted mt-4 leading-relaxed">
            Play any game — chess or draughts, free or cash — and you start in the Open League.
            Every game you finish earns XP, and Club members earn up to <b className="text-ccb-text">2x XP</b> on
            every result. Climb the ladder all the way to the Premier League — rosters rebalance on the 1st of each month.
          </p>
          <Link href="/play" className="btn-primary w-full flex items-center justify-center gap-2 mt-5 py-3 rounded-xl text-sm font-bold">
            <Swords className="w-4 h-4" /> Play your first game
          </Link>
        </div>

        {rules && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-3">How much XP you&apos;ll earn</h3>
            <XpTable rules={rules.allocation} isClub={isClub} />
            <p className="text-[11px] text-ccb-muted mt-3">
              You&apos;re a <b className="text-ccb-text">{data.levelName}</b>.
              {!isClub && <> Join the Club to earn up to 2x XP on every result — <Link href="/membership" className="text-ccb-primary font-semibold underline underline-offset-2">see membership</Link>.</>}
            </p>
          </div>
        )}

        {data.tiers && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-3">The five leagues</h3>
            <div className="space-y-2">
              {data.tiers.map((t, i) => {
                const payout = data.tierRewards?.[t.tier]?.[0] ?? 0;
                return (
                  <div key={t.tier} className={`flex items-center gap-3 p-2.5 rounded-lg ${i === data.tiers!.length - 1 ? "bg-ccb-primary/10" : "bg-ccb-muted/5"}`}>
                    <span className="text-xl">{t.emoji}</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-[11px] text-ccb-muted">
                        {["Everyone starts here", "Developing players", "Intermediate players", "Advanced players", "The platform's best"][i]}
                      </div>
                    </div>
                    {payout > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-[9px] text-ccb-muted font-semibold uppercase tracking-wide">1st wins</div>
                        <div className="text-[11px] font-bold text-ccb-primary">{currency.formatRewardMoney(payout)}</div>
                      </div>
                    )}
                    {i < (data.tiers?.length ?? 5) - 1 && <TrendingUp className="w-3.5 h-3.5 text-ccb-muted/50" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Seeded: my tier's monthly standings ────────────────────────────
  const standings = data.standings ?? [];
  const promote = data.promoteCount ?? 3;
  const demote = data.demoteCount ?? 5;
  const tierCap = data.tierCap ?? 1000;
  const n = standings.length;
  const demoteStart = demote > 0 && n > promote + demote ? n - demote + 1 : Infinity;

  return (
    <div className="space-y-4">
      {/* Cash-rewards pause (owner 2026-09-24): replaces the figures
          while the payout kill-switch is on; disappears automatically
          the moment admin re-enables payouts. */}
      {data.rewardsPaused && (
        <div className="card p-4 border-amber-400/40">
          <div className="flex items-start gap-3">
            <PauseCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Cash rewards paused for now</h3>
              <p className="text-xs text-ccb-muted mt-1 leading-relaxed">
                Real cash rewards on the XP Leagues are on hold — we&apos;ll bring them back once things are stable.
                Nothing else changes: every game still earns XP, and the leagues, rankings and monthly
                rebalance keep running exactly as they are.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header: tier + my rank + monthly & lifetime XP + countdown */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl shrink-0">{data.tier?.emoji}</span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate">{data.tier?.name}</h2>
              <p className="text-xs text-ccb-muted">
                <span className={`font-semibold ${isClub ? "text-ccb-accent" : ""}`}>{data.levelName}</span>
                {" · "}Rank: {data.myRank ? `#${data.myRank}` : "—"} ·{" "}
                <span className={(data.myXp ?? 0) < 0 ? "text-destructive font-semibold" : "font-semibold text-ccb-text"}>
                  {fmtXp(data.myXp ?? 0)} XP
                </span>
                {" · Lifetime: "}<span className="font-semibold text-ccb-text">{fmtXp(data.lifetimeXp ?? 0)} XP</span>
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <div className="text-xs text-ccb-muted flex items-center gap-1.5 sm:justify-end">
              <CalendarClock className="w-3.5 h-3.5" /> Resets on the 1st
            </div>
            <div className="text-sm font-bold text-ccb-primary tabular-nums">{countdown || "…"}</div>
          </div>
        </div>
      </div>

      {/* Club CTA for non-club players (design objective:
          Free Games → Join Club → Play Cash Games → Earn XP faster) */}
      {!isClub && (
        <Link href="/membership" className="rounded-xl border border-ccb-accent/40 bg-ccb-accent/10 px-4 py-2.5 flex items-center gap-2 hover:bg-ccb-accent/15 transition-colors">
          <Crown className="w-4 h-4 text-ccb-accent shrink-0" />
          <p className="text-xs text-ccb-muted">
            <span className="font-semibold text-ccb-foreground">Join the Club</span> — earn up to 2x XP on every result, and cash games pay double
          </p>
        </Link>
      )}

      {/* Rewards strip */}
      {rewards.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Gift className="w-4 h-4 text-ccb-primary" />
            <h3 className="text-sm font-semibold">
              Monthly rewards — top {topCount} in the {data.tier?.name ?? "league"}
            </h3>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {rewards.map((r, i) => (
              <div key={i} className={`rounded-lg py-2 px-1 text-center ${i === 0 ? "bg-ccb-primary/15" : "bg-ccb-muted/5"}`}>
                <div className="text-[10px] text-ccb-muted font-semibold">#{i + 1}</div>
                <div className="text-xs font-bold mt-0.5">{currency.formatRewardMoney(r)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mid-feed inline ad */}
      <AdSlot placement="leagues_inline" />

      {/* Leaderboard */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ccb-muted/10">
          <h3 className="text-sm font-semibold">This month&apos;s standings</h3>
          <div className="flex items-center gap-3 text-[10px] text-ccb-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Reward zone</span>
            <span className="flex items-center gap-1"><Crown className="w-2.5 h-2.5 text-ccb-accent" /> Club member</span>
            {demoteStart !== Infinity && <span className="flex items-center gap-1"><ArrowDownCircle className="w-2.5 h-2.5 text-red-400" /> Demotion</span>}
          </div>
        </div>
        {standings.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-ccb-muted">Fresh month, fresh board — play a game to get on it.</p>
            <Link href="/play" className="btn-primary inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl text-sm font-bold">
              <Swords className="w-4 h-4" /> Find a game
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-ccb-muted/5">
            {standings.map((s) => {
              const inReward = s.rank <= topCount;
              const inDemotion = s.rank >= demoteStart;
              return (
                <div
                  key={s.userId}
                  className={`flex items-center gap-3 px-4 py-2.5 ${s.isMe ? "bg-ccb-primary/10" : ""} ${inReward ? "border-l-[3px] border-l-emerald-500" : inDemotion ? "border-l-[3px] border-l-red-400" : ""}`}
                >
                  <div className={`w-7 text-center text-sm font-bold ${s.rank === 1 ? "text-amber-400" : s.rank <= 3 ? "text-ccb-muted" : "text-ccb-muted/70"}`}>
                    {s.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {s.name}{countryFlag(s.country) && <span className="ml-1">{countryFlag(s.country)}</span>} {s.isMe && <span className="text-[10px] font-bold text-ccb-primary">YOU</span>}
                      {s.isClub && <Crown className="w-3 h-3 text-ccb-accent inline-block ml-1 -mt-0.5" aria-label="Club member" />}
                    </div>
                    <div className="text-[11px] text-ccb-muted">Rating {s.rating} · Lifetime {fmtXp(s.lifetimeXp ?? 0)} XP</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{s.games ?? 0}</div>
                    <div className="text-[10px] text-ccb-muted">Games</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold tabular-nums ${s.xp < 0 ? "text-destructive" : ""}`}>{fmtXp(s.xp)}</div>
                    <div className="text-[10px] text-ccb-muted">XP</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="card">
        <button
          onClick={() => setShowHow(!showHow)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Info className="w-4 h-4 text-ccb-muted" /> How the XP Leagues work
          </span>
          <ChevronDown className={`w-4 h-4 text-ccb-muted transition-transform ${showHow ? "rotate-180" : ""}`} />
        </button>
        {showHow && rules && (
          <div className="px-4 pb-4 space-y-3 text-xs text-ccb-muted leading-relaxed">
            <XpTable rules={rules.allocation} isClub={isClub} />
            <p>
              XP is awarded automatically when a game completes — exactly once per game, never for
              abandoned or cancelled games. Cash games are staked battles; even a cash-game loss
              earns a little XP because you showed up. Games against the computer never count.
            </p>
            <p>
              As a <b className="text-ccb-text">{data.levelName}</b> you earn the{" "}
              {isClub ? "Club" : "Non-Club"} rates above.
              {!isClub && <> Club members earn up to 2x XP — <Link href="/membership" className="text-ccb-primary font-semibold underline underline-offset-2">join the Club</Link> to level up your XP.</>}
              To keep it fair you can earn at most <b className="text-ccb-text">{rules.dailyCap} XP per day</b>.
            </p>
            <p>
              The cycle is the calendar month: XP accumulates all month, the leaderboard resets on
              the 1st, and your <b className="text-ccb-text">lifetime XP</b> is kept forever. Everyone joins the
              Open League and climbs — Open → Amateur → Bronze → Knights Championship → Premier League.
              Rosters <b className="text-ccb-text">auto-rebalance</b> at the monthly settle: when one league runs
              short or overfull, players move in one wave so all five stay evenly filled.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
