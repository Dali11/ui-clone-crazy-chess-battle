import { CREATOR_PLATFORM_FEE_PERCENT } from "@/lib/tournament/creator-economics";
/**
 * Shared prize-pool economics calculation.
 *
 * The `prize_pool` column on a tournament tracks the GROSS amount collected
 * from entry fees (100% of what players paid in). The amount actually paid
 * out to winners may be smaller if the creator set a profit percentage.
 *
 * This must be computed the exact same way everywhere it's shown or paid out:
 *   - lib/tournament/finish.ts (actual payout at tournament end)
 *   - api/admin/tournaments/[id]/route.ts (admin revenue breakdown)
 *   - api/tournaments/[id]/route.ts (public tournament page display)
 *
 * Rules:
 *   - pool_source === 'fixed': no cut at all, full amount is the prize pool.
 *   - creator_profit_percent > 0: creator takes their percentage of the total
 *     collected, remainder is the real prize pool. No platform fee.
 *   - creator_profit_percent === 0 (admin/legacy/free tournaments): no cuts,
 *     the full collected amount is the prize pool.
 */

export interface TournamentEconomicsInput {
  prize_pool: number | null;
  pool_source: string | null;
  creator_profit_percent: number | null;
  /** Player-led (non-admin) tournament — platform takes 5% of gross entry fees */
  is_player_created?: boolean | null;
}

export interface TournamentEconomics {
  /** Gross amount collected (or fixed pool amount) — what's stored in prize_pool */
  totalCollected: number;
  /** What the platform keeps (always 0 — no platform fee) */
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

  if (tournament.is_player_created) {
    // Player-led tournament: the platform takes 5% of GROSS first, then the
    // creator's cut (percentage of gross), and winners split the remainder.
    // Admin-hosted tournaments are unchanged (no platform cut).
    const platformCut = Math.floor(
      totalCollected * (CREATOR_PLATFORM_FEE_PERCENT / 100)
    );
    const creatorProfit =
      creatorProfitPercent > 0
        ? Math.floor(totalCollected * (creatorProfitPercent / 100))
        : 0;
    return {
      totalCollected,
      platformCut,
      creatorProfit,
      actualPrizePool: totalCollected - platformCut - creatorProfit,
    };
  }

  if (creatorProfitPercent > 0) {
    // Admin-created tournament: creator takes their percentage of the
    // total, rest is the prize pool. No platform fee.
    const creatorProfit = Math.floor(totalCollected * (creatorProfitPercent / 100));
    const actualPrizePool = totalCollected - creatorProfit;
    return { totalCollected, platformCut: 0, creatorProfit, actualPrizePool };
  }

  // Admin/legacy/free tournament: no cuts, full pool goes to winners
  return { totalCollected, platformCut: 0, creatorProfit: 0, actualPrizePool: totalCollected };
}
