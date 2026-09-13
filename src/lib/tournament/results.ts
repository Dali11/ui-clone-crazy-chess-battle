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

  // ═══════════════════════════════════════════════════════════════════
  // NORMAL GAME — atomic exactly-once processing via SQL RPC
  //
  // process_tournament_result (migration 071) does claim + stats +
  // per-board pairing write in ONE transaction. The old JS path used a
  // read-then-write for stats and rewrote the whole pairings array —
  // concurrent processors (browser heartbeats, timeout-check polls, cron
  // sweeps all trigger this) erased each other's pairing result, and the
  // reconcile sweep then reprocessed the erased game → double-counted
  // standings ("3 played in 2 rounds", inflated scores).
  // ═══════════════════════════════════════════════════════════════════

  const isDraw = result.winner === "draw" || result.status === "draw" || result.status === "stalemate";
  const normalizedResult = isDraw ? "draw" : result.winner;

  if (normalizedResult !== "white" && normalizedResult !== "black" && normalizedResult !== "draw") {
    console.error("[processTournamentGameResult] Unusable result for game", result.gameId,
      "winner:", result.winner, "status:", result.status, "— not processing");
    return;
  }

  const isKnockoutDraw = isDraw && tournamentInfo?.type === "knockout";

  const { data: rpc, error: rpcErr } = await admin.rpc("process_tournament_result", {
    p_game_id: result.gameId,
    p_tournament_id: tournamentId,
    p_round_number: roundNumber,
    p_white_id: result.whitePlayerId,
    p_black_id: result.blackPlayerId,
    p_result: normalizedResult,
    p_keep_open: isKnockoutDraw, // knockout draw: round stays open pending Armageddon
  });

  if (rpcErr) {
    console.error("[processTournamentGameResult] RPC failed for game", result.gameId, rpcErr.message);
    return;
  }

  if (rpc?.pairing_found === false) {
    // The game ended but no board in the round matches it — the result would
    // be silently lost and the round would stall. Log loudly so the
    // reconciliation sweep / a human can pick it up.
    console.error(
      "[processTournamentGameResult] NO MATCHING PAIRING for game", result.gameId,
      "in round", roundNumber, "of tournament", tournamentId,
      "— players", result.whitePlayerId, "vs", result.blackPlayerId
    );
    return;
  }

  if (rpc?.first_time !== true) {
    // Repair call: stats were already applied by the first processor — this
    // invocation only healed a clobbered pairing result. Never re-add stats.
    console.log("[processTournamentGameResult] Repair-only reprocess (stats already applied) for game", result.gameId);
  }

  // ─── Knockout draw: trigger Armageddon tiebreak ───
  if (isKnockoutDraw) {
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

      // Link the tiebreak game on the pairing (result "draw" was already set
      // atomically by the RPC; this only adds tiebreak_game_id). Re-read the
      // pairings so a concurrent result from another board is preserved.
      const { data: freshPair } = await admin
        .from("tournament_rounds")
        .select("id, pairings")
        .eq("id", existingRound.id)
        .single();
      const pairings = (freshPair?.pairings || []) as Array<Record<string, unknown>>;
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
      // Tiebreak creation failed — let the round complete so advance-round
      // falls back to higher-seed advancement (pairing already says "draw").
      const { data: freshPair } = await admin
        .from("tournament_rounds")
        .select("pairings")
        .eq("id", existingRound.id)
        .single();
      const pairings = (freshPair?.pairings || []) as Array<Record<string, unknown>>;
      const allDone = pairings.every((p) => (p.result !== null && p.result !== undefined) || p.bye || (p as any).is_third_place);
      if (!allDone) return;

      await admin
        .from("tournament_rounds")
        .update({ is_complete: true })
        .eq("id", existingRound.id);

      await _checkAndFinishRound(admin, tournamentId, pairings, "knockout");
    }

    return; // Don't proceed — tiebreak is pending (or fallback applied)
  }

  // ─── Round completion ───
  if (rpc?.round_complete === true) {
    // Re-read the round's pairings for _checkAndFinishRound (knockout counts
    // bracket winners from them) instead of trusting a stale in-memory copy.
    const { data: freshPair } = await admin
      .from("tournament_rounds")
      .select("pairings")
      .eq("id", existingRound.id)
      .single();
    await _checkAndFinishRound(
      admin,
      tournamentId,
      (freshPair?.pairings || []) as Array<Record<string, unknown>>,
      tournamentInfo?.type || "swiss",
    );
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

// ═══════════════════════════════════════════════════════════════════════
// MANUAL RESULT RECORDING (admin override)
// ═══════════════════════════════════════════════════════════════════════

export type ManualOverrideReason =
  | "tournament_not_found"
  | "no_round"
  | "no_matching_pairing"
  | "already_recorded"
  | "stats_failed";

export interface ManualOverrideOutcome {
  ok: boolean;
  reason?: ManualOverrideReason;
  viaGame?: boolean;
  armageddonCreated?: boolean;
}

/**
 * Pure: find the pairing that matches the two players (orientation-agnostic,
 * byes excluded). Exported for unit tests.
 */
export function findPairingForPlayers(
  pairings: Array<Record<string, any>>,
  whiteId: string,
  blackId: string
): Record<string, any> | undefined {
  return pairings.find(
    (p) =>
      !p.bye &&
      ((p.white === whiteId && p.black === blackId) ||
        (p.white === blackId && p.black === whiteId))
  );
}

/**
 * Admin manual result override for a round-based tournament pairing.
 *
 * Works whether or not the pairing has a linked game:
 *  - With a game: the game row is mirrored to the chosen result and the
 *    normal processing pipeline runs (idempotent) — stats, pairing, round
 *    completion, armageddon for knockout draws.
 *  - Without a game (e.g. game creation failed at round start): stats and
 *    the pairing are recorded directly, mirroring _processTournamentGameResult,
 *    including Armageddon creation for knockout draws.
 *
 * Returns already_recorded when the pairing already has a result, so the
 * API layer can refuse corrections (they would desync stats/standings).
 */
export async function recordManualTournamentResult(opts: {
  tournamentId: string;
  roundNumber: number;
  whiteId: string;
  blackId: string;
  winner: "white" | "black" | "draw";
}): Promise<ManualOverrideOutcome> {
  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, type")
    .eq("id", opts.tournamentId)
    .single();
  if (!tournament) return { ok: false, reason: "tournament_not_found" };
  if (tournament.type === "arena") return { ok: false, reason: "no_round" }; // arena has no pairings

  const { data: round } = await admin
    .from("tournament_rounds")
    .select("id, pairings")
    .eq("tournament_id", opts.tournamentId)
    .eq("round_number", opts.roundNumber)
    .maybeSingle();
  if (!round) return { ok: false, reason: "no_round" };

  const pairings = (round.pairings as Array<Record<string, any>>) || [];
  const matchesPairing = (p: Record<string, any>) =>
    (p.white === opts.whiteId && p.black === opts.blackId) ||
    (p.white === opts.blackId && p.black === opts.whiteId);
  const pairing = findPairingForPlayers(pairings, opts.whiteId, opts.blackId);
  if (!pairing) return { ok: false, reason: "no_matching_pairing" };
  if (pairing.result !== null && pairing.result !== undefined) {
    return { ok: false, reason: "already_recorded" };
  }

  // ── With a linked game: mirror the game row, then run normal processing ──
  if (pairing.game_id) {
    const { data: game } = await admin
      .from("games")
      .select("id")
      .eq("id", pairing.game_id)
      .maybeSingle();

    if (game) {
      await admin
        .from("games")
        .update({
          status: opts.winner === "draw" ? "draw" : "completed",
          winner: opts.winner === "draw" ? null : opts.winner,
          ended_at: new Date().toISOString(),
        })
        .eq("id", pairing.game_id);

      await processTournamentGameResult({
        gameId: pairing.game_id,
        whitePlayerId: opts.whiteId,
        blackPlayerId: opts.blackId,
        winner: opts.winner,
        status: "admin_override",
      });
      return { ok: true, viaGame: true };
    }
    // game row missing → fall through to direct recording
  }

  // ── No usable game row: record directly ──
  const isDraw = opts.winner === "draw";

  // Knockout draw: create the Armageddon tiebreak exactly like the normal flow.
  if (isDraw && tournament.type === "knockout") {
    try {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, rating")
        .in("id", [opts.whiteId, opts.blackId]);
      const wRating = profiles?.find((p: any) => p.id === opts.whiteId)?.rating || 1200;
      const bRating = profiles?.find((p: any) => p.id === opts.blackId)?.rating || 1200;

      const tiebreak = await createTournamentArmageddon(
        opts.tournamentId, opts.roundNumber, opts.whiteId, opts.blackId, wRating, bRating
      );
      const updatedPairings = pairings.map((p) =>
        matchesPairing(p) ? { ...p, result: "draw", tiebreak_game_id: tiebreak.gameId } : p
      );
      await admin
        .from("tournament_rounds")
        .update({ pairings: updatedPairings, is_complete: false })
        .eq("id", round.id);
      return { ok: true, armageddonCreated: true };
    } catch (e) {
      console.error("[recordManualTournamentResult] Armageddon creation failed, recording plain draw:", e);
      // fall through to plain draw recording
    }
  }

  // Atomic stats (no read-then-write — migration 071 RPC)
  const { error: statsErr } = await admin.rpc("apply_tournament_stats", {
    p_tournament_id: opts.tournamentId,
    p_white_id: opts.whiteId,
    p_black_id: opts.blackId,
    p_result: opts.winner,
  });
  if (statsErr) {
    console.error("[recordManualTournamentResult] stats RPC failed:", statsErr.message);
    return { ok: false, reason: "stats_failed" };
  }

  const updatedPairings = pairings.map((p) =>
    matchesPairing(p) ? { ...p, result: opts.winner } : p
  );
  const allDone = updatedPairings.every(
    (p) => (p.result !== null && p.result !== undefined) || p.bye || p.is_third_place
  );
  await admin
    .from("tournament_rounds")
    .update({ pairings: updatedPairings, is_complete: allDone })
    .eq("id", round.id);

  if (allDone) {
    await _checkAndFinishRound(admin, opts.tournamentId, updatedPairings, tournament.type || "swiss");
  }
  return { ok: true };
}
