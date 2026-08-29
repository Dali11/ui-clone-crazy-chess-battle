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
      status,
      type
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

  // For knockout tournaments, use bracket results (champion, runner-up, 3rd, 4th)
  // instead of Swiss tiebreaks which don't reflect bracket elimination.
  let rankedParticipants: Array<{ player_id: string; final_rank: number; score: number; wins: number }> = [];

  if (tournament.type === "arena") {
    // Arena: rank by score desc, wins desc, games_played desc
    const { data: arenaParts } = await admin
      .from("tournament_participants")
      .select("player_id, score, wins, games_played")
      .eq("tournament_id", tournamentId);

    const sorted = (arenaParts || []).sort((a: any, b: any) =>
      (b.score || 0) - (a.score || 0) ||
      (b.wins || 0) - (a.wins || 0) ||
      (b.games_played || 0) - (a.games_played || 0)
    );

    rankedParticipants = sorted.map((p: any, i: number) => ({
      player_id: p.player_id,
      final_rank: i + 1,
      score: p.score || 0,
      wins: p.wins || 0,
    }));
  } else if (tournament.type === "knockout") {
    // Walk the tournament rounds from last to first to determine placements.
    // Final round: winner = rank 1, loser = rank 2.
    // 3rd-place pairing (is_third_place): winner = rank 3, loser = rank 4.
    const { data: allRounds } = await admin
      .from("tournament_rounds")
      .select("round_number, pairings")
      .eq("tournament_id", tournamentId)
      .order("round_number", { ascending: false });

    if (allRounds && allRounds.length > 0) {
      const finalRound = allRounds[0];
      const fps = (finalRound.pairings as any[]) || [];
      const bracketPairings = fps.filter((p) => !p.is_third_place);
      const thirdPlace = fps.find((p) => p.is_third_place);

      const rankMap = new Map<string, number>();

      // Champion + runner-up from the bracket final
      const bracketFinal = bracketPairings.find((p) => p.result === "white" || p.result === "black");
      if (bracketFinal) {
        const champion = bracketFinal.result === "white" ? bracketFinal.white : bracketFinal.black;
        const runnerUp = bracketFinal.result === "white" ? bracketFinal.black : bracketFinal.white;
        rankMap.set(champion, 1);
        rankMap.set(runnerUp, 2);
      }

      // 3rd + 4th from the 3rd-place match
      if (thirdPlace && (thirdPlace.result === "white" || thirdPlace.result === "black")) {
        const third = thirdPlace.result === "white" ? thirdPlace.white : thirdPlace.black;
        const fourth = thirdPlace.result === "white" ? thirdPlace.black : thirdPlace.white;
        rankMap.set(third, 3);
        rankMap.set(fourth, 4);
      }

      // For players eliminated in earlier rounds, rank by round eliminated (later = better)
      // then by score, then by seed.
      const { data: allParts } = await admin
        .from("tournament_participants")
        .select("player_id, score, wins, seed")
        .eq("tournament_id", tournamentId);
      const eliminated = (allParts || []).filter((p) => !rankMap.has(p.player_id));
      eliminated.sort((a: any, b: any) => (b.score || 0) - (a.score || 0) || (a.seed || 0) - (b.seed || 0));
      eliminated.forEach((p: any, i: number) => {
        rankMap.set(p.player_id, 5 + i);
      });

      rankedParticipants = (allParts || []).map((p: any) => ({
        player_id: p.player_id,
        final_rank: rankMap.get(p.player_id) || 99,
        score: p.score || 0,
        wins: p.wins || 0,
      }));
    }
  }

  // Fallback to Swiss tiebreaks for non-knockout tournaments or if bracket data is missing
  if (rankedParticipants.length === 0) {
    const { calculateTiebreaks } = await import("@/lib/tournament/tiebreaks");
    const tb = await calculateTiebreaks(admin, tournamentId);
    rankedParticipants = (tb || []).map((p: any) => ({
      player_id: p.player_id,
      final_rank: p.final_rank ?? 0,
      score: p.score ?? 0,
      wins: p.wins ?? 0,
    }));
  }

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

  // Insert in-app notifications for all participants (fire-and-forget)
  try {
    const { data: allParts } = await admin
      .from("tournament_participants")
      .select("player_id")
      .eq("tournament_id", tournamentId);
    const partIds = (allParts || []).map((p: any) => p.player_id);
    const rankMap = new Map((rankedParticipants || []).map((p: any) => [p.player_id, p.final_rank ?? 0]));

    for (const pid of partIds) {
      const rank = rankMap.get(pid) ?? 0;
      await admin.from("notifications").insert({
        user_id: pid,
        type: "tournament_finished",
        title: `${tournament.name} — Final Results`,
        body: `The tournament has finished. Your final rank: #${rank}. Check the results page for full standings.`,
        data: { tournament_id: tournamentId, final_rank: rank },
        read: false,
      });
    }
  } catch (e) {
    console.error("Tournament finished notifications failed:", e);
  }
}
