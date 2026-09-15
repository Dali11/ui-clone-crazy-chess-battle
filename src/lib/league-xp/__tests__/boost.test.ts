import { describe, it, expect } from "vitest";
import {
  referralBoostMultiplier,
  nextReferralTier,
  effectiveXpMultiplier,
  applyXpMultiplier,
  MEMBER_XP_MULTIPLIER,
} from "../boost";

const NOW = new Date("2026-09-15T08:00:00Z");

describe("referralBoostMultiplier — 1/5/10 tiers (owner spec 2026-09-15)", () => {
  it("no active referrals = no boost", () => {
    expect(referralBoostMultiplier(0)).toBe(1);
  });
  it("1-4 activated referrals = 1.25x", () => {
    expect(referralBoostMultiplier(1)).toBe(1.25);
    expect(referralBoostMultiplier(4)).toBe(1.25);
  });
  it("5-9 = 1.5x", () => {
    expect(referralBoostMultiplier(5)).toBe(1.5);
    expect(referralBoostMultiplier(9)).toBe(1.5);
  });
  it("10+ = 2x", () => {
    expect(referralBoostMultiplier(10)).toBe(2);
    expect(referralBoostMultiplier(42)).toBe(2);
  });
});

describe("nextReferralTier", () => {
  it("points at the next threshold", () => {
    expect(nextReferralTier(0)).toEqual({ count: 1, multiplier: 1.25 });
    expect(nextReferralTier(3)).toEqual({ count: 5, multiplier: 1.5 });
    expect(nextReferralTier(7)).toEqual({ count: 10, multiplier: 2 });
  });
  it("null when maxed", () => {
    expect(nextReferralTier(10)).toBeNull();
  });
});

describe("effectiveXpMultiplier — referral and member boosts never stack", () => {
  it("expired referral boost = 1", () => {
    expect(
      effectiveXpMultiplier({ boostMultiplier: 2, boostUntil: "2026-09-10T00:00:00Z", now: NOW })
    ).toBe(1);
  });
  it("member 1.5x while membership active", () => {
    expect(
      effectiveXpMultiplier({ membershipUntil: "2026-10-15T00:00:00Z", now: NOW })
    ).toBe(MEMBER_XP_MULTIPLIER);
  });
  it("lapsed membership = 1", () => {
    expect(
      effectiveXpMultiplier({ membershipUntil: "2026-09-01T00:00:00Z", now: NOW })
    ).toBe(1);
  });
  it("higher referral boost wins over member 1.5x", () => {
    expect(
      effectiveXpMultiplier({
        boostMultiplier: 2,
        boostUntil: "2026-09-20T00:00:00Z",
        membershipUntil: "2026-10-15T00:00:00Z",
        now: NOW,
      })
    ).toBe(2);
  });
  it("member 1.5x wins over smaller referral boost", () => {
    expect(
      effectiveXpMultiplier({
        boostMultiplier: 1.25,
        boostUntil: "2026-09-20T00:00:00Z",
        membershipUntil: "2026-10-15T00:00:00Z",
        now: NOW,
      })
    ).toBe(1.5);
  });
});

describe("applyXpMultiplier — losses never multiplied", () => {
  it("multiplies and rounds positive amounts", () => {
    expect(applyXpMultiplier(10, 1.25)).toBe(13); // 12.5 -> 13
    expect(applyXpMultiplier(10, 1.5)).toBe(15);
    expect(applyXpMultiplier(10, 2)).toBe(20);
    expect(applyXpMultiplier(3, 1.5)).toBe(5); // battle win 3 -> 4.5 -> 5
    expect(applyXpMultiplier(1, 1.25)).toBe(1); // battle draw 1 -> 1.25 -> 1
  });
  it("losses and zero pass through untouched", () => {
    expect(applyXpMultiplier(-1, 2)).toBe(-1);
    expect(applyXpMultiplier(0, 2)).toBe(0);
  });
});
