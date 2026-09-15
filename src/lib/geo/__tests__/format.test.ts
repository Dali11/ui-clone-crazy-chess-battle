import { describe, expect, it } from "vitest";
import { rewardFractionDigits, roundRewardAmount } from "../format";

describe("roundRewardAmount — clean reward ticks by magnitude", () => {
  // Real week-2-close figures at the cached 2026-09-15 rates.
  // USD (0.000573): small prizes must NOT collapse to 0.
  it("keeps sub-unit USD amounts cent-exact instead of zeroing them", () => {
    expect(roundRewardAmount(500 * 0.000573)).toBeCloseTo(0.2865, 5); // cent-exact
    expect(roundRewardAmount(125 * 0.000573)).toBeCloseTo(0.0716, 4);
  });

  it("rounds whole-unit-scale amounts to the nearest 0.25 tick", () => {
    expect(roundRewardAmount(7500 * 0.000573)).toBe(4.25); // $4.30 -> $4.25
    expect(roundRewardAmount(4000 * 0.000573)).toBe(2.25); // $2.29 -> $2.25
    expect(roundRewardAmount(2000 * 0.000573)).toBe(1.25); // $1.15 -> $1.25
  });

  it("rounds ZAR-scale amounts to the nearest 5 above 20, nearest 1 above 5", () => {
    expect(roundRewardAmount(7500 * 0.009139)).toBe(70); // R68.5 -> R70
    expect(roundRewardAmount(4000 * 0.009139)).toBe(35); // R36.6 -> R35
    expect(roundRewardAmount(2000 * 0.009139)).toBe(18); // R18.3 -> R18
    expect(roundRewardAmount(1000 * 0.009139)).toBe(9); // R9.1 -> R9
  });

  it("leaves already-round KES figures untouched", () => {
    expect(roundRewardAmount(7500 * 0.074016)).toBe(555); // KSh 555
    expect(roundRewardAmount(4000 * 0.074016)).toBe(295); // KSh 296 -> 295
    expect(roundRewardAmount(1000 * 0.074016)).toBe(75); // KSh 74 -> 75
  });

  it("handles zero, negative and already-integer values", () => {
    expect(roundRewardAmount(0)).toBe(0);
    expect(roundRewardAmount(-5)).toBe(0);
    expect(roundRewardAmount(100)).toBe(100);
    expect(roundRewardAmount(7)).toBe(7);
  });
});

describe("rewardFractionDigits", () => {
  it("uses 2 decimals below 5 and none at or above", () => {
    expect(rewardFractionDigits(4.25)).toBe(2);
    expect(rewardFractionDigits(0.29)).toBe(2);
    expect(rewardFractionDigits(5)).toBe(0);
    expect(rewardFractionDigits(70)).toBe(0);
  });
});
