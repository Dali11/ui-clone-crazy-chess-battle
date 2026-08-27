import { createAdminClient } from "@/lib/supabase/admin";

interface PrizeDistribution {
  type: "flat" | "percentage" | "tiered";
  payouts: Array<{ rank: number; amount_cents?: number; percentage?: number }>;
}

interface ParticipantResult {
  player_id: string;
  final_rank: number | null;
  score: number;
}

// Default payout structure by tournament format.
// Knockout tournaments have fewer total games, so only the top 4 who reach
// the semis/final are rewarded. Swiss/arena run more rounds against a wider
// field, so the top 5 share the pool.
export const PRIZE_SPLITS_BY_TYPE: Record<string, Array<{ rank: number; percentage: number }>> = {
  knockout: [
    { rank: 1, percentage: 50 },
    { rank: 2, percentage: 25 },
    { rank: 3, percentage: 15 },
    { rank: 4, percentage: 10 },
  ],
  swiss: [
    { rank: 1, percentage: 40 },
    { rank: 2, percentage: 20 },
    { rank: 3, percentage: 18 },
    { rank: 4, percentage: 12 },
    { rank: 5, percentage: 10 },
  ],
  arena: [
    { rank: 1, percentage: 40 },
    { rank: 2, percentage: 20 },
    { rank: 3, percentage: 18 },
    { rank: 4, percentage: 12 },
    { rank: 5, percentage: 10 },
  ],
};

// Fallback used when a tournament's type doesn't match a known key
export const DEFAULT_PRIZE_SPLITS = PRIZE_SPLITS_BY_TYPE.swiss;

/**
 * Distribute prize pool to winners based on tournament's prize_distribution config.
 * Called after tournament.finish() sets final_rank on all participants.
 */
export async function distributePrizes(
  tournamentId: string,
  participants: ParticipantResult[],
  prizePoolCents: number,
  prizeDistribution: PrizeDistribution
) {
  if (!prizePoolCents || prizePoolCents <= 0) return;
  if (!participants.length) return;

  const admin = createAdminClient();
  const payouts: Array<{ player_id: string; amount_cents: number; rank: number }> = [];

  if (prizeDistribution.type === "flat" && prizeDistribution.payouts.length > 0) {
    // Fixed amounts per rank
    for (const payout of prizeDistribution.payouts) {
      const winner = participants.find((p) => p.final_rank === payout.rank);
      if (winner && payout.amount_cents) {
        payouts.push({ player_id: winner.player_id, amount_cents: payout.amount_cents, rank: payout.rank });
      }
    }
  } else if (prizeDistribution.type === "percentage" && prizeDistribution.payouts.length > 0) {
    // Percentage of prize pool per rank
    for (const payout of prizeDistribution.payouts) {
      const winner = participants.find((p) => p.final_rank === payout.rank);
      if (winner && payout.percentage) {
        const amount = Math.floor(prizePoolCents * (payout.percentage / 100));
        if (amount > 0) {
          payouts.push({ player_id: winner.player_id, amount_cents: amount, rank: payout.rank });
        }
      }
    }
  } else {
    // Default fallback: top 5 split 40/20/18/12/10
    for (const split of DEFAULT_PRIZE_SPLITS) {
      const winner = participants.find((p) => p.final_rank === split.rank);
      if (winner) {
        const amount = Math.floor(prizePoolCents * (split.percentage / 100));
        if (amount > 0) {
          payouts.push({ player_id: winner.player_id, amount_cents: amount, rank: split.rank });
        }
      }
    }
  }

  // Credit winners' wallets (skip already-paid entries to prevent double-payout)
  for (const payout of payouts) {
    const payoutRef = `tournament:${tournamentId}:rank:${payout.rank}`;
    const { data: existing } = await admin
      .from("deposits")
      .select("id")
      .eq("reference", payoutRef)
      .eq("user_id", payout.player_id)
      .single();
    if (existing) continue; // already paid for this rank

    await admin.rpc("credit_wallet", {
      p_user_id: payout.player_id,
      p_amount_cents: payout.amount_cents,
    });

    // Record the payout as a deposit entry for audit trail
    const { error: _depErr } = await admin.from("deposits").insert({
      user_id: payout.player_id,
      amount_cents: payout.amount_cents,
      status: "success",
      method: "tournament_payout",
      reference: `tournament:${tournamentId}:rank:${payout.rank}`,
    });
    if (_depErr) console.error("Deposit audit log failed:", _depErr);
  }

  // Update tournament with actual payouts
  await admin
    .from("tournaments")
    .update({
      prize_distribution: {
        ...prizeDistribution,
        actual_payouts: payouts.map((p) => ({
          player_id: p.player_id,
          amount_cents: p.amount_cents,
          rank: p.rank,
        })),
      },
    })
    .eq("id", tournamentId);

  return payouts;
}
