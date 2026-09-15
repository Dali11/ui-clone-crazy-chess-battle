/**
 * XP boost math (owner decision 2026-09-15) — pure, unit-tested.
 *
 * Two independent boost sources, NEVER stacked (the higher one wins):
 *  - Referral boost: a player who referred N ACTIVATED players in the
 *    last 7 days earns a multiplier for a week — 1.25x (1), 1.5x (5), 2x (10).
 *    Activated = the referral genuinely engaged (staked battle, tournament,
 *    wallet top-up, 10 quick matches, 3 games, or bought membership) —
 *    the same activation the affiliate program uses, so fake signups
 *    earn nothing.
 *  - Membership boost: 1.5x for the duration of an active membership.
 *
 * Integrity notes: the daily XP cap still applies to BOOSTED credit, so
 * a multiplier means "reach the cap in fewer games", never more total XP
 * than a grinder already earns. Losses are never multiplied — the -1
 * battle penalty stays exactly as designed.
 */

/** Referral count -> multiplier tiers (highest wins, evaluated in order). */
export const REFERRAL_BOOST_TIERS = [
  { count: 10, multiplier: 2 },
  { count: 5, multiplier: 1.5 },
  { count: 1, multiplier: 1.25 },
] as const;

/** Multiplier for a rolling 7-day count of activated referrals. */
export function referralBoostMultiplier(activeReferrals: number): number {
  for (const t of REFERRAL_BOOST_TIERS) {
    if (activeReferrals >= t.count) return t.multiplier;
  }
  return 1;
}

/** Next tier above the current count — for "X more to 1.5x" nudges. */
export function nextReferralTier(activeReferrals: number): { count: number; multiplier: number } | null {
  const sorted = [...REFERRAL_BOOST_TIERS].sort((a, b) => a.count - b.count);
  for (const t of sorted) {
    if (activeReferrals < t.count) return { count: t.count, multiplier: t.multiplier };
  }
  return null;
}

export interface XpBoostState {
  /** Stored referral boost multiplier (league_xp_members.xp_boost_multiplier). */
  boostMultiplier?: number | null;
  /** Referral boost expiry (league_xp_members.xp_boost_until). */
  boostUntil?: string | null;
  /** Membership expiry (profiles.membership_until). */
  membershipUntil?: string | null;
  now?: Date;
}

/** Membership boost for as long as the subscription is active. */
export const MEMBER_XP_MULTIPLIER = 1.5;

/**
 * The single effective multiplier: the higher of an unexpired referral
 * boost and an active membership boost. Never stacks; never below 1.
 */
export function effectiveXpMultiplier(state: XpBoostState): number {
  const now = (state.now ?? new Date()).getTime();
  const boostActive =
    !!state.boostUntil &&
    new Date(state.boostUntil).getTime() > now &&
    typeof state.boostMultiplier === "number" &&
    state.boostMultiplier > 1;
  const referral = boostActive ? (state.boostMultiplier as number) : 1;
  const member =
    !!state.membershipUntil && new Date(state.membershipUntil).getTime() > now
      ? MEMBER_XP_MULTIPLIER
      : 1;
  return Math.max(1, referral, member);
}

/**
 * Apply the multiplier to a per-game XP amount: positive amounts are
 * multiplied and rounded to whole XP; zero and negative amounts
 * (losses, the anti-farming cap remainder) pass through untouched.
 */
export function applyXpMultiplier(amount: number, multiplier: number): number {
  if (amount <= 0 || multiplier <= 1) return amount;
  return Math.round(amount * multiplier);
}
