import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  calcPayout,
  formatMKK,
  isArmageddonTime,
  type BattleConfig,
} from "@/lib/battles/battle-helpers";

describe("Battle Helpers — payout calculation", () => {
  it("calculates correct pot, fee, and payout for MK500 stake", () => {
    const result = calcPayout(500, 5);
    expect(result.pot).toBe(1000);       // 500 * 2
    expect(result.fee).toBe(50);          // 1000 * 5%
    expect(result.payout).toBe(950);      // 1000 - 50
  });

  it("calculates correct payout for MK10,000 stake", () => {
    const result = calcPayout(10000, 5);
    expect(result.pot).toBe(20000);
    expect(result.fee).toBe(1000);
    expect(result.payout).toBe(19000);
  });

  it("handles 0% platform fee", () => {
    const result = calcPayout(5000, 0);
    expect(result.pot).toBe(10000);
    expect(result.fee).toBe(0);
    expect(result.payout).toBe(10000);
  });

  it("handles 100% platform fee (edge case)", () => {
    const result = calcPayout(1000, 100);
    expect(result.pot).toBe(2000);
    expect(result.fee).toBe(2000);
    expect(result.payout).toBe(0);
  });

  it("rounds fee to nearest integer", () => {
    // 333 * 2 = 666, 666 * 7% = 46.62 → rounds to 47
    const result = calcPayout(333, 7);
    expect(result.fee).toBe(47);
    expect(result.payout).toBe(619);
  });

  // Owner decision 2026-09-15: with a non-zero rate, the platform's take
  // can never round down to 0 — floor at 1 MWK. An explicit 0% rate
  // still yields exactly 0 (deliberate admin promo, not a rounding bug).
  describe("fee floor — platform take never rounds to 0 (owner decision 2026-09-15)", () => {
    it("tiny stake with a real fee rate floors at 1 MWK instead of rounding to 0", () => {
      // pot=4, 10% of 4 = 0.4 -> would round to 0 without the floor
      const result = calcPayout(2, 10);
      expect(result.fee).toBe(1);
      expect(result.payout).toBe(3);
    });
    it("very low fee rate on a small pot still floors at 1 MWK", () => {
      // pot=10, 1% of 10 = 0.1 -> would round to 0 without the floor
      const result = calcPayout(5, 1);
      expect(result.fee).toBe(1);
      expect(result.payout).toBe(9);
    });
    it("explicit 0% fee rate stays exactly 0 (deliberate promo, not a rounding artifact)", () => {
      const result = calcPayout(2, 0);
      expect(result.fee).toBe(0);
      expect(result.payout).toBe(4);
    });
    it("zero stake never charges a fee", () => {
      const result = calcPayout(0, 10);
      expect(result.fee).toBe(0);
      expect(result.payout).toBe(0);
    });
    it("normal-size stakes are unaffected by the floor (already well above 1 MWK)", () => {
      const result = calcPayout(500, 10);
      expect(result.fee).toBe(100);
      expect(result.payout).toBe(900);
    });
  });
});

describe("Battle Helpers — default config", () => {
  it("has 5 stake levels", () => {
    expect(DEFAULT_CONFIG.stake_levels).toHaveLength(5);
    expect(DEFAULT_CONFIG.stake_levels[0]).toBe(500);
    expect(DEFAULT_CONFIG.stake_levels[4]).toBe(10000);
  });

  it("has 5% platform fee", () => {
    expect(DEFAULT_CONFIG.platform_fee_pct).toBe(5);
  });

  it("has 200 rating range for matchmaking", () => {
    expect(DEFAULT_CONFIG.rating_range).toBe(200);
  });

  it("requires minimum 5 games before battles", () => {
    expect(DEFAULT_CONFIG.min_games_for_battles).toBe(5);
  });

  it("armageddon at 50% time with max 3 rounds", () => {
    expect(DEFAULT_CONFIG.armageddon_pct).toBe(50);
    expect(DEFAULT_CONFIG.max_armageddon_rounds).toBe(3);
  });
});

describe("Battle Helpers — armageddon time", () => {
  it("calculates 50% of base minutes", () => {
    expect(isArmageddonTime(5, 50)).toBe(3);  // 5 * 50% = 2.5 → rounds to 3
  });

  it("calculates 25% of base minutes", () => {
    expect(isArmageddonTime(10, 25)).toBe(3); // 10 * 25% = 2.5 → rounds to 3
  });

  it("enforces minimum 1 minute", () => {
    expect(isArmageddonTime(1, 10)).toBe(1);  // 0.1 → max(1, 0) = 1
  });
});

describe("Battle Helpers — formatMKK", () => {
  it("formats integer amounts with MK prefix", () => {
    expect(formatMKK(500)).toBe("MK 500");
    expect(formatMKK(10000)).toBe("MK 10,000");
  });

  it("floors decimal amounts", () => {
    expect(formatMKK(999.99)).toBe("MK 999");
  });

  it("handles zero", () => {
    expect(formatMKK(0)).toBe("MK 0");
  });

  it("handles large amounts", () => {
    expect(formatMKK(1000000)).toBe("MK 1,000,000");
  });
});
