import { createAdminClient } from "@/lib/supabase/admin";

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
 */
export async function processTournamentGameResult(result: GameResult) {
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("tournament_id, tournament_round, status")
    .eq("id", result.gameId)
    .single();

  if (!game?.tournament_id) return;

  // Idempotency guard — use a separate flag column instead of checking game status,
  // because by the time this runs, the game status has already been updated to
  // "checkmate", "resign", etc. We check if the participant stats already reflect
  // this game by checking games_played count vs round number.
  // Instead of early-returning on non-"playing" status, we use a processed_at sentinel.

  const tournamentId = game.tournament_id;
  const roundNumber = game.tournament_round || 1;

  // Idempotency: check if this game's result was already processed
  // by looking at the round pairings for an existing result
  const { data: existingRound } = await admin
    .from("tournament_rounds")
    .select("id, pairings")
    .eq("tournament_id", tournamentId)
    .eq("round_number", roundNumber)
    .single();

  if (existingRound?.pairings) {
    const pairings = existingRound.pairings as Array<Record<string, unknown>>;
    const alreadyProcessed = pairings.some(
      (p) =>
        p.result !== null &&
        p.result !== undefined &&
        ((p.white === result.whitePlayerId && p.black === result.blackPlayerId) ||
          (p.white === result.blackPlayerId && p.black === result.whitePlayerId))
    );
    if (alreadyProcessed) return;
  }

  const whiteWon = result.winner === "white";
  const blackWon = result.winner === "black";
  const isDraw = result.winner === "draw" || result.status === "draw" || result.status === "stalemate";

  // White player stats
  const { data: whiteStats } = await admin
    .from("tournament_participants")
    .select("score, wins, losses, draws, games_played")
    .eq("tournament_id", tournamentId)
    .eq("player_id", result.whitePlayerId)
    .single();

  if (whiteStats) {
    await admin
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
  }

  // Black player stats
  const { data: blackStats } = await admin
    .from("tournament_participants")
    .select("score, wins, losses, draws, games_played")
    .eq("tournament_id", tournamentId)
    .eq("player_id", result.blackPlayerId)
    .single();

  if (blackStats) {
    await admin
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

    const allDone = updatedPairings.every((p) => p.result !== null && p.result !== undefined || p.bye);

    await admin
      .from("tournament_rounds")
      .update({ pairings: updatedPairings, is_complete: allDone })
      .eq("id", existingRound.id);

    if (allDone) {
      const { data: tournament } = await admin
        .from("tournaments")
        .select("current_round, rounds, type")
        .eq("id", tournamentId)
        .single();

      if (!tournament) return;

      if (tournament.type === "knockout") {
        // For knockout: check if only 1 player has a "win" in this round
        // (i.e., only 1 winner = champion)
        const roundWinners = updatedPairings.filter(
          (p) => p.result === "white" || p.result === "black"
        ).length;
        const roundByes = updatedPairings.filter((p) => p.bye).length;

        if (roundWinners + roundByes <= 1) {
          // Tournament is over — we have a champion
          await admin
            .from("tournaments")
            .update({ status: "finished", ended_at: new Date().toISOString() })
            .eq("id", tournamentId);
        }
        // Otherwise, advance-round will be called to create the next bracket round
      } else {
        // Swiss/Arena: finish when all scheduled rounds are done
        if (tournament.current_round >= tournament.rounds) {
          await admin
            .from("tournaments")
            .update({ status: "finished", ended_at: new Date().toISOString() })
            .eq("id", tournamentId);
        }
      }
    }
  }
}
