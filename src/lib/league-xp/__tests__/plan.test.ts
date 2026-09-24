import { describe, it, expect } from "vitest";
import { planWeeklySettlement, type PlanMember } from "../plan";
import { currentWeekStart, nextWeekStart } from "../index";
import type { LeagueXpConfig } from "../index";

const CLOSING = "2026-09-08";
const NEW = "2026-09-15";

const baseCfg: LeagueXpConfig = {
  enabled: true,
  xp_win: 3,
  xp_draw: 1,
  xp_loss: -1,
  daily_xp_cap: 100,
  promote_count: 5,
  demote_count: 5,
  tier_cap: 1000,
  rewards_enabled: true,
  weekly_payouts_enabled: true,
  tier_moves_enabled: false,
  monthly_rewards_enabled: false,
  monthly_top_count: 5,
  season_start: "2026-09-11",
  reward_1_mwk: 2000,
  reward_2_mwk: 1000,
  reward_3_mwk: 500,
  reward_4_mwk: 250,
  reward_5_mwk: 100,
  rewards_t1_mwk: [2000, 1000, 500, 250, 100],
  rewards_t2_mwk: [3000, 1500, 750, 400, 150],
  rewards_t3_mwk: [5000, 2500, 1200, 600, 250],
  rewards_t4_mwk: [8000, 4000, 2000, 1000, 400],
  rewards_t5_mwk: [15000, 8000, 4000, 2000, 1000],
} as unknown as LeagueXpConfig;

let seq = 0;
const m = (tier: number, xp: number, week = CLOSING): PlanMember => ({
  user_id: `u${++seq}`,
  tier,
  xp,
  week_start: week,
  display_name: `Player ${seq}`,
});

describe("planWeeklySettlement — payouts", () => {
  it("pays the configured per-tier rewards to the top 5, 6th gets nothing", () => {
    const members = [m(1, 30), m(1, 25), m(1, 20), m(1, 15), m(1, 10), m(1, 5)];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.payOn).toBe(true);
    expect(plan.payouts.map((p) => p.rewardMwk)).toEqual([2000, 1000, 500, 250, 100]);
    expect(plan.payouts.every((p) => p.tier === 1)).toBe(true);
    // 6th member: snapshot with rank 6 and no reward
    const sixth = plan.snapshots.find((s) => s.final_rank === 6);
    expect(sixth?.reward_mwk).toBe(0);
    expect(plan.snapshots).toHaveLength(6);
  });

  it("uses each tier's own reward table", () => {
    const members = [m(5, 10), m(3, 9), m(2, 8), m(4, 7), m(1, 6)];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    const byTier = new Map(plan.payouts.map((p) => [p.tier, p.rewardMwk]));
    expect(byTier.get(5)).toBe(15000);
    expect(byTier.get(4)).toBe(8000);
    expect(byTier.get(3)).toBe(5000);
    expect(byTier.get(2)).toBe(3000);
    expect(byTier.get(1)).toBe(2000);
  });

  it("never pays zero-XP players even if the league is tiny", () => {
    const members = [m(1, 0), m(1, 0)];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.payouts).toHaveLength(0);
    // but they are still reset & snapshotted
    expect(plan.snapshots).toHaveLength(2);
    expect(plan.updateGroups[1]).toHaveLength(2);
  });

  it("pays nothing and reports the reason when the admin kill-switch is off", () => {
    const members = [m(1, 30), m(1, 20)];
    const plan = planWeeklySettlement({
      members,
      cfg: { ...baseCfg, weekly_payouts_enabled: false },
      closingWeek: CLOSING,
      newWeek: NEW,
    });
    expect(plan.payOn).toBe(false);
    expect(plan.unpaidReason).toContain("paused by admin");
    expect(plan.payouts).toHaveLength(0);
    // XP reset and snapshots still happen — the league keeps running
    expect(plan.snapshots).toHaveLength(2);
    expect(plan.updateGroups[1]).toHaveLength(2);
  });

  it("date gate: no pay for weeks starting before payouts_start, pay after", () => {
    const members = [m(1, 30)];
    const cfg = { ...baseCfg, payouts_start: "2026-09-15" as string | null };
    const before = planWeeklySettlement({ members, cfg, closingWeek: "2026-09-08", newWeek: "2026-09-15" });
    expect(before.payOn).toBe(false);
    expect(before.unpaidReason).toContain("payouts_start");
    // re-plan the same roster as if it played in the gated-in week
    const members2 = [{ ...members[0], week_start: "2026-09-15" }];
    const after = planWeeklySettlement({ members: members2, cfg, closingWeek: "2026-09-15", newWeek: "2026-09-22" });
    expect(after.payOn).toBe(true);
    expect(after.payouts[0]?.rewardMwk).toBe(2000);
  });

  it("global rewards_enabled off blocks everything", () => {
    const plan = planWeeklySettlement({
      members: [m(1, 30)],
      cfg: { ...baseCfg, rewards_enabled: false },
      closingWeek: CLOSING,
      newWeek: NEW,
    });
    expect(plan.payOn).toBe(false);
    expect(plan.unpaidReason).toContain("rewards_enabled");
  });
});

