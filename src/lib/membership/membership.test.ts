import { describe, it, expect } from "vitest";
import { isMember, extendMembership, daysRemaining, MEMBERSHIP_DAYS } from "./membership";

const NOW = "2026-09-12T10:00:00.000Z";

describe("isMember", () => {
  it("null/undefined/empty = not a member", () => {
    expect(isMember(null, NOW)).toBe(false);
    expect(isMember(undefined, NOW)).toBe(false);
    expect(isMember("", NOW)).toBe(false);
  });

  it("future date = member", () => {
    expect(isMember("2026-10-12T10:00:00.000Z", NOW)).toBe(true);
  });

  it("past date = not a member (lazy expiry)", () => {
    expect(isMember("2026-09-11T10:00:00.000Z", NOW)).toBe(false);
    expect(isMember(NOW, NOW)).toBe(false); // exact boundary = lapsed
  });
});

describe("extendMembership", () => {
  it("fresh purchase starts now + period", () => {
    expect(extendMembership(null, NOW, 30)).toBe("2026-10-12T10:00:00.000Z");
  });

  it("renewal while active stacks from current expiry (no lost days)", () => {
    const until = "2026-09-25T08:00:00.000Z"; // 13 days left
    expect(extendMembership(until, NOW, 30)).toBe("2026-10-25T08:00:00.000Z");
  });

  it("renewal after expiry restarts from now", () => {
    const until = "2026-09-01T00:00:00.000Z"; // lapsed 11 days ago
    expect(extendMembership(until, NOW, 30)).toBe("2026-10-12T10:00:00.000Z");
  });

  it("default period is 30 days", () => {
    expect(extendMembership(null, NOW)).toBe(extendMembership(null, NOW, MEMBERSHIP_DAYS));
  });
});

describe("daysRemaining", () => {
  it("0 when null or lapsed", () => {
    expect(daysRemaining(null, NOW)).toBe(0);
    expect(daysRemaining("2026-09-01T00:00:00.000Z", NOW)).toBe(0);
  });

  it("ceil of remaining days", () => {
    expect(daysRemaining("2026-09-13T10:00:01.000Z", NOW)).toBe(2); // 1 day + 1 second
    expect(daysRemaining("2026-09-12T10:00:00.001Z", NOW)).toBe(1);
  });
});
