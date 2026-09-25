/**
 * Pure display helpers for the tournament prize distribution card.
 * No server imports — safe to use from client components.
 */

export interface PrizePayout {
  rank: number;
  amount?: number;
  percentage?: number;
}

export interface PrizeDist {
  type: "flat" | "percentage" | "tiered";
  payouts: PrizePayout[];
}

/** Amount a given rank wins from the pool (same math as the card UI). */
export function prizePayoutAmount(dist: PrizeDist | null | undefined, pool: number, rank: number): number {
  const p = (dist?.payouts ?? []).find((x) => x.rank === rank);
  if (!p) return 0;
  if (dist?.type === "flat") return p.amount || 0;
  return pool > 0 ? Math.floor(pool * ((p.percentage || 0) / 100)) : 0;
}

/**
 * Owner rule (2026-09-25): the prize distribution card stays hidden
 * until the number-5 payout exceeds the entry price. The pool grows as
 * players join, so the card reveals itself once the prize table is
 * actually attractive. Distributions without a rank 5 (knockout top-4)
 * use their lowest rank in its place.
 */
export function shouldShowPrizeDistribution(
  dist: PrizeDist | null | undefined,
  pool: number,
  entryFee: number
): boolean {
  if (!dist || !dist.payouts || dist.payouts.length === 0) return false;
  const sorted = [...dist.payouts].sort((a, b) => a.rank - b.rank);
  const fifth = sorted.find((p) => p.rank === 5) ?? sorted[sorted.length - 1];
  const amount =
    dist.type === "flat"
      ? fifth.amount || 0
      : pool > 0
        ? Math.floor(pool * ((fifth.percentage || 0) / 100))
        : 0;
  return amount > (entryFee || 0);
}
