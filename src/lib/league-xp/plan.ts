import { monthlyRewardArray, type LeagueXpConfig } from "./index";

/**
 * Pure monthly-settlement planner — the single source of truth for what
 * the settle does. The settle route (and the admin settle-preview
 * endpoint) both call planMonthlySettlement; the route only EXECUTES
 * the plan (deposits, snapshot bulk-upsert, member resets), so the
 * entire decision layer — ranking, payout gating — is deterministic and
 * unit-testable with synthetic rosters, no database.
 *
 * Owner redesign 2026-09-26: the XP system is ONE monthly cycle with a
 * single leaderboard — no tiers, no promote/demote, no fair-share
 * rebalance. Everyone competes on the same monthly board; the only
 * player level (Non-Club / Club Member) lives in the XP rates, not in
 * separate rosters.
 */

export interface PlanMember {
  user_id: string;
  /** Monthly XP (league_xp_members.xp). */
  xp: number;
  /** Month key (yyyy-mm-01) the member's XP belongs to. */
  cycle_start: string;
  /** Lifetime XP — maintained forever, never resets. */
  lifetime_xp: number;
  display_name: string;
}

export interface SettlementPayout {
  userId: string;
  rank: number;
  xp: number;
  rewardMwk: number;
}

export interface SettlementSnapshot {
  month: string;
  user_id: string;
  display_name: string;
  final_rank: number;
  final_xp: number;
  lifetime_xp: number;
  reward_mwk: number;
}

export interface MonthlySettlePlan {
  closingMonth: string;
  newMonth: string;
  /** Whether wallet credits happen for this closing month. */
  payOn: boolean;
  /** Human-readable reason when payOn is false. */
  unpaidReason: string | null;
  payouts: SettlementPayout[];
  snapshots: SettlementSnapshot[];
  /** user_ids to reset for the new cycle (xp 0, new month key). */
  resetUserIds: string[];
  totals: { paid: number; ranked: number; snapshots: number; activePlayers: number };
}

export function planMonthlySettlement(args: {
  members: PlanMember[];
  cfg: LeagueXpConfig;
  closingMonth: string;
  newMonth: string;
}): MonthlySettlePlan {
  const { members, cfg, closingMonth, newMonth } = args;

  // ── Payout gate ───────────────────────────────────────────────────────
  //  1. rewards_enabled          — the global reward system switch
  //  2. monthly_rewards_enabled  — admin pause switch (kill-switch)
  //  3. closingMonth >= payouts_start — the date gate: the settle refuses
  //     to pay for any month that STARTS before the configured date.
  const beforeStart = !!cfg.payouts_start && closingMonth < cfg.payouts_start;
  const payOn =
    cfg.rewards_enabled &&
    cfg.monthly_rewards_enabled !== false &&
    !beforeStart;
  const unpaidReason = !cfg.rewards_enabled
    ? "rewards_enabled is off"
    : cfg.monthly_rewards_enabled === false
      ? "monthly payouts paused by admin"
      : beforeStart
        ? `month starts before payouts_start (${cfg.payouts_start})`
        : null;

  const rewards = payOn ? monthlyRewardArray(cfg) : [];
  const topCount = Math.max(1, cfg.monthly_top_count ?? 5);

  // Rank: active members (played this month) first, xp desc; stale rows
  // last (they played nothing this cycle). Stable by input order.
  const indexed = members.map((m, i) => ({ m, i }));
  const ranked = indexed
    .slice()
    .sort((a, b) => {
      const aActive = a.m.cycle_start === closingMonth ? 0 : 1;
      const bActive = b.m.cycle_start === closingMonth ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      if (b.m.xp !== a.m.xp) return b.m.xp - a.m.xp;
      return a.i - b.i;
    })
    .map((r) => r.m);

  const payouts: SettlementPayout[] = [];
  const snapshots: SettlementSnapshot[] = [];
  let rankedActive = 0;

  for (let i = 0; i < ranked.length; i++) {
    const m = ranked[i];
    const rank = i + 1;
    const isActive = m.cycle_start === closingMonth;
    if (isActive) rankedActive++;

    let reward = 0;
    if (payOn && isActive && rank <= topCount && m.xp > 0) {
      reward = rewards[rank - 1] ?? 0;
      if (reward > 0) {
        payouts.push({ userId: m.user_id, rank, xp: m.xp, rewardMwk: reward });
      }
    }

    snapshots.push({
      month: closingMonth,
      user_id: m.user_id,
      display_name: m.display_name || "Player",
      final_rank: rank,
      final_xp: isActive ? m.xp : 0,
      lifetime_xp: m.lifetime_xp ?? 0,
      reward_mwk: reward,
    });
  }

  return {
    closingMonth,
    newMonth,
    payOn,
    unpaidReason,
    payouts,
    snapshots,
    resetUserIds: members.map((m) => m.user_id),
    totals: {
      paid: payouts.length,
      ranked: ranked.length,
      snapshots: snapshots.length,
      activePlayers: rankedActive,
    },
  };
}
