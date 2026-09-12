import { describe, it, expect } from "vitest";
import { normalizeRefCode, validateTrackRequest, isAlreadyReferred } from "./track";

const UID = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("normalizeRefCode", () => {
  it("trims and lowercases", () => {
    expect(normalizeRefCode("  Arthur  ")).toBe("arthur");
  });
  it("handles null/undefined/empty", () => {
    expect(normalizeRefCode(null)).toBe("");
    expect(normalizeRefCode(undefined)).toBe("");
    expect(normalizeRefCode("   ")).toBe("");
  });
});

describe("validateTrackRequest", () => {
  it("accepts a valid request", () => {
    expect(validateTrackRequest("arthur", UID, UID).ok).toBe(true);
  });
  it("rejects a missing referral code", () => {
    const r = validateTrackRequest("", UID, UID);
    expect(r.ok).toBe(false);
  });
  it("rejects a missing referred id", () => {
    const r = validateTrackRequest("arthur", null, null);
    expect(r.ok).toBe(false);
  });
  it("rejects when the caller is not the referred player", () => {
    const r = validateTrackRequest("arthur", UID, OTHER);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Unauthorized");
  });
  it("rejects unauthenticated callers", () => {
    const r = validateTrackRequest("arthur", UID, null);
    expect(r.ok).toBe(false);
  });
});

describe("isAlreadyReferred", () => {
  it("blocks when an existing referral row is present", () => {
    expect(isAlreadyReferred({ referrer_id: OTHER })).toBe(true);
  });
  it("allows when no row exists", () => {
    expect(isAlreadyReferred(null)).toBe(false);
    expect(isAlreadyReferred(undefined)).toBe(false);
  });
});
