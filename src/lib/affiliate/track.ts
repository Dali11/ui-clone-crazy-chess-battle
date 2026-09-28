/**
 * Affiliate referral tracking — pure helpers (unit-tested).
 *
 * A referral is captured ONCE per referred player at signup: the referrer's
 * code (their referral_code or username) is resolved by the track route,
 * and the referrals row sits at status 'pending' until the referred player
 * buys membership — which pays the referrer 25% via the
 * process_affiliate_commission RPC (gated by the affiliate config switch).
 */

/** Normalize a referral code for lookup (trim + lowercase). */
export function normalizeRefCode(code: string | null | undefined): string {
  return (code || "").trim().toLowerCase();
}

/** Route-level validation result for /api/affiliate/track. */
export interface TrackCheck {
  ok: boolean;
  error?: string;
}

/**
 * Validate a track request. DB-free checks only — existence, self-referral
 * and duplicate checks happen in the route against the database.
 */
export function validateTrackRequest(
  referrerCode: string | null | undefined,
  referredId: string | null | undefined,
  authedUserId: string | null | undefined
): TrackCheck {
  if (!normalizeRefCode(referrerCode)) {
    return { ok: false, error: "No referral code provided" };
  }
  if (!referredId) {
    return { ok: false, error: "Missing referred user" };
  }
  // The referred player must be the caller — nobody tracks on behalf of others
  if (!authedUserId || authedUserId !== referredId) {
    return { ok: false, error: "Unauthorized" };
  }
  return { ok: true };
}

/** Should a (possibly existing) referral row block creating a new one? */
export function isAlreadyReferred(existingRow: { referrer_id: string } | null | undefined): boolean {
  return !!existingRow;
}

// ─── Server-side attribution (2026-09-28 hardening) ──────────────────────────
//
// Attribution used to be client-only: signup-client POSTed /api/affiliate/track
// right after signup and cleared the stored code no matter what — so a network
// blip, privacy blocker or 5xx permanently lost the referral with no server
// trace. Now a shared, idempotent function runs the attribution server-side
// (called from both /api/affiliate/track and /api/auth/set-rating — the signup
// completion call, which is the first credit-able moment with a verified
// session), and logs every outcome so partner campaigns can be reconciled
// from server logs even if an insert fails.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AttributionStatus =
  | "inserted" // referral row created
  | "already" // this player is already referred (or a race lost to a twin request)
  | "unknown" // code matched no profile
  | "self" // self-referral blocked
  | "invalid" // empty/missing code — nothing to do
  | "error"; // transient failure — CALLER MAY RETRY

export interface AttributionResult {
  /** true = definitive outcome, no retry needed (even if nothing was inserted) */
  settled: boolean;
  status: AttributionStatus;
  /** true only when the referred player now has a referral row */
  attributed: boolean;
}

/**
 * Resolve a referral code and record the referral for `referredId`.
 * Idempotent: one referral per referred player, first successful insert wins.
 * Never throws — check `status` instead.
 */
export async function attributeReferral(
  admin: SupabaseClient,
  referrerCode: string | null | undefined,
  referredId: string | null | undefined
): Promise<AttributionResult> {
  const code = normalizeRefCode(referrerCode);
  if (!code || !referredId) {
    console.log(`[affiliate] attribution invalid input referred=${referredId || "?"}`);
    return { settled: true, status: "invalid", attributed: false };
  }

  try {
    // Resolve referrer by referral code, falling back to username (links may
    // be built from either). Case-insensitive match, exact-case hit preferred.
    let ref: { id: string } | null = null;

    const { data: byCode } = await admin
      .from("profiles")
      .select("id, referral_code, username")
      .ilike("referral_code", code)
      .limit(5);
    ref = (byCode?.find((c: any) => c.referral_code === code) ?? byCode?.[0]) || null;

    if (!ref) {
      const { data: byUsername } = await admin
        .from("profiles")
        .select("id, referral_code, username")
        .ilike("username", code)
        .limit(5);
      ref = (byUsername?.find((c: any) => c.username === code) ?? byUsername?.[0]) || null;
    }

    if (!ref) {
      console.log(`[affiliate] unknown code=${code} referred=${referredId}`);
      return { settled: true, status: "unknown", attributed: false };
    }
    if (ref.id === referredId) {
      console.log(`[affiliate] self-referral blocked code=${code} user=${referredId}`);
      return { settled: true, status: "self", attributed: false };
    }

    // One referral per referred player — a second signup link changes nothing.
    // (Also enforced at the DB level by a unique index on referred_id.)
    const { data: existing } = await admin
      .from("referrals")
      .select("id")
      .eq("referred_id", referredId)
      .limit(1);
    if (existing && existing.length > 0) {
      console.log(`[affiliate] already referred=${referredId} code=${code}`);
      return { settled: true, status: "already", attributed: true };
    }

    const { error: insertError } = await admin.from("referrals").insert({
      referrer_id: ref.id,
      referred_id: referredId,
      referral_code: code,
      status: "pending",
      berries_awarded: 0,
    });
    if (insertError) {
      // Race: another request for the same referred_id won by a hair.
      if (insertError.code === "23505") {
        console.log(`[affiliate] race dup referred=${referredId} code=${code}`);
        return { settled: true, status: "already", attributed: true };
      }
      console.error(`[affiliate] insert failed code=${code} referred=${referredId}`, insertError);
      return { settled: false, status: "error", attributed: false };
    }

    console.log(`[affiliate] tracked code=${code} referrer=${ref.id} referred=${referredId}`);
    return { settled: true, status: "inserted", attributed: true };
  } catch (e) {
    console.error(`[affiliate] attribution error code=${code} referred=${referredId}`, e);
    return { settled: false, status: "error", attributed: false };
  }
}
