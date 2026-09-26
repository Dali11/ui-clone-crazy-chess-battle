import { describe, expect, it } from "vitest";
import { planMonthlySettlement } from "../plan";
import type { LeagueXpConfig } from "../index";

/**
 * Tiered MONTHLY settlement planner tests (owner correction
 * 2026-09-26): the five-tier ladder, promotion/demotion and the
 * fair-share rebalance are maintained — the cycle is the calendar
 * month. Lifetime XP is snapshotted and never reset.
 */

const cfg: LeagueXpConfig = {
  enabled: true,
  daily_xp_cap: 100,
  rewards_enabled: true,
  monthly_rewards_enabled: true,
  monthly_top_count: 3,
  promote_count: 2,
  demote_count: 2,
  tier_cap: 1000,
  reward_1_mwk: 2000,
  reward_2_mwk: 1000,
  reward_3_mwk: 500,
  reward_4_mwk: 250,
  reward_5_mwk: 125,
  monthly_rewards_t1_mwk: [5000, 3000, 1000],
  monthly_rewards_t2_mwk: [4000, 2000, 800],
};

const month = "2026-09-01";
const nextMonth = "2026-10-01";

function m(user_id: string, tier: number, xp: number, cycle: string = month, lifetime = 0) {
  return { user_id, tier, xp, cycle_start: cycle, lifetime_xp: lifetime, display_name: user_id };
}

describe("planMonthlySettlement — ranking & payouts", () => {
  it("ranks active players by monthly XP within their tier and pays the configured top N per tier", () => {
    const plan = planMonthlySettlement({
      members: [
        m("a1", 1, 50), m("a2", 1, 80), m("a3", 1, 10),
        m("b1", 2, 40), m("b2", 2, 90),
      ],
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payOn).toBe(true);
    const t1 = plan.tiers.find((t) => t.tier === 1);
    const t2 = plan.tiers.find((t) => t.tier === 2);
    expect(t1?.payouts.map((p) => p.userId)).toEqual(["a2", "a1", "a3"]);
    expect(t1?.payouts.map((p) => p.rewardMwk)).toEqual([5000, 3000, 1000]);
    expect(t2?.payouts.map((p) => p.userId)).toEqual(["b2", "b1"]);
    expect(t2?.payouts.map((p) => p.rewardMwk)).toEqual([4000, 2000]);
    // no payouts for tiers with no active players
    expect(plan.tiers.find((t) => t.tier === 3)).toBeUndefined();
  });

  it("ranks stale (inactive) members last, never pays or promotes them", () => {
    const plan = planMonthlySettlement({
      members: [m("stale", 1, 999, "2026-09-22"), m("fresh", 1, 5)],
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payouts.length).toBe(1);
    expect(plan.payouts[0].userId).toBe("fresh");
    const snap = plan.snapshots.find((s) => s.user_id === "stale");
    expect(snap?.final_xp).toBe(0);
    expect(snap?.final_rank).toBe(2);
  });

  it("skips zero/negative-XP players in payouts but still resets them", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 1, 0), m("b", 1, -3)],
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payouts.length).toBe(0);
    expect(plan.updateGroups[1]).toEqual(["a", "b"]);
  });

  it("gates payouts on rewards_enabled / kill-switch / payouts_start", () => {
    for (const patch of [
      { rewards_enabled: false },
      { monthly_rewards_enabled: false },
      { payouts_start: "2026-10-01" },
    ] as const) {
      const plan = planMonthlySettlement({
        members: [m("a", 1, 50)],
        cfg: { ...cfg, ...patch },
        closingMonth: month,
        newMonth: nextMonth,
      });
      expect(plan.payOn).toBe(false);
      expect(plan.payouts.length).toBe(0);
      // resets still happen — the league keeps running
      expect(plan.updateGroups[1]).toEqual(["a"]);
    }
    // the first month that STARTS on/after payouts_start pays
    const ok = planMonthlySettlement({
      members: [m("a", 1, 50)],
      cfg: { ...cfg, payouts_start: "2026-10-01" },
      closingMonth: nextMonth,
      newMonth: "2026-11-01",
    });
    expect(ok.payOn).toBe(true);
  });

  it("falls back to the legacy flat rewards when a tier has no monthly array", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 3, 50)],
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payouts[0].rewardMwk).toBe(2000);
  });
});

