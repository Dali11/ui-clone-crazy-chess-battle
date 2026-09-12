/**
 * Membership — pure helpers (unit-tested).
 *
 * A member is a profile whose membership_until is in the future.
 * Purchases extend membership lazily: buying again while active stacks
 * from the current expiry (no lost days), buying after expiry restarts
 * from now.
 */

export const MEMBERSHIP_DAYS = 30;

/** Is this profile currently a member? */
export function isMember(membershipUntil: string | null | undefined, nowISO: string): boolean {
  if (!membershipUntil) return false;
  return new Date(membershipUntil).getTime() > new Date(nowISO).getTime();
}

/**
 * New membership_until after a successful purchase.
 * Stacks from current expiry when still active (round integer days in
 * the purchase period), restarts from now when lapsed/expired.
 */
export function extendMembership(
  currentUntil: string | null | undefined,
  nowISO: string,
  days: number = MEMBERSHIP_DAYS
): string {
  const periodMs = days * 24 * 60 * 60 * 1000;
  const now = new Date(nowISO).getTime();
  const current = currentUntil ? new Date(currentUntil).getTime() : 0;
  const base = current > now ? current : now;
  return new Date(base + periodMs).toISOString();
}

/** Whole days of membership remaining (0 when lapsed). */
export function daysRemaining(membershipUntil: string | null | undefined, nowISO: string): number {
  if (!membershipUntil) return 0;
  const ms = new Date(membershipUntil).getTime() - new Date(nowISO).getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}
