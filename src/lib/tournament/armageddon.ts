import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tournament Armageddon tiebreak.
 *
 * When a knockout tournament game ends in a draw, instead of silently advancing
 * the higher seed, we create an Armageddon tiebreak game:
 *
 * - White gets more time (e.g. 5 min) but MUST win — a draw counts as a Black win.
 * - Black gets less time (e.g. 3 min) but has draw odds.
 * - Colors are swapped from the original game (the player who was White in the
 *   drawn game becomes Black in the tiebreak, giving them draw odds as compensation
 *   for having White in the original).
 * - The tiebreak game is marked is_tiebreak = true so result processing knows
 *   to treat draws as a Black win and to NOT trigger another tiebreak.
 *
 * Standard Armageddon time odds: White 5 min vs Black 3 min, no increment.
 */

const ARMAGEDDON_WHITE_MINUTES = 5;
const ARMAGEDDON_BLACK_MINUTES = 3;

export interface TiebreakGameInfo {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
}

/**
 * Create an Armageddon tiebreak game for a drawn knockout tournament game.
 *
 * @param tournamentId   - The tournament ID
 * @param roundNumber     - The round number of the drawn game
 * @param origWhiteId     - White player ID from the original game
 * @param origBlackId     - Black player ID from the original game
 * @param origWhiteRating - Rating of the original white player
 * @param origBlackRating - Rating of the original black player
 * @param pairingId       - The board/index of the pairing in the round (for linking)
 * @returns Info about the newly created tiebreak game
 */
export async function createTournamentArmageddon(
  tournamentId: string,
  roundNumber: number,
  origWhiteId: string,
  origBlackId: string,
  origWhiteRating: number,
  origBlackRating: number,
): Promise<TiebreakGameInfo> {
  const admin = createAdminClient();

  // Swap colors: original White gets Black (with draw odds), original Black gets White
  const whiteId = origBlackId;
  const blackId = origWhiteId;
  const whiteRating = origBlackRating;
  const blackRating = origWhiteRating;

  const now = new Date();
  const scheduledStart = new Date(now.getTime() + 60_000); // 1 minute rest

  // Insert the Armageddon game directly (like all tournament games)
  const { data: gameRow, error: gameErr } = await admin
    .from("games")
    .insert({
      white_player_id: whiteId,
      black_player_id: blackId,
      white_rating: whiteRating,
      black_rating: blackRating,
      status: "waiting",
      time_control: "armageddon",
      initial_minutes: ARMAGEDDON_WHITE_MINUTES,
      increment_seconds: 0,
      rated: false,
      tournament_id: tournamentId,
      tournament_round: roundNumber,
      is_tiebreak: true,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "white",
      move_count: 0,
      white_clock_ms: ARMAGEDDON_WHITE_MINUTES * 60 * 1000,
      black_clock_ms: ARMAGEDDON_BLACK_MINUTES * 60 * 1000,
      scheduled_start: scheduledStart.toISOString(),
    })
    .select("id")
    .single();

  if (gameErr || !gameRow) {
    console.error("[armageddon] Failed to create tiebreak game:", gameErr);
    throw new Error("Failed to create Armageddon tiebreak game");
  }

  console.log(
    `[armageddon] Created tiebreak game ${gameRow.id} for tournament ${tournamentId} round ${roundNumber}`,
    `White: ${whiteId} (${ARMAGEDDON_WHITE_MINUTES}min), Black: ${blackId} (${ARMAGEDDON_BLACK_MINUTES}min + draw odds)`,
  );

  // Notify both players about the tiebreak
  const tiebreakMsg = `Your knockout game ended in a draw. An Armageddon tiebreak has been created — White gets ${ARMAGEDDON_WHITE_MINUTES}min, Black gets ${ARMAGEDDON_BLACK_MINUTES}min + draw odds. The winner advances!`;
  for (const pid of [whiteId, blackId]) {
    try {
      await admin.from("notifications").insert({
        user_id: pid,
        type: "tournament_tiebreak",
        title: "⚔️ Armageddon Tiebreak!",
        body: tiebreakMsg,
        data: { tournament_id: tournamentId, game_id: gameRow.id, round: roundNumber },
        read: false,
      });
    } catch (e) {
      console.error("[armageddon] Notification failed:", e);
    }
  }

  return {
    gameId: gameRow.id,
    whitePlayerId: whiteId,
    blackPlayerId: blackId,
  };
}

/**
 * Given a finished tiebreak game, determine the decisive result.
 *
 * In Armageddon: a draw (or stalemate) counts as a win for Black (draw odds).
 * So the only way White wins is by checkmate or opponent resignation/timeout.
 *
 * @param gameStatus  - The game's final status ("checkmate", "resign", "timeout", "draw", "stalemate")
 * @param gameWinner  - The game's winner field ("white", "black", or null)
 * @returns The effective winner: "white" or "black" (never null)
 */
export function resolveArmageddonResult(
  gameStatus: string,
  gameWinner: string | null,
): "white" | "black" {
  // If the game produced a decisive winner, use that
  if (gameWinner === "white") return "white";
  if (gameWinner === "black") return "black";

  // Draw or stalemate → Black wins by draw odds
  return "black";
}
