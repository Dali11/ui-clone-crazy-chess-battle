import { monthlyRewardsForTier, LEAGUE_TIERS, type LeagueXpConfig } from "./index";

/**
 * Pure monthly-settlement planner — the single source of truth for what
 * the settle does. The settle route (and the admin settle-preview
 * endpoint) both call planMonthlySettlement; the route only EXECUTES the
 * plan (deposits, snapshot bulk-upsert, member resets, rebalance moves),
 * so the entire decision layer — ranking, payout gating, promotion /
 * demotion, fair-share rebalance — is deterministic and unit-testable
 * with synthetic rosters, no database.
 *
 * Owner correction 2026-09-26: the five-tier league ladder and the
 * fair-share rebalance are MAINTAINED — the CYCLE moved from weekly to
 * the calendar month. Each tier runs its own monthly leaderboard and
 * monthly payouts; promotion/demotion and the rebalance now ride the
 * monthly settle on the 1st.
 *
 * Faithful port of the tiered weekly planner (audit 2026-09-11) onto
 * the monthly cycle.
 */

export interface PlanMember {
  user_id: string;
  tier: number;
  xp: number;
  /** Month key (yyyy-mm-01) the member's XP belongs to. */
  cycle_start: string;
  /** Lifetime XP — maintained forever, never resets. */
  lifetime_xp: number;
  display_name: string;
}

export interface SettlementPayout {
  userId: string;
  tier: number;
  rank: number;
  rewardMwk: number;
}

export interface SettlementSnapshot {
  month: string;
  tier: number;
  user_id: string;
  display_name: string;
  final_rank: number;
  final_xp: number;
  lifetime_xp: number;
  reward_mwk: number;
}

export interface RebalanceMove {
  userId: string;
  fromTier: number;
  toTier: number;
}

export interface TierPlan {
  tier: number;
  roster: number;
  active: number;
  /** Top payout rows for this tier (rank, reward > 0). */
  payouts: Array<{ userId: string; rank: number; xp: number; rewardMwk: number }>;
}

export interface MonthlySettlePlan {
  closingMonth: string;
  newMonth: string;
  /** Whether wallet credits happen for this closing month. */
  payOn: boolean;
  /** Human-readable reason when payOn is false. */
  unpaidReason: string | null;
  /** True when the standard promote/relegate auto-gate (top-4 leagues at
   *  tier_cap) has opened moves without an admin flip. */
  movesAuto: boolean;
  payouts: SettlementPayout[];
  snapshots: SettlementSnapshot[];
  /** newTier -> user_ids to reset (xp 0, new month key, tier). */
  updateGroups: Record<number, string[]>;
  rebalanceUp: RebalanceMove[];
  rebalanceDown: RebalanceMove[];
  totals: { paid: number; moves: number; snapshots: number; capped: number };
  tiers: TierPlan[];
}