describe("planWeeklySettlement — ranking", () => {
  it("ranks stale members below every active member regardless of their old XP", () => {
    const members = [m(1, 1), m(1, 2), m(1, 99, "2026-09-01")];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    const ranks = plan.snapshots.map((s) => [s.final_rank, s.final_xp]);
    expect(ranks[0]).toEqual([1, 2]); // active, xp 2
    expect(ranks[1]).toEqual([2, 1]); // active, xp 1
    expect(ranks[2]).toEqual([3, 0]); // stale — final_xp forced 0
    expect(plan.payouts).toHaveLength(2); // stale 99-XP row never pays
  });

  it("skips tiers with no active members (no phantom snapshots)", () => {
    const members = [m(1, 10), m(3, 10)];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.tiers.map((t) => t.tier)).toEqual([1, 3]);
    expect(plan.snapshots.every((s) => s.tier === 1 || s.tier === 3)).toBe(true);
  });
});

describe("planWeeklySettlement — standard moves (tier_moves_enabled)", () => {
  const movesCfg = { ...baseCfg, tier_moves_enabled: true };

  it("promotes the top 5 when there is room and demotes the bottom 5", () => {
    // Tier 2: 6 promotable actives + 6 demotable actives (n=12 > 5+5)
    const members = [
      m(2, 50), m(2, 40), m(2, 30), m(2, 20), m(2, 10), m(2, 9),
      m(2, 8), m(2, 7), m(2, 6), m(2, 5), m(2, 4), m(2, 3),
    ];
    const plan = planWeeklySettlement({ members, cfg: movesCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.totals.moves).toBe(10); // 5 up + 5 down
    expect(plan.updateGroups[3]).toHaveLength(5); // promoted into tier 3
    expect(plan.updateGroups[1]).toHaveLength(5); // demoted into tier 1
    expect(plan.snapshots.filter((s) => s.promoted)).toHaveLength(5);
    expect(plan.snapshots.filter((s) => s.demoted)).toHaveLength(5);
  });

  it("counts capped promotions when the league above is full", () => {
    const cfg = { ...movesCfg, tier_cap: 2 };
    const members = [m(1, 50), m(1, 40), m(1, 30), m(2, 10), m(2, 5)];
    const plan = planWeeklySettlement({ members, cfg, closingWeek: CLOSING, newWeek: NEW });
    // tier 2 already has 2 = cap → tier 1's 3 actives can't promote
    expect(plan.totals.capped).toBe(3);
    expect(plan.updateGroups[2]).toBeUndefined();
    expect(plan.updateGroups[1]).toHaveLength(3);
  });

  it("never promotes out of Premier (tier 5)", () => {
    const members = [m(5, 50), m(5, 40)];
    const plan = planWeeklySettlement({ members, cfg: movesCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.updateGroups[5]).toHaveLength(2);
    expect(plan.updateGroups[6]).toBeUndefined();
  });
});

describe("planWeeklySettlement — auto-gate: standard moves at tier_cap (owner policy 2026-09-24)", () => {
  it("keeps standard moves OFF while any top-4 league is under tier_cap, even with clear top/bottom splits", () => {
    // One strong top-3 and one weak bottom in tier 2 — classic promote/demote
    // candidates — but tier 2 only has 6 players, far under cap 1000.
    const members = [
      m(2, 30), m(2, 25), m(2, 20), m(2, 5), m(2, 4), m(2, 3),
    ];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.movesAuto).toBe(false);
    expect(plan.snapshots.every((s) => !s.promoted && !s.demoted)).toBe(true);
  });

  it("auto-enables standard moves once tiers 2–5 all have tier_cap players", () => {
    const cap = 6; // small cap so the roster stays test-sized
    const cfg = { ...baseCfg, tier_cap: cap };
    const members: PlanMember[] = [];
    // Tier 2 overfull (cap + 6), tiers 3–5 exactly at cap. All of t2–t5
    // are at/over cap → the auto-gate opens. Standard demotion runs
    // (bottom 5 of t2 drop); promotion from t1 stays capped because
    // t2 has no free room — the cap binds exactly as designed.
    for (let i = 0; i < cap + 6; i++) members.push(m(2, 40 - i));
    for (const t of [3, 4, 5]) for (let i = 0; i < cap; i++) members.push(m(t, 20 - i));
    for (let i = 0; i < 8; i++) members.push(m(1, 50 - i));
    const plan = planWeeklySettlement({ members, cfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.movesAuto).toBe(true);
    const t2 = plan.snapshots.filter((s) => s.tier === 2);
    expect(t2.filter((s) => s.demoted).length).toBe(baseCfg.demote_count as number);
    expect(t2.filter((s) => s.promoted).length).toBe(0); // t5 bound: no t2→t3 room
    expect(plan.snapshots.filter((s) => s.promoted).length).toBe(0); // t1→t2 capped
  });

  it("tier_moves_enabled=true still forces moves regardless of roster size", () => {
    const cfg = { ...baseCfg, tier_moves_enabled: true };
    const members = [m(2, 30), m(2, 25), m(2, 20), m(2, 5), m(2, 4), m(2, 3), m(2, 2), m(2, 1)];
    const plan = planWeeklySettlement({ members, cfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.snapshots.filter((s) => s.promoted).length).toBe(baseCfg.promote_count as number);
  });
});

describe("planWeeklySettlement — fair-share rebalance", () => {
  const fill = (counts: number[], activeFraction = 1) => {
    const members: PlanMember[] = [];
    counts.forEach((count, idx) => {
      for (let i = 0; i < count; i++) {
        const active = i < Math.ceil(count * activeFraction);
        members.push(m(idx + 1, active ? 10 + i : 0, active ? CLOSING : "2026-09-01"));
      }
    });
    return members;
  };

  it("does nothing when drift is under 5", () => {
    const members = fill([22, 20, 20, 19, 19]); // target 20 each, max drift 2
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.rebalanceUp).toHaveLength(0);
    expect(plan.rebalanceDown).toHaveLength(0);
  });

  it("rides Open's surplus up the chain through earned players", () => {
    // 100 players: Open has 35 (15 earned), rest 16/16/16/17 all earned →
    // target 20 everywhere. Open excess 15 ≥ 5 → cascading wave:
    // t1→t2: 15, t2→t3: 11, t3→t4: 7, t4→t5: 3 (36 moves total).
    const members = [
      ...Array.from({ length: 15 }, (_, i) => m(1, 20 - i)),
      ...Array.from({ length: 20 }, (_, i) => m(1, 0, "2026-09-01")),
      ...Array.from({ length: 16 }, (_, i) => m(2, 50 - i)),
      ...Array.from({ length: 16 }, (_, i) => m(3, 50 - i)),
      ...Array.from({ length: 16 }, (_, i) => m(4, 50 - i)),
      ...Array.from({ length: 17 }, (_, i) => m(5, 50 - i)),
    ];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.rebalanceDown).toHaveLength(0);
    expect(plan.rebalanceUp).toHaveLength(36);
    const byDest = plan.rebalanceUp.reduce<Record<number, number>>((acc, mv) => {
      acc[mv.toTier] = (acc[mv.toTier] ?? 0) + 1;
      return acc;
    }, {});
    expect(byDest[2]).toBe(15);
    expect(byDest[3]).toBe(11);
    expect(byDest[4]).toBe(7);
    expect(byDest[5]).toBe(3);
  });

  it("sheds the bottom of over-shared leagues, inactive players first", () => {
    // 100 players: tier 5 has 25 (10 active high-XP, 10 inactive, 5 active low)
    // target 20 → excess 5 → shed 5, inactive sink first.
    const members = [
      ...Array.from({ length: 15 }, (_, i) => m(1, 20 - i)),
      ...Array.from({ length: 20 }, (_, i) => m(2, 50 - i)),
      ...Array.from({ length: 20 }, (_, i) => m(3, 50 - i)),
      ...Array.from({ length: 20 }, (_, i) => m(4, 50 - i)),
      ...Array.from({ length: 10 }, (_, i) => m(5, 100 - i)),
      ...Array.from({ length: 10 }, (_, i) => m(5, 0, "2026-09-01")),
      ...Array.from({ length: 5 }, (_, i) => m(5, 5 - i)),
    ];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    // The shed cascades: t5 sheds 5 into t4, which is now over, so t4
    // sheds 5 into t3 ... down to Open. 5 moves x 4 hops = 20 down, 0 up,
    // and every league ends at its fair share.
    expect(plan.rebalanceDown).toHaveLength(20);
    expect(plan.rebalanceUp).toHaveLength(0);
    // The moves out of tier 5 are the INACTIVE ones (they sink below
    // every active player, so the bottom of tier 5 is inactive players).
    const fromT5 = plan.rebalanceDown.filter((mv) => mv.fromTier === 5).map((mv) => mv.userId);
    const inactives = new Set(members.filter((x) => x.week_start !== CLOSING).map((x) => x.user_id));
    expect(fromT5).toHaveLength(5);
    expect(fromT5.every((u) => inactives.has(u))).toBe(true);
  });

  it("produces exact fair-share counts end to end (up + down mix)", () => {
    // 103 players: t1=40 (20 earned), t2=18, t3=18, t4=17, t5=10
    // 103 players → base 20, rem 3 → targets 20/20/21/21/21 (top leagues
    // take the remainder: tiers 3-5).
    const members = [
      ...Array.from({ length: 20 }, (_, i) => m(1, 20 - i)),
      ...Array.from({ length: 20 }, (_, i) => m(1, 0, "2026-09-01")),
      ...Array.from({ length: 18 }, (_, i) => m(2, 50 - i)),
      ...Array.from({ length: 18 }, (_, i) => m(3, 50 - i)),
      ...Array.from({ length: 17 }, (_, i) => m(4, 50 - i)),
      ...Array.from({ length: 10 }, (_, i) => m(5, 50 - i)),
    ];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.rebalanceDown).toHaveLength(0);
    // Open's 20-player excess rides up the chain: t1→t2 20 (t2 keeps 2),
    // t2→t3 18 (keeps 3), t3→t4 15 (keeps 4), t4→t5 11 (keeps 10).
    const byDest = plan.rebalanceUp.reduce<Record<number, number>>((acc, mv) => {
      acc[mv.toTier] = (acc[mv.toTier] ?? 0) + 1;
      return acc;
    }, {});
    expect(byDest[2]).toBe(20);
    expect(byDest[3]).toBe(18);
    expect(byDest[4]).toBe(15);
    expect(byDest[5]).toBe(11);
    // Resulting rosters land exactly on the fair-share targets.
    const movesByUser = new Map(plan.rebalanceUp.map((mv) => [mv.userId, mv.toTier]));
    const finalCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const mem of members) finalCounts[movesByUser.get(mem.user_id) ?? mem.tier]++;
    expect(finalCounts).toEqual({ 1: 20, 2: 20, 3: 21, 4: 21, 5: 21 });
  });

  it("falls back to best non-earners when earners run out (fair share guaranteed)", () => {
    // 2026-09-15 regression: the week-2 close had only 59/205 Open
    // players earning, so the earners-only wave died at Bronze and left
    // Knights/Premier 22 under target. Same shape here: t1=40 (5 earned,
    // 15 zero-XP active, 20 stale), t2=18, t3=18, t4=17, t5=10.
    const members = [
      ...Array.from({ length: 5 }, (_, i) => m(1, 20 - i)),
      ...Array.from({ length: 15 }, (_, i) => m(1, 0)),
      ...Array.from({ length: 20 }, (_, i) => m(1, 0, "2026-09-01")),
      ...Array.from({ length: 18 }, (_, i) => m(2, 50 - i)),
      ...Array.from({ length: 18 }, (_, i) => m(3, 50 - i)),
      ...Array.from({ length: 17 }, (_, i) => m(4, 50 - i)),
      ...Array.from({ length: 10 }, (_, i) => m(5, 50 - i)),
    ];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.rebalanceDown).toHaveLength(0);
    // Wave into t2: the 5 earners first, then the 15 zero-XP actives.
    // Stale (never-played) members never ride.
    const intoT2 = plan.rebalanceUp.filter((mv) => mv.toTier === 2).map((mv) => mv.userId);
    expect(intoT2).toHaveLength(20);
    const earned = new Set(members.filter((x) => x.week_start === CLOSING && x.xp > 0).map((x) => x.user_id));
    expect(intoT2.filter((u) => earned.has(u))).toHaveLength(5);
    const stale = new Set(members.filter((x) => x.week_start !== CLOSING).map((x) => x.user_id));
    expect(intoT2.some((u) => stale.has(u))).toBe(false);
    // Rosters land exactly on the fair-share targets.
    const movesByUser = new Map(plan.rebalanceUp.map((mv) => [mv.userId, mv.toTier]));
    const finalCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const mem of members) finalCounts[movesByUser.get(mem.user_id) ?? mem.tier]++;
    expect(finalCounts).toEqual({ 1: 20, 2: 20, 3: 21, 4: 21, 5: 21 });
  });
});

