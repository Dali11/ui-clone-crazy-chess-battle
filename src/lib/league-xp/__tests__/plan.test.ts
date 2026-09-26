import { describe, expect, it } from "vitest";
import { planMonthlySettlement } from "../plan";
import type { LeagueXpConfig } from "../index";

/**
 * Monthly settlement planner tests (owner redesign 2026-09-26):
 * one cycle, one leaderboard, top-N payouts, monthly reset,
 * lifetime XP untouched by the settle.
 */

const cfg: LeagueXpConfig = {
  enabled: true,
  daily_xp_cap: 100,
  rewards_enabled: true,
  monthly_rewards_enabled: true,
  monthly_top_count: 3,
  reward_1_mwk: 2000,
  reward_2_mwk: 1000,
  reward_3_mwk: 500,
  reward_4_mwk: 250,
  reward_5_mwk: 125,
  monthly_rewards_t1_mwk: [5000, 3000, 1000],
};

const month = "2026-09-01";
const nextMonth = "2026-10-01";

function m(user_id: string, xp: number, cycle: string = month, lifetime = 0) {
  return { user_id, xp, cycle_start: cycle, lifetime_xp: lifetime, display_name: user_id };
}

describe("planMonthlySettlement", () => {
  it("ranks active players by monthly XP and pays the configured top N", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 50), m("b", 80), m("c", 10), m("d", 99)],
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payOn).toBe(true);
    expect(plan.payouts.map((p) => p.userId)).toEqual(["d", "b", "a"]);
    expect(plan.payouts.map((p) => p.rewardMwk)).toEqual([5000, 3000, 1000]);
  });

  it("ranks stale (inactive) members last, never pays them", () => {
    const plan = planMonthlySettlement({
      // stale member holds last week's key and a big XP number
      members: [m("stale", 999, "2026-09-22"), m("fresh", 5)],
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payouts.length).toBe(1);
    expect(plan.payouts[0].userId).toBe("fresh");
    // stale row still gets a snapshot (with 0 XP for the cycle)
    const snap = plan.snapshots.find((s) => s.user_id === "stale");
    expect(snap?.final_xp).toBe(0);
    expect(snap?.final_rank).toBe(2);
  });

  it("skips zero/negative-XP players in payouts but still resets them", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 0), m("b", -3)],
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payouts.length).toBe(0);
    expect(plan.resetUserIds).toEqual(["a", "b"]);
  });

  it("gates payouts on rewards_enabled", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 50)],
      cfg: { ...cfg, rewards_enabled: false },
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payOn).toBe(false);
    expect(plan.unpaidReason).toBe("rewards_enabled is off");
    expect(plan.payouts.length).toBe(0);
    // resets still happen — the board keeps running
    expect(plan.resetUserIds).toEqual(["a"]);
  });

  it("gates payouts on the admin monthly kill-switch", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 50)],
      cfg: { ...cfg, monthly_rewards_enabled: false },
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payOn).toBe(false);
    expect(plan.unpaidReason).toBe("monthly payouts paused by admin");
  });

  it("gates payouts on the payouts_start date (cycle granularity)", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 50)],
      cfg: { ...cfg, payouts_start: "2026-10-01" },
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payOn).toBe(false);
    expect(plan.unpaidReason).toContain("payouts_start");
    // the first eligible month pays
    const ok = planMonthlySettlement({
      members: [m("a", 50)],
      cfg: { ...cfg, payouts_start: "2026-10-01" },
      closingMonth: nextMonth,
      newMonth: "2026-11-01",
    });
    expect(ok.payOn).toBe(true);
  });

  it("falls back to the legacy flat rewards when no monthly array is set", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 50)],
      cfg: { ...cfg, monthly_rewards_t1_mwk: undefined },
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payouts[0].rewardMwk).toBe(2000);
  });

  it("caps payouts at monthly_top_count even with more players", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 50), m("b", 40), m("c", 30), m("d", 20)],
      cfg: { ...cfg, monthly_top_count: 2 },
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payouts.length).toBe(2);
  });

  it("records lifetime XP on every snapshot and never resets it", () => {
    const plan = planMonthlySettlement({
      members: [m("a", 50, month, 453), m("b", 0, "2026-09-22", 12)],
      cfg,
      closingMonth: month,
      newMonth: nextMonth,
    });
    const a = plan.snapshots.find((s) => s.user_id === "a");
    const b = plan.snapshots.find((s) => s.user_id === "b");
    expect(a?.lifetime_xp).toBe(453);
    expect(b?.lifetime_xp).toBe(12);
  });

  it("sorts equal-XP players stably by input order", () => {
    const plan = planMonthlySettlement({
      members: [m("x", 10), m("a", 10), m("b", 10)],
      cfg: { ...cfg, monthly_top_count: 3, monthly_rewards_t1_mwk: [3, 2, 1] },
      closingMonth: month,
      newMonth: nextMonth,
    });
    expect(plan.payouts.map((p) => p.userId)).toEqual(["x", "a", "b"]);
  });
});

describe("XP allocation table (owner spec 2026-09-26)", () => {
  it("matches the exact spec for every combination", async () => {
    const { xpFor, levelFor } = await import("../index");
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
