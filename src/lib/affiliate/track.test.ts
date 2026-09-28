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

// ─── attributeReferral (2026-09-28 hardening) ─────────────────────────────────

import { attributeReferral, type AttributionResult } from "./track";

/** Minimal fake Supabase admin client covering the calls attributeReferral makes. */
function fakeAdmin(opts: {
  profiles?: any[];   // rows returned by profile lookups
  referrals?: any[];  // existing referral rows for referred_id
  insertError?: any;  // error returned by referrals.insert
}) {
  const insertCalls: any[] = [];
  const admin: any = {
    from(table: string) {
      if (table === "profiles") {
        const chain = {
          select: () => chain, ilike: () => chain, limit: async () => ({ data: opts.profiles ?? null }),
        };
        return chain;
      }
      if (table === "referrals") {
        const chain = {
          select: () => chain, eq: () => chain, limit: async () => ({ data: opts.referrals ?? [] }),
          insert: async (row: any) => { insertCalls.push(row); return { error: opts.insertError ?? null }; },
        };
        return chain;
      }
      throw new Error("unexpected table " + table);
    },
  };
  return { admin, insertCalls };
}

describe("attributeReferral", () => {
  it("records a referral when the code resolves", async () => {
    const { admin, insertCalls } = fakeAdmin({ profiles: [{ id: OTHER, referral_code: "arthur", username: "arthur" }] });
    const r: AttributionResult = await attributeReferral(admin, "Arthur", UID);
    expect(r).toEqual({ settled: true, status: "inserted", attributed: true });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({ referrer_id: OTHER, referred_id: UID, status: "pending" });
  });

  it("settles as unknown when the code matches nobody", async () => {
    const { admin, insertCalls } = fakeAdmin({ profiles: [] });
    const r = await attributeReferral(admin, "ghost", UID);
    expect(r).toEqual({ settled: true, status: "unknown", attributed: false });
    expect(insertCalls).toHaveLength(0);
  });

  it("blocks self-referral", async () => {
    const { admin } = fakeAdmin({ profiles: [{ id: UID, referral_code: "me", username: "me" }] });
    const r = await attributeReferral(admin, "me", UID);
    expect(r).toEqual({ settled: true, status: "self", attributed: false });
  });

  it("is idempotent — existing referral means settled, no insert", async () => {
    const { admin, insertCalls } = fakeAdmin({
      profiles: [{ id: OTHER, referral_code: "arthur", username: "arthur" }],
      referrals: [{ id: "ref-1" }],
    });
    const r = await attributeReferral(admin, "arthur", UID);
    expect(r).toEqual({ settled: true, status: "already", attributed: true });
    expect(insertCalls).toHaveLength(0);
  });

  it("treats a unique-violation race as settled (the twin request won)", async () => {
    const { admin } = fakeAdmin({
      profiles: [{ id: OTHER, referral_code: "arthur", username: "arthur" }],
      insertError: { code: "23505" },
    });
    const r = await attributeReferral(admin, "arthur", UID);
    expect(r).toEqual({ settled: true, status: "already", attributed: true });
  });

  it("returns unsettled on a transient insert failure (caller may retry)", async () => {
    const { admin } = fakeAdmin({
      profiles: [{ id: OTHER, referral_code: "arthur", username: "arthur" }],
      insertError: { code: "PGRST-500", message: "boom" },
    });
    const r = await attributeReferral(admin, "arthur", UID);
    expect(r.settled).toBe(false);
    expect(r.attributed).toBe(false);
  });

  it("settles invalid input without touching the DB", async () => {
    const { admin, insertCalls } = fakeAdmin({ profiles: [] });
    expect(await attributeReferral(admin, "", UID)).toEqual({ settled: true, status: "invalid", attributed: false });
    expect(await attributeReferral(admin, "x", null)).toEqual({ settled: true, status: "invalid", attributed: false });
    expect(insertCalls).toHaveLength(0);
  });
});
