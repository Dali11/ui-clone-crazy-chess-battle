import { describe, expect, it } from "vitest";
import { makeUsdConverter, roundUsd } from "./usd";
import {
  battleRakeUnits,
  bucketRange,
  bucketKey,
  changePct,
  chooseGranularity,
  computePeriod,
  depositStatus,
  normalizeCountry,
  walletCurrencyForCountry,
  withdrawalStatus,
} from "./commandcentre";

describe("makeUsdConverter", () => {
  // Realistic rates: 1 MWK ≈ 0.00058 USD ≈ 0.05 KES
  const fx = makeUsdConverter(0.00058, { KES: 0.05, ZMW: 0.00035, USD: 0.00058 });

  it("converts MWK-normalized deposits rows to USD", () => {
    expect(fx.usdFromMwk(100_000)).toBeCloseTo(58, 0);
  });

  it("converts wallet-currency amounts via the cross rate", () => {
    // 5,000 KES → MWK (5,000 / 0.05 = 100,000) → USD ≈ 58
    expect(fx.toUsd(5_000, "KES")).toBeCloseTo(58, 0);
  });

  it("passes USD through untouched", () => {
    expect(fx.toUsd(12.5, "USD")).toBe(12.5);
  });

  it("treats missing currency as MWK (platform default)", () => {
    expect(fx.toUsd(100_000, null)).toBeCloseTo(58, 0);
  });

  it("returns null and records the currency when no rate exists", () => {
    const out = fx.toUsd(100, "XYZ");
    expect(out).toBeNull();
    expect(fx.unavailable.has("XYZ")).toBe(true);
  });

  it("degrades to null when MWK→USD is unavailable", () => {
    const broken = makeUsdConverter(0, { KES: 0.05 });
    expect(broken.usdFromMwk(1_000)).toBeNull();
    expect(broken.toUsd(1_000, "KES")).toBeNull();
  });

  it("toUsdOrZero floors unavailable conversions to zero", () => {
    expect(fx.toUsdOrZero(10, "XYZ")).toBe(0);
  });

  it("roundUsd rounds to 2 decimals", () => {
    expect(roundUsd(0.00058 * 172_414)).toBeCloseTo(100.0, 1);
    expect(roundUsd(12.3456)).toBe(12.35);
    expect(roundUsd(12.344)).toBe(12.34);
  });
});

describe("computePeriod", () => {
  const now = new Date("2026-09-16T14:30:00Z");

  it("today = the UTC day containing now", () => {
    const p = computePeriod("today", null, null, now);
    expect(p.fromISO).toBe("2026-09-16T00:00:00.000Z");
    expect(p.toISO).toBe("2026-09-17T00:00:00.000Z");
    expect(p.prevFromISO).toBe("2026-09-15T00:00:00.000Z");
  });

  it("30d window is exactly 30 days with an equal-length previous window", () => {
    const p = computePeriod("30d", null, null, now);
    expect(Date.parse(p.toISO) - Date.parse(p.fromISO)).toBe(30 * 86_400_000);
    expect(Date.parse(p.fromISO) - Date.parse(p.prevFromISO)).toBe(30 * 86_400_000);
  });

  it("12m spans 365 days", () => {
    const p = computePeriod("12m", null, null, now);
    expect(Date.parse(p.toISO) - Date.parse(p.fromISO)).toBe(365 * 86_400_000);
  });

  it("custom uses provided dates and guards reversed input", () => {
    // "to" date is INCLUSIVE — the window runs to the end of that day.
    const p = computePeriod("custom", "2026-01-01", "2026-02-01", now);
    expect(p.fromISO).toBe("2026-01-01T00:00:00.000Z");
    expect(p.toISO).toBe("2026-02-02T00:00:00.000Z");
    expect(p.prevFromISO).toBe("2025-11-30T00:00:00.000Z"); // 32-day window mirrored

    const bad = computePeriod("custom", "2026-02-01", "2026-01-01", now);
    expect(Date.parse(bad.toISO)).toBeGreaterThan(Date.parse(bad.fromISO));
  });

  it("invalid preset falls back to 30d", () => {
    const p = computePeriod("nonsense" as any, null, null, now);
    expect(Date.parse(p.toISO) - Date.parse(p.fromISO)).toBe(30 * 86_400_000);
  });
});

describe("changePct", () => {
  it("computes standard percent change", () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(50, 100)).toBe(-50);
  });
  it("returns null without a baseline", () => {
    expect(changePct(10, 0)).toBeNull();
  });
  it("zero vs zero is a flat 0", () => {
    expect(changePct(0, 0)).toBe(0);
  });
});

describe("status normalization", () => {
  it("maps deposit statuses", () => {
    expect(depositStatus("success")).toBe("completed");
    expect(depositStatus("pending")).toBe("pending");
    expect(depositStatus("failed")).toBe("failed");
    expect(depositStatus("cancelled")).toBe("cancelled");
    expect(depositStatus(null)).toBe("cancelled");
  });
  it("maps withdrawal statuses (approved is still pending work)", () => {
    expect(withdrawalStatus("completed")).toBe("completed");
    expect(withdrawalStatus("pending")).toBe("pending");
    expect(withdrawalStatus("approved")).toBe("pending");
    expect(withdrawalStatus("failed")).toBe("failed");
    expect(withdrawalStatus("rejected")).toBe("failed");
  });
});

describe("bucketing", () => {
  it("chooses day granularity under 120 days, month beyond", () => {
    expect(chooseGranularity(0, 120 * 86_400_000)).toBe("day");
    expect(chooseGranularity(0, 121 * 86_400_000)).toBe("month");
  });
  it("bucketRange covers the window with no gaps (daily)", () => {
    const keys = bucketRange("2026-09-10T00:00:00Z", "2026-09-13T00:00:00Z", "day");
    expect(keys).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
  });
  it("bucketRange covers the window with no gaps (monthly)", () => {
    const keys = bucketRange("2025-08-15T00:00:00Z", "2026-02-01T00:00:00Z", "month");
    expect(keys).toEqual(["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"]);
    expect(bucketKey("2026-01-20T10:00:00Z", "month")).toBe("2026-01");
  });
});

describe("battleRakeUnits", () => {
  it("pot minus winner payout, floored at zero (matches sweep.ts)", () => {
    expect(battleRakeUnits({ pot: 2000, winner_payout: 1800 })).toBe(200);
    expect(battleRakeUnits({ pot: 2000, winner_payout: 2500 })).toBe(0); // floored refund safety
    expect(battleRakeUnits({ stake: 500, winner_payout: null })).toBe(1000);
  });
});

describe("country helpers", () => {
  it("normalizes and rejects OTHER/blank", () => {
    expect(normalizeCountry(" mw ")).toBe("MW");
    expect(normalizeCountry("OTHER")).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
  });
  it("resolves wallet currency with MWK fallback", () => {
    expect(walletCurrencyForCountry("KE", { KE: "KES", MW: "MWK" })).toBe("KES");
    expect(walletCurrencyForCountry(null, { KE: "KES", MW: "MWK" })).toBe("MWK");
  });
});

describe("production sign conventions", () => {
  it("ad purchases are wallet-debit NEGATIVE — revenue is the magnitude", () => {
    // Confirmed live 2026-09-16: ad_purchase rows store -amount
    const adRow = { method: "ad_purchase", status: "success", amount: -5000 };
    const usdPerMwk = 0.00058;
    const revenueUsd = Math.abs(Number(adRow.amount)) * usdPerMwk;
    expect(revenueUsd).toBeCloseTo(2.9, 1);
    expect(revenueUsd).toBeGreaterThan(0);
  });
});
