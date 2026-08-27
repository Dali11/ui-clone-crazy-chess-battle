/**
 * Shared prize-pool economics calculation.
 *
 * The `prize_pool` column on a tournament tracks the GROSS amount collected
 * from entry fees (100% of what players paid in). The amount actually paid
 * out to winners is smaller — the platform takes a cut, and if the creator
 * set a profit percentage during setup, they take a cut of the remainder too.
 *
 * This must be computed the exact same way everywhere it's shown or paid out:
 *   - lib/tournament/finish.ts (actual payout at tournament end)
 *   - api/admin/tournaments/[id]/route.ts (admin revenue breakdown)
 *   - api/tournaments/[id]/route.ts (public tournament page display)
 *
 * Rules (mirrors the payout logic in finish.ts):
 *   - pool_source === 'fixed': no cut at all, full amount is the prize pool.
 *   - creator_profit_percent > 0: 10% platform cut off the top, then the
 *     creator's percentage of what's left, remainder is the real prize pool.
 *   - creator_profit_percent === 0 (admin/legacy/free tournaments): no cuts,
 *     the full collected amount is the prize pool.
 */

export const PLATFORM_CUT_PERCENT = 10;

export interface TournamentEconomicsInput {
  prize_pool: number | null;
  pool_source: string | null;
  creator_profit_percent: number | null;
}

export interface TournamentEconomics {
  /** Gross amount collected (or fixed pool amount) — what's stored in prize_pool */
  totalCollected: number;
  /** What the platform keeps */
  platformCut: number;
  /** What the tournament creator keeps */
  creatorProfit: number;
  /** What actually gets distributed to winners */
  actualPrizePool: number;
}

export function computeTournamentEconomics(
  tournament: TournamentEconomicsInput
): TournamentEconomics {
  const totalCollected = tournament.prize_pool || 0;
  const creatorProfitPercent = tournament.creator_profit_percent || 0;

  if (totalCollected <= 0) {
    return { totalCollected, platformCut: 0, creatorProfit: 0, actualPrizePool: 0 };
  }

  if (tournament.pool_source === "fixed") {
    // Fixed pool: full amount goes to winners, no cuts
    return { totalCollected, platformCut: 0, creatorProfit: 0, actualPrizePool: totalCollected };
  }

  if (creatorProfitPercent > 0) {
    const platformCut = Math.floor(totalCollected * (PLATFORM_CUT_PERCENT / 100));
    const remainder = totalCollected - platformCut;
    const creatorProfit = Math.floor(remainder * (creatorProfitPercent / 100));
    const actualPrizePool = remainder - creatorProfit;
    return { totalCollected, platformCut, creatorProfit, actualPrizePool };
  }

  // Admin/legacy/free tournament: no cuts, full pool goes to winners
  return { totalCollected, platformCut: 0, creatorProfit: 0, actualPrizePool: totalCollected };
}