describe("planWeeklySettlement — contract details", () => {
  it("stays idempotent-safe: re-running a plan on already-reset members is a no-op", () => {
    // After a successful settle, members carry the NEW week key, so a
    // re-fetch + re-plan for the OLD closing week sees no active members.
    const members = [m(1, 0, NEW), m(2, 0, NEW)];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.snapshots).toHaveLength(0);
    expect(plan.payouts).toHaveLength(0);
    expect(plan.updateGroups).toEqual({});
    expect(plan.rebalanceUp).toHaveLength(0);
    expect(plan.rebalanceDown).toHaveLength(0);
  });

  it("every member lands in exactly one update group", () => {
    const members = [m(1, 30), m(1, 5), m(3, 12), m(5, 40)];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    const all = Object.values(plan.updateGroups).flat();
    expect(all).toHaveLength(4);
    expect(new Set(all).size).toBe(4);
  });
});

describe("calendar week keys (CAT, date-anchored)", () => {
  const cat = (iso: string) => new Date(iso);

  it("anchors weeks to the 1st / 8th / 15th / 22nd", () => {
    expect(currentWeekStart(cat("2026-09-01T05:00:00Z"))).toBe("2026-09-01");
    expect(currentWeekStart(cat("2026-09-07T20:30:00Z"))).toBe("2026-09-01"); // 22:30 CAT on the 7th → week of the 1st
    expect(currentWeekStart(cat("2026-09-08T00:30:00Z"))).toBe("2026-09-08");
    expect(currentWeekStart(cat("2026-09-14T10:00:00Z"))).toBe("2026-09-08");
    expect(currentWeekStart(cat("2026-09-15T00:30:00Z"))).toBe("2026-09-15");
    expect(currentWeekStart(cat("2026-09-21T20:00:00Z"))).toBe("2026-09-15"); // 22:00 CAT on the 21st
    expect(currentWeekStart(cat("2026-09-22T00:30:00Z"))).toBe("2026-09-22");
    expect(currentWeekStart(cat("2026-09-30T12:00:00Z"))).toBe("2026-09-22");
  });

  it("rolls over into the next month (and year)", () => {
    expect(currentWeekStart(cat("2026-10-01T00:30:00Z"))).toBe("2026-10-01");
    expect(currentWeekStart(cat("2026-10-15T00:30:00Z"))).toBe("2026-10-15");
    expect(currentWeekStart(cat("2027-01-22T05:00:00Z"))).toBe("2027-01-22");
  });

  it("nextWeekStart maps 1→8→15→22 and 22→next month 1st", () => {
    expect(nextWeekStart(cat("2026-09-01T05:00:00Z"))).toBe("2026-09-08");
    expect(nextWeekStart(cat("2026-09-08T05:00:00Z"))).toBe("2026-09-15");
    expect(nextWeekStart(cat("2026-09-15T05:00:00Z"))).toBe("2026-09-22");
    expect(nextWeekStart(cat("2026-09-22T05:00:00Z"))).toBe("2026-10-01");
    expect(nextWeekStart(cat("2026-09-30T12:00:00Z"))).toBe("2026-10-01");
    expect(nextWeekStart(cat("2027-01-25T05:00:00Z"))).toBe("2027-02-01");
  });

  it("settle boundary math: 2h-lookback on settle morning detects the close", () => {
    // Settle runs 00:05 CAT daily = 22:05 UTC the previous day. At
    // 2026-09-14T22:05Z (00:05 CAT on the 15th) the 2h-lookback lands at
    // 22:05 CAT on the 14th → closing week 09-08 vs current 09-15 →
    // boundary detected.
    const now = cat("2026-09-14T22:05:00Z");
    const cur = currentWeekStart(now);
    const closing = currentWeekStart(new Date(now.getTime() - 2 * 3600_000));
    expect(cur).toBe("2026-09-15");
    expect(closing).toBe("2026-09-08");
    expect(closing).not.toBe(cur);
    // A day later: no boundary — the settle must no-op.
    const now2 = cat("2026-09-16T22:05:00Z");
    const closing2 = currentWeekStart(new Date(now2.getTime() - 2 * 3600_000));
    expect(closing2).toBe(currentWeekStart(now2));
  });
});

