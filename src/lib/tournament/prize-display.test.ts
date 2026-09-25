import { describe, it, expect } from "vitest";
import { shouldShowPrizeDistribution, prizePayoutAmount } from "./prize-display";

const swiss = { type: "percentage" as const, payouts: [
  { rank: 1, percentage: 40 }, { rank: 2, percentage: 20 }, { rank: 3, percentage: 18 },
  { rank: 4, percentage: 12 }, { rank: 5, percentage: 10 },
] };
const knockout = { type: "percentage" as const, payouts: [
  { rank: 1, percentage: 50 }, { rank: 2, percentage: 25 }, { rank: 3, percentage: 15 }, { rank: 4, percentage: 10 },
] };

describe("shouldShowPrizeDistribution (owner rule: number-5 payout must exceed entry price)", () => {
  it("hides while the 5th payout is below the entry fee", () => {
    // 10% of MWK 1,000 pool = 100 <= entry 200 -> hidden
    expect(shouldShowPrizeDistribution(swiss, 1000, 200)).toBe(false);
  });

  it("shows once the 5th payout exceeds the entry fee", () => {
    // 10% of 3,000 = 300 > 200 -> shown
    expect(shouldShowPrizeDistribution(swiss, 3000, 200)).toBe(true);
  });

  it("never shows with an empty pool (percentage distributions)", () => {
    expect(shouldShowPrizeDistribution(swiss, 0, 0)).toBe(false);
  });

  it("uses the lowest rank for knockout distributions (no rank 5)", () => {
    // 4th = 10% of pool; 100 <= 200 hidden, 300 > 200 shown
    expect(shouldShowPrizeDistribution(knockout, 1000, 200)).toBe(false);
    expect(shouldShowPrizeDistribution(knockout, 3000, 200)).toBe(true);
  });

  it("flat distributions compare the rank amount to the entry fee", () => {
    const flat = { type: "flat" as const, payouts: [{ rank: 5, amount: 150 }] };
    expect(shouldShowPrizeDistribution(flat, 0, 100)).toBe(true);
    expect(shouldShowPrizeDistribution(flat, 0, 200)).toBe(false);
  });

  it("free entry: any positive 5th payout shows the card", () => {
    expect(shouldShowPrizeDistribution(swiss, 500, 0)).toBe(true);
  });

  it("null/empty distributions never show", () => {
    expect(shouldShowPrizeDistribution(null, 5000, 100)).toBe(false);
    expect(shouldShowPrizeDistribution({ type: "percentage", payouts: [] }, 5000, 100)).toBe(false);
  });
});

describe("prizePayoutAmount", () => {
  it("floors percentage amounts like the card UI", () => {
    expect(prizePayoutAmount(swiss, 1234, 5)).toBe(123);
  });
  it("returns 0 for a missing rank", () => {
    expect(prizePayoutAmount(knockout, 1000, 5)).toBe(0);
  });
});
