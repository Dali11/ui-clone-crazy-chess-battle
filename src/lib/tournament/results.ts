import { createAdminClient } from "@/lib/supabase/admin";
import { finishTournament } from "@/lib/tournament/finish";

interface GameResult {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  winner: "white" | "black" | "draw";
  status: string;
}

/**
 * Process a finished tournament game:
 * 1. Update participant stats (score, wins, losses, games_played)
 * 2. Mark pairing result in tournament_rounds
 * 3. Check if round is complete -> mark is_complete
 * 4. If all rounds done -> finish tournament
 *
 * This function is wrapped in a try-catch and logs errors instead of throwing,
 * so that game-ending endpoints (move, resign, draw, timeout) don't fail
 * the HTTP response when tournament processing encounters an issue.
 */
export async function processTournamentGameResult(result: GameResult) {
  try {
    await _processTournamentGameResult(result);
  } catch (err) {
    console.error("[processTournamentGameResult] FATAL error processing game", result.gameId, err);
  }
}

async function _processTournamentGameResult(result: GameResult) {
  const admin = createAdminClient();

  const { data: game, error: gameErr } = await admin
    .from("games")
    .select("tournament_id, tournament_round, status")
    .eq("id", result.gameId)
    .single();

  if (gameErr) {
    console.error("[processTournamentGameResult] Failed to fetch game", result.gameId, gameErr.message);
    return;
  }

  if (!game?.tournament_id) return;

  const tournamentId = game.tournament_id;
  const roundNumber = game.tournament_round || 1;

  // Idempotency: check if this game's result was already processed
  const { data: existingRound, error: roundErr } = await admin
    .from("tournament_rounds")
    .select("id, pairings")
    .eq("tournament_id", tournamentId)
    .eq("round_number", roundNumber)
    .single();

  if (roundErr) {
    console.error("[processTournamentGameResult] Failed to fetch round", tournamentId, roundNumber, roundErr.message);
    return;
  }

  if (!existingRound) {
    console.warn("[processTournamentGameResult] No round found", tournamentId, roundNumber);
    return;
  }

  if (existingRound?.pairings) {
    const pairings = existingRound.pairings as Array<Record<string, unknown>>;
    const alreadyProcessed = pairings.some(
      (p) =>
        p.result !== null &&
        p.result !== undefined &&
        ((p.white === result.whitePlayerId && p.black === result.blackPlayerId) ||
          (p.white === result.blackPlayerId && p.black === result.whitePlayerId))
    );
    if (alreadyProcessed) {
      console.log("[processTournamentGameResult] Game already processed, skipping", result.gameId);
      return;
    }
  }

  const whiteWon = result.winner === "white";
  const blackWon = result.winner === "black";
  const isDraw = result.winner === "draw" || result.status === "draw" || result.status === "stalemate";

  // White player stats
  const { data: whiteStats, error: whiteErr } = await admin
    .from("tournament_participants")
    .select("score, wins, losses, draws, games_played")
    .eq("tournament_id", tournamentId)
    .eq("player_id", result.whitePlayerId)
    .single();

  if (whiteErr) {
    console.error("[processTournamentGameResult] Failed to fetch white participant stats", result.whitePlayerId, whiteErr.message);
  }

  if (whiteStats) {
    const { error: wUpdateErr } = await admin
      .from("tournament_participants")
      .update({
        score: whiteStats.score + (whiteWon ? 1 : isDraw ? 0.5 : 0),
        wins: whiteStats.wins + (whiteWon ? 1 : 0),
        losses: whiteStats.losses + (blackWon ? 1 : 0),
        draws: whiteStats.draws + (isDraw ? 1 : 0),
        games_played: whiteStats.games_played + 1,
      })
      .eq("tournament_id", tournamentId)
      .eq("player_id", result.whitePlayerId);

    if (wUpdateErr) {
      console.error("[processTournamentGameResult] Failed to update white participant stats", result.whitePlayerId, wUpdateErr.message);
    }
  }

  // Black player stats
  const { data: blackStats, error: blackErr } = await admin
    .from("tournament_participants")
    .select("score, wins, losses, draws, games_played")
    .eq("tournament_id", tournamentId)
    .eq("player_id", result.blackPlayerId)
    .single();

  if (blackErr) {
    console.error("[processTournamentGameResult] Failed to fetch black participant stats", result.blackPlayerId, blackErr.message);
  }

  if (blackStats) {
    const { error: bUpdateErr } = await admin
      .from("tournament_participants")
      .update({
        score: blackStats.score + (blackWon ? 1 : isDraw ? 0.5 : 0),
        wins: blackStats.wins + (blackWon ? 1 : 0),
        losses: blackStats.losses + (whiteWon ? 1 : 0),
        draws: blackStats.draws + (isDraw ? 1 : 0),
        games_played: blackStats.games_played + 1,
      })
      .eq("tournament_id", tournamentId)
      .eq("player_id", result.blackPlayerId);

    if (bUpdateErr) {
      console.error("[processTournamentGameResult] Failed to update black participant stats", result.blackPlayerId, bUpdateErr.message);
    }
  }

  // Mark pairing result in the round
  if (existingRound && existingRound.pairings) {
    const pairings = existingRound.pairings as Array<Record<string, unknown>>;
    const updatedPairings = pairings.map((p) => {
      if (
        (p.white === result.whitePlayerId && p.black === result.blackPlayerId) ||
        (p.white === result.blackPlayerId && p.black === result.whitePlayerId)
      ) {
        return { ...p, result: result.winner };
      }
      return p;
    });

    // Round is complete when all non-3rd-place pairings have results (or byes).
    // 3rd-place match may still be in progress when the final finishes.
    const allDone = updatedPairings.every((p) => (p.result !== null && p.result !== undefined) || p.bye || (p as any).is_third_place);

    const { error: roundUpdateErr } = await admin
      .from("tournament_rounds")
      .update({ pairings: updatedPairings, is_complete: allDone })
      .eq("id", existingRound.id);

    if (roundUpdateErr) {
      console.error("[processTournamentGameResult] Failed to update round pairings", existingRound.id, roundUpdateErr.message);
      return; // Don't proceed to finish tournament if we couldn't update the round
    }

    console.log("[processTournamentGameResult] Round updated successfully", existingRound.id, "allDone:", allDone);

    if (allDone) {
      const { data: tournament, error: tErr } = await admin
        .from("tournaments")
        .select("current_round, rounds, type")
        .eq("id", tournamentId)
        .single();

      if (tErr || !tournament) {
        console.error("[processTournamentGameResult] Failed to fetch tournament", tournamentId, tErr?.message);
        return;
      }

      if (tournament.type === "knockout") {
        // Count only non-3rd-place pairings to determine if bracket is done
        const bracketPairings = updatedPairings.filter((p) => !(p as any).is_third_place);
        const roundWinners = bracketPairings.filter(
          (p) => p.result === "white" || p.result === "black"
        ).length;
        const roundByes = bracketPairings.filter((p) => p.bye).length;

        if (roundWinners + roundByes <= 1) {
          await finishTournament(tournamentId);
        }
      } else {
        if (tournament.current_round >= tournament.rounds) {
          await finishTournament(tournamentId);
        }
      }
    }
  }
}
