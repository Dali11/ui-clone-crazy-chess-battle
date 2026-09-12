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