describe("planWeeklySettlement — USD-denominated rewards (owner decision 2026-09-15)", () => {
  const usdCfg = {
    ...baseCfg,
    rewards_currency: "USD" as const,
    // Live ladder: Premier $25, Championship $20, Bronze $15, Amateur $10, Open $5.
    rewards_t5: [10, 6, 4, 3, 2],
    rewards_t4: [8, 5, 3, 2.5, 1.5],
    rewards_t3: [6, 4, 2.5, 1.5, 1],
    rewards_t2: [4, 2.5, 1.5, 1, 1],
    rewards_t1: [2, 1.25, 0.75, 0.5, 0.5],
  } as LeagueXpConfig;

  it("converts USD amounts to whole MWK at the settle-time rate", () => {
    const members = [m(5, 50), m(5, 40), m(5, 30), m(5, 20), m(5, 10)];
    const plan = planWeeklySettlement({ members, cfg: usdCfg, closingWeek: CLOSING, newWeek: NEW, usdToMwk: 1745.2 });
    expect(plan.payOn).toBe(true);
    // $10 at 1745.2 = 17452 exactly; $6 = 10471.2 -> 10471
    expect(plan.payouts[0].rewardMwk).toBe(17452);
    expect(plan.payouts[1].rewardMwk).toBe(10471);
  });

  it("prefers rewards_tN over the legacy rewards_tN_mwk arrays", () => {
    const members = [m(5, 50), m(5, 40), m(5, 30), m(5, 20), m(5, 10)];
    const plan = planWeeklySettlement({ members, cfg: usdCfg, closingWeek: CLOSING, newWeek: NEW, usdToMwk: 1745.2 });
    // If the legacy 15000-MWK array had won, rank 1 would be 15000, not 17452.
    expect(plan.payouts[0].rewardMwk).not.toBe(15000);
    expect(plan.payouts.filter((p) => p.rewardMwk === 15000)).toHaveLength(0);
  });

  it("refuses to pay with a missing or absurd USD->MWK rate (no mis-credits)", () => {
    const members = [m(5, 50), m(5, 40), m(5, 30), m(5, 20), m(5, 10)];
    for (const bad of [0, 1, 400, 9999]) {
      const plan = planWeeklySettlement({ members, cfg: usdCfg, closingWeek: CLOSING, newWeek: NEW, usdToMwk: bad });
      expect(plan.payOn).toBe(false);
      expect(plan.unpaidReason).toContain("USD->MWK");
    }
  });

  it("still pays exact MWK when rewards_currency is absent (legacy configs)", () => {
    const members = [m(1, 50), m(1, 40), m(1, 30), m(1, 20), m(1, 10)];
    const plan = planWeeklySettlement({ members, cfg: baseCfg, closingWeek: CLOSING, newWeek: NEW });
    expect(plan.payOn).toBe(true);
    expect(plan.payouts[0].rewardMwk).toBe(2000);
  });
});
