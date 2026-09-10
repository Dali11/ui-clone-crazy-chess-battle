'use client';

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Swords, TrendingUp, ChevronDown, Zap, Gift, ArrowDownCircle, Trophy, Info } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";

interface Standing {
  userId: string;
  name: string;
  rating: number;
  xp: number;
  rank: number;
  isMe: boolean;
}

interface StandingsResponse {
  seeded: boolean;
  enabled: boolean;
  tier?: { tier: number; name: string; emoji: string };
  myXp?: number;
  myRank?: number | null;
  promoteCount?: number;
  demoteCount?: number;
  cycleEnd?: string;
  standings?: Standing[];
  xpRules?: { win: number; draw: number; loss: number; upsetBonus: number; dailyCap: number };
  rewards?: number[];
  tiers?: { tier: number; name: string; emoji: string }[];
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

export default function XpLeagueTab() {
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHow, setShowHow] = useState(false);
  const { convertFormatted } = useCurrency();

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

  // ── Not seeded yet: placement explainer ────────────────────────────────
  if (!data.seeded) {
    return (
      <div className="space-y-4">
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-ccb-primary/15 flex items-center justify-center shrink-0">
              <Zap className="w-5.5 h-5.5 text-ccb-primary" />
            </div>
            <div>
              <h2 className="font-bold">Earn your place in the XP Leagues</h2>
              <p className="text-xs text-ccb-muted mt-0.5">Free entry · everyone starts Monday fresh</p>
            </div>
          </div>
          <p className="text-sm text-ccb-muted mt-4 leading-relaxed">
            Play any game — chess or draughts — and you&apos;ll be placed into a league based on your rating.
            Every game you finish earns XP. The top {data.tiers ? 5 : 5} players in each league are rewarded
            and promoted every week.
          </p>
          <Link href="/play" className="btn-primary w-full flex items-center justify-center gap-2 mt-5 py-3 rounded-xl text-sm font-bold">
            <Swords className="w-4 h-4" /> Play your first game
          </Link>
        </div>

        {data.tiers && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-3">The five leagues</h3>
            <div className="space-y-2">
              {data.tiers.map((t, i) => (
                <div key={t.tier} className={`flex items-center gap-3 p-2.5 rounded-lg ${i === data.tiers!.length - 1 ? "bg-ccb-primary/10" : "bg-ccb-muted/5"}`}>
                  <span className="text-xl">{t.emoji}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-[11px] text-ccb-muted">
                      {["Rating 400–649", "Rating 650–899", "Rating 900–1149", "Rating 1150–1399", "Rating 1400+"][i]}
                    </div>
                  </div>
                  {i < (data.tiers?.length ?? 5) - 1 && <TrendingUp className="w-3.5 h-3.5 text-ccb-muted/50" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Seeded: standings ─────────────────────────────────────────────────
  const standings = data.standings ?? [];
  const promote = data.promoteCount ?? 5;
  const demote = data.demoteCount ?? 5;
  const n = standings.length;
  const demoteStart = n > promote + demote ? n - demote + 1 : Infinity;

  return (
    <div className="space-y-4">
      {/* Header: tier + my rank + countdown */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{data.tier?.emoji}</span>
            <div>
              <h2 className="text-lg font-bold">{data.tier?.name}</h2>
              <p className="text-xs text-ccb-muted">Your rank: {data.myRank ? `#${data.myRank}` : "—"} · {data.myXp ?? 0} XP</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-ccb-muted">Resets Monday 00:00 CAT</div>
            <div className="text-sm font-bold text-ccb-primary tabular-nums">{countdown || "…"}</div>
          </div>
        </div>
      </div>

      {/* Rewards strip */}
      {rewards.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Gift className="w-4 h-4 text-ccb-primary" />
            <h3 className="text-sm font-semibold">Weekly rewards — top {promote} of every league</h3>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {rewards.map((r, i) => (
              <div key={i} className={`rounded-lg py-2 px-1 text-center ${i === 0 ? "bg-ccb-primary/15" : "bg-ccb-muted/5"}`}>
                <div className="text-[10px] text-ccb-muted font-semibold">#{i + 1}</div>
                <div className="text-xs font-bold mt-0.5">{convertFormatted(r)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ccb-muted/10">
          <h3 className="text-sm font-semibold">Weekly standings</h3>
          <div className="flex items-center gap-3 text-[10px] text-ccb-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Reward + promotion</span>
            {demoteStart !== Infinity && <span className="flex items-center gap-1"><ArrowDownCircle className="w-2.5 h-2.5 text-red-400" /> Demotion</span>}
          </div>
        </div>
        {standings.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-ccb-muted">New week, fresh start — play a game to get on the board.</p>
            <Link href="/play" className="btn-primary inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl text-sm font-bold">
              <Swords className="w-4 h-4" /> Find a game
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-ccb-muted/5">
            {standings.map((s) => {
              const inReward = s.rank <= promote;
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
                      {s.name} {s.isMe && <span className="text-[10px] font-bold text-ccb-primary">YOU</span>}
                    </div>
                    <div className="text-[11px] text-ccb-muted">Rating {s.rating}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums">{s.xp}</div>
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
            <Info className="w-4 h-4 text-ccb-muted" /> How XP Leagues work
          </span>
          <ChevronDown className={`w-4 h-4 text-ccb-muted transition-transform ${showHow ? "rotate-180" : ""}`} />
        </button>
        {showHow && rules && (
          <div className="px-4 pb-4 space-y-2 text-xs text-ccb-muted leading-relaxed">
            <p>Every finished game earns XP — wins <b className="text-ccb-text">{rules.win} XP</b>, draws <b className="text-ccb-text">{rules.draw} XP</b>, losses <b className="text-ccb-text">{rules.loss} XP</b>. Beat a higher-rated player for <b className="text-ccb-text">+{rules.upsetBonus} XP</b> extra.</p>
            <p>To keep it fair, you can earn at most <b className="text-ccb-text">{rules.dailyCap} XP per day</b>, and games against the computer never count.</p>
            <p>Standings reset <b className="text-ccb-text">every Monday at 00:00 CAT</b>. The top {promote} players in each league are rewarded and promoted to the next league up; the bottom {demote} are demoted. Premier League champions stay on top.</p>
            <p>Everyone who joins starts in the Open League and climbs the ladder — Open → Amateur → Bronze → Knights Championship → Premier League.</p>
          </div>
        )}
      </div>
    </div>
  );
}
