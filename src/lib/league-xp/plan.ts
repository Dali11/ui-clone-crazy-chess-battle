import { rewardsForTier, type LeagueXpConfig } from "./index";

/**
 * Pure weekly-settlement planner — the single source of truth for what
 * the settle does. The settle route (and the admin settle-preview
 * endpoint) both call planWeeklySettlement; the route only EXECUTES the
 * plan (deposits, snapshot bulk-upsert, member resets, rebalance moves),
 * so the entire decision layer — ranking, payout gating, promotion /
 * demotion, fair-share rebalance — is deterministic and unit-testable
 * with synthetic rosters, no database.
 *
 * Faithful port of the logic previously inline in
 * src/app/api/league/xp/settle/route.ts (audit 2026-09-11).
 */

export interface PlanMember {
  user_id: string;
  tier: number;
  xp: number;
  /** Week key the member's XP belongs to (members rows carry this). */
  week_start: string;
  display_name: string;
}

export interface SettlementPayout {
  userId: string;
  tier: number;
  rank: number;
  rewardMwk: number;
}

export interface SettlementSnapshot {
  week_start: string;
  tier: number;
  user_id: string;
  display_name: string;
  final_rank: number;
  final_xp: number;
  reward_mwk: number;
  promoted: boolean;
  demoted: boolean;
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

export interface WeeklySettlePlan {
  closingWeek: string;
  newWeek: string;
  /** Whether wallet credits happen for this closing week. */
  payOn: boolean;
  /** Human-readable reason when payOn is false. */
  unpaidReason: string | null;
  payouts: SettlementPayout[];
  snapshots: SettlementSnapshot[];
  /** newTier -> user_ids to reset (xp 0, new week_start, tier). */
  updateGroups: Record<number, string[]>;
  rebalanceUp: RebalanceMove[];
  rebalanceDown: RebalanceMove[];
  totals: { paid: number; moves: number; snapshots: number; capped: number };
  tiers: TierPlan[];
}

export function planWeeklySettlement(args: {
  members: PlanMember[];
  cfg: LeagueXpConfig;
  closingWeek: string;
  newWeek: string;
  /** USD -> MWK rate, used only when cfg.rewards_currency === "USD".
   * Validated against a sanity band (500-5000) before paying — a failed
   * FX fetch (rate 1 / 0) refuses to settle rather than mis-credit. */
  usdToMwk?: number;
}): WeeklySettlePlan {
  const { members, cfg, closingWeek, newWeek } = args;

  // ── Payout gate ───────────────────────────────────────────────────────
  // Three independent switches must all allow money:
  //  1. rewards_enabled         — the global reward system switch
  //  2. weekly_payouts_enabled — admin pause switch (kill-switch)
  //  3. closingWeek >= payouts_start — the date gate: the settle refuses
  //     to pay for any week that STARTS before the configured date. This
  //     is the "automation in code": no external scheduler is needed —
  //     the daily settle cron simply flips itself over to paying when it
  //     closes the first eligible week (Season 1's opening week, which
  //     began mid-week, plays for free; the first paid close is the
  //     settle AFTER the week starting on payouts_start).
  const beforeStart = !!cfg.payouts_start && closingWeek < cfg.payouts_start;
  // USD-denominated rewards need a valid live rate to credit MWK wallets.
  const usdMode = cfg.rewards_currency === "USD";
  const usdToMwk = args.usdToMwk ?? 0;
  const rateOk = !usdMode || (usdToMwk >= 500 && usdToMwk <= 5000);
  const payOn =
    cfg.rewards_enabled &&
    cfg.weekly_payouts_enabled !== false &&
    !beforeStart &&
    rateOk;
  const unpaidReason = !cfg.rewards_enabled
    ? "rewards_enabled is off"
    : cfg.weekly_payouts_enabled === false
      ? "weekly payouts paused by admin"
      : beforeStart
        ? `week starts before payouts_start (${cfg.payouts_start})`
        : usdMode && !rateOk
          ? `USD rewards but invalid USD->MWK rate (${usdToMwk})`
          : null;

  const promoted = cfg.promote_count;
  const demoted = cfg.demote_count;
  const movesOn = cfg.tier_moves_enabled === true;
  const cap = cfg.tier_cap > 0 ? cfg.tier_cap : Infinity;
  // Rewards in the credit currency (always MWK): convert USD arrays at
  // the live rate when the ladder is dollar-denominated.
  const rewardsFor = (tier: number) => {
    if (!payOn) return [0, 0, 0, 0, 0];
    const arr = rewardsForTier(cfg, tier);
    return usdMode ? arr.map((v: number) => Math.round(v * usdToMwk)) : arr;
  };

  const finalTier = new Map<string, number>();
  const movedUsers = new Set<string>();
  const payouts: SettlementPayout[] = [];
  const snapshots: SettlementSnapshot[] = [];
  const updateGroups: Record<number, string[]> = {};
  const tiers: TierPlan[] = [];
  let moves = 0, capped = 0;

  for (const tier of [1, 2, 3, 4, 5]) {
    const rewards = rewardsFor(tier);
    const tierMembers = members.filter((m) => m.tier === tier);
    const active = tierMembers.filter((m) => m.week_start === closingWeek);
    if (active.length === 0) continue; // empty league — no phantom payouts/snapshots

    // Rank: active members first (xp desc), stale rows last (they played
    // nothing this week). Stable by input order (xp desc, updated_at asc).
    const indexed = tierMembers.map((m, i) => ({ m, i }));
    const ranked = indexed
      .slice()
      .sort((a, b) => {
        const aActive = a.m.week_start === closingWeek ? 0 : 1;
        const bActive = b.m.week_start === closingWeek ? 0 : 1;
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
      const isActive = m.week_start === closingWeek;
      const isTop = rank <= promoted && isActive && m.xp > 0;
      const isBottom = isActive && demoted > 0 && n > promoted + demoted && rank > n - demoted;

      let reward = 0;
      let newTier = m.tier;
      let didPromote = false, didDemote = false;

      if (isTop) {
        reward = rewards[rank - 1] ?? 0;
        if (reward > 0) {
          payouts.push({ userId: m.user_id, tier, rank, rewardMwk: reward });
          tierPayouts.push({ userId: m.user_id, rank, xp: m.xp, rewardMwk: reward });
        }
        if (movesOn && tier < 5 && room > 0) { newTier = tier + 1; didPromote = true; room--; }
        else if (movesOn && tier < 5 && room <= 0) capped++;
      } else if (isBottom && movesOn && tier > 1) {
        newTier = tier - 1; didDemote = true;
      }

      finalTier.set(m.user_id, newTier);
      if (didPromote || didDemote) { moves++; movedUsers.add(m.user_id); }

      snapshots.push({
        week_start: closingWeek,
        tier,
        user_id: m.user_id,
        display_name: m.display_name || "Player",
        final_rank: rank,
        final_xp: isActive ? m.xp : 0,
        reward_mwk: reward,
        promoted: didPromote,
        demoted: didDemote,
      });
      (updateGroups[newTier] ??= []).push(m.user_id);
    }

    tiers.push({ tier, roster: tierMembers.length, active: active.length, payouts: tierPayouts });
  }

  // ── Fair-share rebalance (owner policy 2026-09-11) ────────────────────
  // After the standard moves: any roster drift from the even share
  // (total / 5, top leagues take the remainder) is corrected in one wave.
  // Over-shared leagues shed their bottom (inactive sink first); Open's
  // surplus rides up (XP earners first, then a best-of-rest fallback
  // — owner decision 2026-09-15, so the share is always fair). Only
  // fires at drift ≥ 5.
  const rebalanceUp: RebalanceMove[] = [];
  const rebalanceDown: RebalanceMove[] = [];
  {
    // AUDIT FIX 2026-09-11: the stale-member sentinel used to be -1, which
    // collided with a genuinely active player's real weekly XP once losses
    // stopped flooring at 0 (a single-loss player nets exactly -1). Bumped
    // to a value no real weekly XP total can ever reach, so "didn't play
    // this week" and "played and lost" can never be confused when the
    // rebalance sorts by xp ascending/descending.
    const STALE_XP_SENTINEL = -1_000_000;
    const all = members.map((m) => ({
      user_id: m.user_id,
      tier: finalTier.get(m.user_id) ?? m.tier,
      earned: m.week_start === closingWeek && (m.xp ?? 0) > 0,
      xp: m.week_start === closingWeek ? (m.xp ?? 0) : STALE_XP_SENTINEL,
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

    // Bottom-up promotion: Open's surplus rides up the chain.
    // FAIR-SHARE FALLBACK (owner decision 2026-09-15): XP earners ride
    // first, but when they run out the wave CONTINUES with the best
    // remaining players — highest closing-week XP first, never-played
    // last — so the rebalance actually lands on the fair share even in
    // thin-activity weeks. (The pre-fallback earners-only wave stranded
    // Knights/Premier 22 under target at the week-2 close when only
    // 59/205 Open players had earned.) Riders still climb exactly one
    // tier per settle.
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
    closingWeek,
    newWeek,
    payOn,
    unpaidReason,
    payouts,
    snapshots,
    updateGroups,
    rebalanceUp,
    rebalanceDown,
    totals: { paid: payouts.length, moves, snapshots: snapshots.length, capped },
    tiers,
  };
}
