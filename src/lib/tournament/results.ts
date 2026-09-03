import { createAdminClient } from "@/lib/supabase/admin";
import { finishTournament } from "@/lib/tournament/finish";
import { processArenaGameResult, runArenaMatchmakingWave } from "@/lib/tournament/arena";
import { createTournamentArmageddon, resolveArmageddonResult } from "@/lib/tournament/armageddon";

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
 * For KNOCKOUT tournaments: a draw triggers an Armageddon tiebreak game
 * (draw odds for Black, time odds for White). The pairing result stays
 * "draw" until the tiebreak resolves, then it's updated to the decisive winner.
 *
 * Tiebreak games do NOT update participant stats — only the original
 * game's draw counts for score/wins/losses. The tiebreak only determines
 * who advances.
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
    .select("tournament_id, tournament_round, status, is_tiebreak, white_player_id, black_player_id, white_rating, black_rating")
    .eq("id", result.gameId)
    .maybeSingle();

  if (gameErr) {
    console.error("[processTournamentGameResult] Failed to fetch game", result.gameId, gameErr.message);
    return;
  }

  if (!game?.tournament_id) return;

  const tournamentId = game.tournament_id;

  // ─── Arena tournaments: use continuous matchmaking, no rounds ───
  const { data: tournamentInfo } = await admin
    .from("tournaments")
    .select("type")
    .eq("id", tournamentId)
    .single();

  if (tournamentInfo?.type === "arena") {
    await processArenaGameResult(admin, result, tournamentId);
    // Immediately try to re-pair the two players who just freed up (plus
    // anyone else who was waiting) — don't wait for the next cron tick.
    await runArenaMatchmakingWave(admin, tournamentId);
    return; // Arena doesn't use round completion or auto-finish
  }

  const roundNumber = game.tournament_round || 1;

  // Fetch the round
  const { data: existingRound, error: roundErr } = await admin
    .from("tournament_rounds")
    .select("id, pairings")
    .eq("tournament_id", tournamentId)
    .eq("round_number", roundNumber)
    .maybeSingle();

  if (roundErr) {
    console.error("[processTournamentGameResult] Failed to fetch round", tournamentId, roundNumber, roundErr.message);
    return;
  }

  if (!existingRound) {
    console.warn("[processTournamentGameResult] No round found", tournamentId, roundNumber);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // TIEBREAK GAME: resolve with draw odds and update the pairing result.
  // Tiebreak games do NOT update participant stats.
  // ═══════════════════════════════════════════════════════════════════
  if (game.is_tiebreak) {
    await _processTiebreakResult(admin, result, existingRound, tournamentId, roundNumber);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // NORMAL GAME
  // ═══════════════════════════════════════════════════════════════════

  // Idempotency: check if this game's result was already processed
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

  // Update participant stats
  await _updateParticipantStats(admin, tournamentId, result.whitePlayerId, whiteWon, blackWon, isDraw);
  await _updateParticipantStats(admin, tournamentId, result.blackPlayerId, blackWon, whiteWon, isDraw);

  // ─── Knockout draw: trigger Armageddon tiebreak ───
  if (isDraw && tournamentInfo?.type === "knockout") {
    console.log("[processTournamentGameResult] Knockout draw — triggering Armageddon tiebreak for game", result.gameId);

    try {
      const tiebreak = await createTournamentArmageddon(
        tournamentId,
        roundNumber,
        result.whitePlayerId,
        result.blackPlayerId,
        game.white_rating || 1200,
        game.black_rating || 1200,
      );

      // Update pairing: mark as "draw" and link the tiebreak game.
      // Round is NOT complete — the tiebreak is still pending.
      const pairings = existingRound.pairings as Array<Record<string, unknown>>;
      const updatedPairings = pairings.map((p) => {
        if (
          (p.white === result.whitePlayerId && p.black === result.blackPlayerId) ||
          (p.white === result.blackPlayerId && p.black === result.whitePlayerId)
        ) {
          return { ...p, result: "draw", tiebreak_game_id: tiebreak.gameId };
        }
        return p;
      });

      await admin
        .from("tournament_rounds")
        .update({ pairings: updatedPairings, is_complete: false })
        .eq("id", existingRound.id);

      console.log("[processTournamentGameResult] Armageddon tiebreak created:", tiebreak.gameId);
    } catch (e) {
      console.error("[processTournamentGameResult] Failed to create Armageddon tiebreak, falling back to seed-based advancement:", e);
      // Fallback: set pairing result to "draw" (advance-round will use seed)
      const pairings = existingRound.pairings as Array<Record<string, unknown>>;
      const updatedPairings = pairings.map((p) => {
        if (
          (p.white === result.whitePlayerId && p.black === result.blackPlayerId) ||
          (p.white === result.blackPlayerId && p.black === result.whitePlayerId)
        ) {
          return { ...p, result: "draw" };
        }
        return p;
      });

      const allDone = updatedPairings.every((p) => (p.result !== null && p.result !== undefined) || p.bye || (p as any).is_third_place);
      await admin
        .from("tournament_rounds")
        .update({ pairings: updatedPairings, is_complete: allDone })
        .eq("id", existingRound.id);

      if (allDone) await _checkAndFinishRound(admin, tournamentId, updatedPairings, tournamentInfo?.type || "swiss");
    }

    return; // Don't proceed — tiebreak is pending (or fallback applied)
  }

  // ─── Normal decisive result (or non-knockout draw) ───
  const pairings = existingRound.pairings as Array<Record<string, unknown>>;
  const matchesPairing = (p: Record<string, unknown>) =>
    (p.white === result.whitePlayerId && p.black === result.blackPlayerId) ||
    (p.white === result.blackPlayerId && p.black === result.whitePlayerId);
  if (!pairings.some(matchesPairing)) {
    // The game ended but no pairing in this round matches its players — the
    // result would be silently lost and the round would stall. Log loudly
    // so the reconciliation sweep / a human can pick it up.
    console.error(
      "[processTournamentGameResult] NO MATCHING PAIRING for game", result.gameId,
      "in round", roundNumber, "of tournament", tournamentId,
      "— players", result.whitePlayerId, "vs", result.blackPlayerId,
      "— round pairings:", JSON.stringify(pairings)
    );
    return;
  }
  const updatedPairings = pairings.map((p) => matchesPairing(p) ? { ...p, result: result.winner } : p);

  // Round is complete when all non-3rd-place pairings have results (or byes).
  const allDone = updatedPairings.every((p) => (p.result !== null && p.result !== undefined) || p.bye || (p as any).is_third_place);

  const { error: roundUpdateErr } = await admin
    .from("tournament_rounds")
    .update({ pairings: updatedPairings, is_complete: allDone })
    .eq("id", existingRound.id);

  if (roundUpdateErr) {
    console.error("[processTournamentGameResult] Failed to update round pairings", existingRound.id, roundUpdateErr.message);
    return;
  }

  console.log("[processTournamentGameResult] Round updated successfully", existingRound.id, "allDone:", allDone);

  if (allDone) {
    await _checkAndFinishRound(admin, tournamentId, updatedPairings, tournamentInfo?.type || "swiss");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TIEBREAK RESULT PROCESSING
// ═══════════════════════════════════════════════════════════════════════

async function _processTiebreakResult(
  admin: ReturnType<typeof createAdminClient>,
  result: GameResult,
  existingRound: { id: string; pairings: any[] },
  tournamentId: string,
  roundNumber: number,
) {
  // Resolve with draw odds: draw/stalemate = Black wins
  const tiebreakWinner = resolveArmageddonResult(result.status, result.winner as string | null);

  // Map back to original pairing colors:
  // Tiebreak White = original Black, Tiebreak Black = original White
  // If tiebreak white wins → original "black" advances → pairing result = "black"
  // If tiebreak black wins → original "white" advances → pairing result = "white"
  const pairingResult = tiebreakWinner === "white" ? "black" : "white";

  console.log(
    `[processTournamentGameResult] Tiebreak game ${result.gameId} resolved:`,
    `tiebreak winner=${tiebreakWinner}, pairing result=${pairingResult}`,
  );

  // Find the pairing by tiebreak_game_id and update its result
  const pairings = existingRound.pairings as Array<Record<string, unknown>>;
  const updatedPairings = pairings.map((p) => {
    if (p.tiebreak_game_id === result.gameId) {
      return { ...p, result: pairingResult };
    }
    return p;
  });

  // Check round completion
  const allDone = updatedPairings.every((p) => (p.result !== null && p.result !== undefined) || p.bye || (p as any).is_third_place);

  const { error: roundUpdateErr } = await admin
    .from("tournament_rounds")
    .update({ pairings: updatedPairings, is_complete: allDone })
    .eq("id", existingRound.id);

  if (roundUpdateErr) {
    console.error("[processTournamentGameResult] Failed to update tiebreak round pairings", existingRound.id, roundUpdateErr.message);
    return;
  }

  console.log("[processTournamentGameResult] Tiebreak round updated", existingRound.id, "allDone:", allDone);

  if (allDone) {
    const { data: tournamentInfo } = await admin
      .from("tournaments")
      .select("type")
      .eq("id", tournamentId)
      .single();
    await _checkAndFinishRound(admin, tournamentId, updatedPairings, tournamentInfo?.type || "swiss");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER: Update participant stats
// ═══════════════════════════════════════════════════════════════════════

async function _updateParticipantStats(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  playerId: string,
  won: boolean,
  lost: boolean,
  drew: boolean,
) {
  const { data: stats, error } = await admin
    .from("tournament_participants")
    .select("score, wins, losses, draws, games_played")
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .single();

  if (error || !stats) {
    console.error("[processTournamentGameResult] Failed to fetch participant stats", playerId, error?.message);
    return;
  }

  const { error: updateErr } = await admin
    .from("tournament_participants")
    .update({
      score: stats.score + (won ? 1 : drew ? 0.5 : 0),
      wins: stats.wins + (won ? 1 : 0),
      losses: stats.losses + (lost ? 1 : 0),
      draws: stats.draws + (drew ? 1 : 0),
      games_played: stats.games_played + 1,
    })
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId);

  if (updateErr) {
    console.error("[processTournamentGameResult] Failed to update participant stats", playerId, updateErr.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER: Check if round is complete and finish tournament if needed
// ═══════════════════════════════════════════════════════════════════════

async function _checkAndFinishRound(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  updatedPairings: Array<Record<string, unknown>>,
  tournamentType: string,
) {
  const { data: tournament, error: tErr } = await admin
    .from("tournaments")
    .select("current_round, rounds, type")
    .eq("id", tournamentId)
    .single();

  if (tErr || !tournament) {
    console.error("[processTournamentGameResult] Failed to fetch tournament", tournamentId, tErr?.message);
    return;
  }

  if (tournamentType === "knockout") {
    const bracketPairings = updatedPairings.filter((p) => !(p as any).is_third_place);
    const roundWinners = bracketPairings.filter(
      (p) => p.result === "white" || p.result === "black"
    ).length;
    const roundByes = bracketPairings.filter((p) => p.bye).length;

    if (roundWinners + roundByes <= 1) {
      const thirdPlaceMatch = updatedPairings.find((p) => (p as any).is_third_place);
      if (thirdPlaceMatch && thirdPlaceMatch.result !== "white" && thirdPlaceMatch.result !== "black") {
        console.log("[processTournamentGameResult] Bracket final done, waiting for 3rd-place match");
      } else {
        await finishTournament(tournamentId);
      }
    }
  } else {
    if (tournament.current_round >= tournament.rounds) {
      await finishTournament(tournamentId);
    }
  }
}
