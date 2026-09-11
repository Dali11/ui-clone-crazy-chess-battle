import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

interface PrizeDistribution {
  type: "flat" | "percentage" | "tiered";
  payouts: Array<{ rank: number; amount?: number; percentage?: number }>;
}

interface ParticipantResult {
  player_id: string;
  final_rank: number | null;
  score: number;
}

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

export const DEFAULT_PRIZE_SPLITS = PRIZE_SPLITS_BY_TYPE.swiss;

export async function distributePrizes(
  tournamentId: string,
  participants: ParticipantResult[],
  prizePool: number,
  prizeDistribution: PrizeDistribution
) {
  if (!prizePool || prizePool <= 0) return;
  if (!participants.length) return;

  const admin = createAdminClient();
  const payouts: Array<{ player_id: string; amount: number; rank: number }> = [];

  if (prizeDistribution.type === "flat" && prizeDistribution.payouts.length > 0) {
    for (const payout of prizeDistribution.payouts) {
      const winner = participants.find((p) => p.final_rank === payout.rank);
      if (winner && payout.amount) {
        payouts.push({ player_id: winner.player_id, amount: payout.amount, rank: payout.rank });
      }
    }
  } else if (prizeDistribution.type === "percentage" && prizeDistribution.payouts.length > 0) {
    for (const payout of prizeDistribution.payouts) {
      const winner = participants.find((p) => p.final_rank === payout.rank);
      if (winner && payout.percentage) {
        const amount = Math.floor(prizePool * (payout.percentage / 100));
        if (amount > 0) {
          payouts.push({ player_id: winner.player_id, amount: amount, rank: payout.rank });
        }
      }
    }
  } else {
    for (const split of DEFAULT_PRIZE_SPLITS) {
      const winner = participants.find((p) => p.final_rank === split.rank);
      if (winner) {
        const amount = Math.floor(prizePool * (split.percentage / 100));
        if (amount > 0) {
          payouts.push({ player_id: winner.player_id, amount: amount, rank: split.rank });
        }
      }
    }
  }

  // Fetch tournament name for email
  const { data: tournament } = await admin
    .from("tournaments")
    .select("name")
    .eq("id", tournamentId)
    .single();

  // Credit winners' wallets (exactly-once per payout).
  //
  // The audit row is inserted FIRST as a claim: the partial unique index on
  // deposits(reference) for 'tournament:%:rank:%' refs (migration 055) makes
  // the insert fail if another finishTournament call already paid this
  // rank, so a race between the cron, advance-round, admin force-finish and
  // the manual finish route can never double-credit a wallet. Only after a
  // successful claim do we credit the wallet.
  for (const payout of payouts) {
    const payoutRef = `tournament:${tournamentId}:rank:${payout.rank}`;

    // Fast path: already paid (idempotent re-run).
    const { data: existing } = await admin
      .from("deposits")
      .select("id")
      .eq("reference", payoutRef)
      .eq("user_id", payout.player_id)
      .maybeSingle();
    if (existing) continue;

    // Claim: insert the audit row. Unique violation = someone else paid
    // this rank concurrently — skip without crediting.
    const { error: claimErr } = await admin.from("deposits").insert({
      user_id: payout.player_id,
      amount: payout.amount,
      status: "success",
      method: "tournament_payout",
      reference: payoutRef,
    });
    if (claimErr) {
      if ((claimErr as { code?: string }).code === "23505") continue; // already paid
      console.error("Tournament payout claim failed (wallet NOT credited):", claimErr);
      continue;
    }

    const { error: _creditErr } = await admin.rpc("credit_wallet", {
      p_user_id: payout.player_id,
      p_amount: payout.amount,
    });
    if (_creditErr) console.error("credit_wallet failed after claim — audit row exists, wallet not credited:", _creditErr);

    // Send prize payout email (fire-and-forget)
    try {
      const { data: winnerProfile } = await admin
        .from("profiles")
        .select("email, display_name, username")
        .eq("id", payout.player_id)
        .single();

      if (winnerProfile?.email) {
        await sendEmail({
          to: winnerProfile.email,
          subject: `Prize won — #${payout.rank} in ${tournament?.name || "tournament"}`,
          template: "prize_payout",
          data: {
            displayName: winnerProfile.display_name || winnerProfile.username || "Player",
            tournamentName: tournament?.name || "Tournament",
            rank: payout.rank,
            amount: payout.amount,
          },
        });
      }
    } catch (emailErr) {
      console.error("Prize payout email failed:", emailErr);
    }
  }

  // Update tournament with actual payouts
  await admin
    .from("tournaments")
    .update({
      prize_distribution: {
        ...prizeDistribution,
        actual_payouts: payouts.map((p) => ({
          player_id: p.player_id,
          amount: p.amount,
          rank: p.rank,
        })),
      },
    })
    .eq("id", tournamentId);

  return payouts;
}