export function planMonthlySettlement(args: {
  members: PlanMember[];
  cfg: LeagueXpConfig;
  closingMonth: string;
  newMonth: string;
}): MonthlySettlePlan {
  const { members, cfg, closingMonth, newMonth } = args;

  // ── Payout gate ───────────────────────────────────────────────────────
  // Three independent switches must all allow money:
  //  1. rewards_enabled         — the global reward system switch
  //  2. monthly_rewards_enabled — admin pause switch (kill-switch)
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

  const promoted = cfg.promote_count ?? 3;
  const demoted = cfg.demote_count ?? 5;
  const topCount = Math.max(1, cfg.monthly_top_count ?? 5);
  const cap = (cfg.tier_cap ?? 0) > 0 ? (cfg.tier_cap as number) : Infinity;

  // ── Standard moves gate (owner policy, kept) ─────────────────────────
  // The standard promote-top / relegate-bottom system stays OFF until
  // every one of the top four leagues (tiers 2–5) has filled to tier_cap
  // players; until then the fair-share rebalance below is the only thing
  // that moves rosters. Admin can still force moves with tier_moves_enabled.
  const rosterCount: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const m of members) rosterCount[m.tier] = (rosterCount[m.tier] ?? 0) + 1;
  const autoMovesOn = [2, 3, 4, 5].every((t) => rosterCount[t] >= cap);
  const movesOn = cfg.tier_moves_enabled === true || autoMovesOn;
  // Monthly rewards are always MWK-denominated arrays — no FX needed.
  const rewardsFor = (tier: number) => (payOn ? monthlyRewardsForTier(cfg, tier) : [0, 0, 0, 0, 0]);

  const finalTier = new Map<string, number>();
  const movedUsers = new Set<string>();
  const payouts: SettlementPayout[] = [];
  const snapshots: SettlementSnapshot[] = [];
  const updateGroups: Record<number, string[]> = {};
  const tiers: TierPlan[] = [];
  let moves = 0, capped = 0;

  for (const tier of LEAGUE_TIERS.map((t) => t.tier)) {
    const rewards = rewardsFor(tier);
    const tierMembers = members.filter((m) => m.tier === tier);
    const active = tierMembers.filter((m) => m.cycle_start === closingMonth);
    if (active.length === 0) continue; // empty league — no phantom payouts/snapshots

    // Rank: active members first (xp desc), stale rows last (they played
    // nothing this month). Stable by input order (xp desc, updated_at asc).
    const indexed = tierMembers.map((m, i) => ({ m, i }));
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

    const n = ranked.length;
    // Roster of the league above — promotion only while it has free slots.
    const destRoster = members.filter((m) => m.tier === tier + 1).length;
    let room = Math.max(0, cap - destRoster);
    const tierPayouts: TierPlan["payouts"] = [];

    for (let i = 0; i < n; i++) {
      const m = ranked[i];
      const rank = i + 1;
      const isActive = m.cycle_start === closingMonth;
      const isPayoutTop = rank <= topCount && isActive && m.xp > 0;
      const isPromoteTop = rank <= promoted && isActive && m.xp > 0;
      const isBottom = isActive && demoted > 0 && n > promoted + demoted && rank > n - demoted;

      let reward = 0;
      let newTier = m.tier;
      let didPromote = false, didDemote = false;

      if (isPayoutTop) {
        reward = rewards[rank - 1] ?? 0;
        if (reward > 0) {
          payouts.push({ userId: m.user_id, tier, rank, rewardMwk: reward });
          tierPayouts.push({ userId: m.user_id, rank, xp: m.xp, rewardMwk: reward });
        }
      }
      if (isPromoteTop) {
        if (movesOn && tier < 5 && room > 0) { newTier = tier + 1; didPromote = true; room--; }
        else if (movesOn && tier < 5 && room <= 0) capped++;
      } else if (isBottom && movesOn && tier > 1) {
        newTier = tier - 1; didDemote = true;
      }

      finalTier.set(m.user_id, newTier);
      if (didPromote || didDemote) { moves++; movedUsers.add(m.user_id); }

      snapshots.push({
        month: closingMonth,
        tier,
        user_id: m.user_id,
        display_name: m.display_name || "Player",
        final_rank: rank,
        final_xp: isActive ? m.xp : 0,
        lifetime_xp: m.lifetime_xp ?? 0,
        reward_mwk: reward,
      });
      (updateGroups[newTier] ??= []).push(m.user_id);
    }

    tiers.push({ tier, roster: tierMembers.length, active: active.length, payouts: tierPayouts });
  }

  // ── Fair-share rebalance (owner policy 2026-09-11, kept) ──────────────
  // After the standard moves: any roster drift from the even share
  // (total / 5, top leagues take the remainder) is corrected in one wave.
  // Over-shared leagues shed their bottom (inactive sink first); Open's
  // surplus rides up (XP earners first, then a best-of-rest fallback).
  // Only fires at drift ≥ 5.
  const rebalanceUp: RebalanceMove[] = [];
  const rebalanceDown: RebalanceMove[] = [];
  {
    // Sentinel below any real monthly XP total ("didn't play this month").
    const STALE_XP_SENTINEL = -1_000_000;
    const all = members.map((m) => ({
      user_id: m.user_id,
      tier: finalTier.get(m.user_id) ?? m.tier,
      earned: m.cycle_start === closingMonth && (m.xp ?? 0) > 0,
      xp: m.cycle_start === closingMonth ? (m.xp ?? 0) : STALE_XP_SENTINEL,
    }));
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const m of all) counts[m.tier]++;
    const total = all.length;
    const base = Math.floor(total / 5);
    const rem = total % 5;
    const targets: Record<number, number> = {
      1: base,
      2: base + (rem > 3 ? 1 : 0),
      3: base + (rem > 2 ? 1 : 0),
      4: base + (rem > 1 ? 1 : 0),
      5: base + (rem > 0 ? 1 : 0),
    };
    const pool = (t: number) =>
      all.filter((m) => m.tier === t && !movedUsers.has(m.user_id)).sort((a, b) => b.xp - a.xp);

    // Top-down demotion: leagues over their fair share shed their bottom.
    for (let t = 5; t >= 2; t--) {
      const excess = counts[t] - targets[t];
      if (excess < 5) continue;
      const bottom = pool(t).slice().reverse().slice(0, excess);
      if (bottom.length === 0) continue;
      for (const m of bottom) {
        rebalanceDown.push({ userId: m.user_id, fromTier: t, toTier: t - 1 });
        movedUsers.add(m.user_id);
      }
      counts[t] -= bottom.length;
      counts[t - 1] += bottom.length;
    }

    // Bottom-up promotion: Open's surplus rides up the chain (earners
    // first, best-of-rest fallback so the share actually lands).
    let inflow = Math.max(0, counts[1] - targets[1]);
    if (inflow >= 5) {
      for (let t = 2; t <= 5 && inflow > 0; t++) {
        const room = Math.max(0, cap - counts[t]);
        if (room <= 0) break;
        const candidates = pool(t - 1); // xp desc: earners, best-of-rest, stale last
        const earners = candidates.filter((m) => m.earned);
        const takeEarners = Math.min(inflow, earners.length, room);
        const wave = earners.slice(0, takeEarners);
        const fallbackNeed = Math.min(inflow - takeEarners, room - takeEarners);
        if (fallbackNeed > 0) {
          const rest = candidates.filter((m) => !m.earned);
          wave.push(...rest.slice(0, fallbackNeed));
        }
        const move = wave.length;
        if (move <= 0) break;
        for (const m of wave) {
          rebalanceUp.push({ userId: m.user_id, fromTier: t - 1, toTier: t });
          m.tier = t;
          movedUsers.add(m.user_id);
        }
        counts[t - 1] -= move;
        counts[t] += move;
        const shortBy = Math.max(0, targets[t] - (counts[t] - move));
        inflow = move - Math.min(move, shortBy);
      }
    }
  }

  return {
    closingMonth,
    newMonth,
    payOn,
    unpaidReason,
    movesAuto: autoMovesOn,
    payouts,
    snapshots,
    updateGroups,
    rebalanceUp,
    rebalanceDown,
    totals: {
      paid: payouts.length,
      moves,
      snapshots: snapshots.length,
      capped,
    },
    tiers,
  };
}
