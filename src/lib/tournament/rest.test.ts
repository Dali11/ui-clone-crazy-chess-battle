import { describe, expect, it } from "vitest";
import { clampRestMinutes, derivedRestMinutes, getRestMinutes, MAX_REST_MINUTES, MIN_REST_MINUTES } from "./rest";

describe("derivedRestMinutes", () => {
  it("scales rest with thinking time", () => {
    expect(derivedRestMinutes(1)).toBe(1);   // bullet
    expect(derivedRestMinutes(3)).toBe(2);  // blitz 3+2
    expect(derivedRestMinutes(5)).toBe(2);  // blitz 5+0
    expect(derivedRestMinutes(10)).toBe(3); // rapid 10+0
    expect(derivedRestMinutes(15)).toBe(3); // rapid 15+10
    expect(derivedRestMinutes(30)).toBe(5); // classical
  });

  it("is robust to junk input", () => {
    expect(derivedRestMinutes(null)).toBe(1);
    expect(derivedRestMinutes(undefined)).toBe(1);
    expect(derivedRestMinutes(0)).toBe(1);
    expect(derivedRestMinutes("abc")).toBe(1);
  });
});

describe("clampRestMinutes", () => {
  it("accepts explicit values in range", () => {
    expect(clampRestMinutes(2)).toBe(2);
    expect(clampRestMinutes(10)).toBe(10);
    expect(clampRestMinutes(30)).toBe(30);
  });

  it("clamps out-of-range and rejects junk", () => {
    expect(clampRestMinutes(0)).toBeNull();
    expect(clampRestMinutes(-5)).toBeNull();
    expect(clampRestMinutes(99)).toBe(MAX_REST_MINUTES);
    expect(clampRestMinutes(0.4)).toBe(MIN_REST_MINUTES);
    expect(clampRestMinutes(2.6)).toBe(3); // rounds to nearest
    expect(clampRestMinutes("nope")).toBeNull();
    expect(clampRestMinutes(null)).toBeNull();
  });
});

describe("getRestMinutes", () => {
  it("explicit rest_minutes wins over derivation", () => {
    expect(getRestMinutes({ rest_minutes: 7, initial_minutes: 30 })).toBe(7);
    expect(getRestMinutes({ rest_minutes: 1, initial_minutes: 1 })).toBe(1);
  });

  it("falls back to time-control derivation when unset/invalid", () => {
    expect(getRestMinutes({ rest_minutes: null, initial_minutes: 5 })).toBe(2);
    expect(getRestMinutes({ rest_minutes: 0, initial_minutes: 10 })).toBe(3);
    expect(getRestMinutes({ rest_minutes: "x", initial_minutes: 30 })).toBe(5);
  });

  it("survives a bare tournament object (legacy default: 1)", () => {
    expect(getRestMinutes({})).toBe(1);
  });
});