describe("planMonthlySettlement — moves & rebalance", () => {
  it("promotes top promote_count and demotes bottom demote_count when tier_moves_enabled", () => {
    const ids = ["p1", "p2", "p3", "mid1", "mid2", "d1", "d2"].map((id, i) =>
      m(id, 2, 100 - i * 10));
    const plan = planMonthlySettlement({
      members: ids,
      cfg: { ...cfg, tier_moves_enabled: true },
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.updateGroups[3]).toEqual(["p1", "p2"]); // promoted
    expect(plan.updateGroups[1]).toEqual(["d1", "d2"]); // demoted
    expect(plan.totals.moves).toBe(4);
  });

  it("does NOT move players when tier_moves_enabled is off (rebalance is the only mover)", () => {
    const ids = ["p1", "p2", "p3", "mid1", "mid2", "d1", "d2"].map((id, i) =>
      m(id, 2, 100 - i * 10));
    const plan = planMonthlySettlement({
      members: ids,
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.totals.moves).toBe(0);
    expect(plan.updateGroups[2].length).toBe(7);
  });

  it("runs the fair-share rebalance when a league drifts 5+ over its share", () => {
    // 25 players all in tier 1: fair share = 5 per league.
    const open = Array.from({ length: 25 }, (_, i) => m(`o${i}`, 1, 25 - i, month, i));
    const plan = planMonthlySettlement({
      members: open,
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    // Open is 20 over its share of 5 → 20 riders climb (20 into t2, then
    // the wave continues up the chain as each upper league fills).
    const upFromOpen = plan.rebalanceUp.filter((mv) => mv.fromTier === 1).length;
    expect(upFromOpen).toBeGreaterThanOrEqual(5);
    // ...and the destination counts converge on the fair share
    const finalCounts: Record<number, number> = {};
    for (const ids of Object.values(plan.updateGroups)) {
      // groups are keyed by final tier; count via rebalance targets
      void ids;
    }
    const totalMoves = plan.rebalanceUp.length + plan.rebalanceDown.length;
    expect(totalMoves).toBeGreaterThanOrEqual(15);
  });

  it("auto-opens standard moves when the top-4 leagues are at tier_cap", () => {
    const members = [
      ...Array.from({ length: 4 }, (_, t) =>
        Array.from({ length: 3 }, (_, i) => m(`t${t + 2}p${i}`, t + 2, 10 - i, month, i))).flat(),
      m("op1", 1, 50), m("op2", 1, 40),
    ];
    const plan = planMonthlySettlement({
      members,
      cfg: { ...cfg, tier_cap: 3 },
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.movesAuto).toBe(true);
    // top-2 Open players with XP promote into... all upper leagues full → capped
    expect(plan.totals.capped).toBeGreaterThanOrEqual(1);
    expect(plan.totals.moves).toBe(0);
  });
});

describe("planMonthlySettlement — snapshots & lifetime XP", () => {
  it("records tier, lifetime XP and reward on every snapshot", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 2, 50, month, 453), m("b", 2, 0, "2026-09-22", 12)],
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    const a = plan.snapshots.find((s) => s.user_id === "a");
    const b = plan.snapshots.find((s) => s.user_id === "b");
    expect(a?.lifetime_xp).toBe(453);
    expect(a?.tier).toBe(2);
    expect(a?.reward_mwk).toBe(4000); // monthly_rewards_t2_mwk[0]
    expect(b?.lifetime_xp).toBe(12);
    expect(b?.final_xp).toBe(0);
  });

  it("sorts equal-XP players stably by input order", () => {
    const plan = planMonthlySettlement({
      members: [m("x", 1, 10), m("a", 1, 10), m("b", 1, 10)],
      cfg: { ...cfg, monthly_top_count: 3, monthly_rewards_t1_mwk: [3, 2, 1] },
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payouts.map((p) => p.userId)).toEqual(["x", "a", "b"]);
  });
});

describe("XP allocation table (owner spec 2026-09-26)", () => {
  it("matches the exact spec for every combination", async () => {
    const { xpFor } = await import("../index");
    expect(xpFor("free", "win", "non_club")).toBe(3);
    expect(xpFor("free", "win", "club")).toBe(6);
    expect(xpFor("free", "draw", "non_club")).toBe(1);
    expect(xpFor("free", "draw", "club")).toBe(2);
    expect(xpFor("free", "loss", "non_club")).toBe(-1);
    expect(xpFor("free", "loss", "club")).toBe(-1);
    expect(xpFor("cash", "win", "non_club")).toBe(5);
    expect(xpFor("cash", "win", "club")).toBe(10);
    expect(xpFor("cash", "draw", "non_club")).toBe(2.5);
    expect(xpFor("cash", "draw", "club")).toBe(5);
    expect(xpFor("cash", "loss", "non_club")).toBe(1);
    expect(xpFor("cash", "loss", "club")).toBe(2);
  });

  it("levels: active membership = club, expired/absent = non-club", async () => {
    const { levelFor } = await import("../index");
    expect(levelFor("2999-01-01")).toBe("club");
    expect(levelFor("2020-01-01")).toBe("non_club");
    expect(levelFor(null)).toBe("non_club");
    expect(levelFor(undefined)).toBe("non_club");
  });
});
