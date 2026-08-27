import { createAdminClient } from "@/lib/supabase/admin";
import { distributePrizes } from "@/lib/tournament/prizes";
import { computeTournamentEconomics } from "@/lib/tournament/economics";

/**
 * Shared tournament finish logic — marks the tournament as finished,
 * assigns final ranks with proper Swiss tiebreaks (Buchholz, Sonneborn-Berger),
 * distributes the prize pool to winners (with creator profit if applicable),
 * and sends notification emails to all participants.
 *
 * Called from:
 *   - /api/tournaments/[id]/finish (admin/creator manual finish)
 *   - /api/tournaments/[id]/advance-round (auto-finish when rounds exhausted)
 *   - /api/admin/tournaments PATCH force_finish (admin force finish)
 *   - lib/tournament/results.ts (auto-finish when last round's games all complete)
 *
 * Idempotent: distributePrizes checks for existing payout records to prevent
 * double-paying. Re-running on an already-finished tournament is safe.
 */
export async function finishTournament(tournamentId: string): Promise<void> {
  const admin = createAdminClient();

  // Fetch tournament details
  const { data: tournament } = await admin
    .from("tournaments")
    .select(`
      id,
      name,
      prize_pool,
      prize_distribution,
      entry_fee,
      creator_profit_percent,
      created_by,
      pool_source,
      status
    `)
    .eq("id", tournamentId)
    .single();

  if (!tournament) {
    console.error("finishTournament: tournament not found", tournamentId);
    return;
  }

  // Mark as finished (idempotent)
  if (tournament.status !== "finished") {
    const { error } = await admin
      .from("tournaments")
      .update({ status: "finished", ended_at: new Date().toISOString() })
      .eq("id", tournamentId);
    if (error) {
      console.error("finishTournament: failed to set status", error.message);
    }
  }

  // Rank participants using proper Swiss tiebreaks (Buchholz, Sonneborn-Berger)
  const { calculateTiebreaks } = await import("@/lib/tournament/tiebreaks");
  const rankedParticipants = await calculateTiebreaks(admin, tournamentId);

  if (!rankedParticipants || rankedParticipants.length === 0) return;

  // Assign final ranks
  for (const p of rankedParticipants) {
    await admin
      .from("tournament_participants")
      .update({ final_rank: p.final_rank })
      .eq("player_id", p.player_id)
      .eq("tournament_id", tournamentId);
  }

  // Calculate prize distribution (shared with admin revenue view + public display)
  const { totalCollected, creatorProfit, actualPrizePool } =
    computeTournamentEconomics(tournament);
  const creatorProfitPercent = tournament.creator_profit_percent || 0;
  const isFixedPool = tournament.pool_source === "fixed";

  if (totalCollected > 0) {
    // Distribute the actual prize pool to winners
    if (actualPrizePool > 0) {
      await distributePrizes(
        tournamentId,
        rankedParticipants.map((p) => ({
          player_id: p.player_id,
          final_rank: p.final_rank ?? null,
          score: p.score ?? 0,
        })),
        actualPrizePool,
        tournament.prize_distribution || { type: "flat", payouts: [] }
      );
    }

    if (!isFixedPool && creatorProfitPercent > 0) {
      // Credit creator profit to creator's wallet
      if (creatorProfit > 0 && tournament.created_by) {
        await admin.rpc("credit_wallet", {
          p_user_id: tournament.created_by,
          p_amount: creatorProfit,
        });

        // Record creator profit payout for audit trail
        await admin.from("deposits").insert({
          user_id: tournament.created_by,
          amount: creatorProfit,
          status: "success",
          method: "tournament_creator_profit",
          reference: `tournament:${tournamentId}:creator_profit`,
        });
      }

      // Update tournament with the economics breakdown
      await admin
        .from("tournaments")
        .update({
          prize_distribution: {
            ...(tournament.prize_distribution || {}),
            economics: {
              totalCollected,
              platformCut: 0,
              creatorProfit,
              creatorProfitPercent,
              actualPrizePool,
              created_by: tournament.created_by,
            },
          },
        })
        .eq("id", tournamentId);
    }
  }

  // Send tournament finished emails to all participants (fire-and-forget)
  const { data: allPartProfiles } = await admin
    .from("tournament_participants")
    .select("player_id")
    .eq("tournament_id", tournamentId);
  const partIds = (allPartProfiles || []).map((p: any) => p.player_id);
  const { data: partEmails } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .in("id", partIds);
  const emailMap = new Map((partEmails || []).map((p: any) => [p.id, p]));
  const rankMap = new Map((rankedParticipants || []).map((p: any) => [p.player_id, p.final_rank ?? 0]));

  const emails = partIds
    .map((pid: string) => {
      const prof = emailMap.get(pid);
      if (!prof?.email) return null;
      return {
        to: prof.email,
        subject: `${tournament.name} — Final Results`,
        template: "tournament_finished" as const,
        data: {
          tournamentName: tournament.name,
          tournamentId,
          finalRank: rankMap.get(pid) || 0,
          playerName: prof.display_name || "Player",
        },
      };
    })
    .filter(Boolean) as any[];

  if (emails.length > 0) {
    import("@/lib/email").then(({ sendBatchEmails }) => {
      sendBatchEmails(emails).catch(() => {});
    });
  }
}
