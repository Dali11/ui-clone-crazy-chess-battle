import { createAdminClient } from "@/lib/supabase/admin";
import { awardBerries } from "@/lib/berry/award";
import { settleBattle } from "@/lib/battles/settle";
import { processTournamentGameResult } from "@/lib/tournament/results";
import { processLeagueGameResult } from "@/lib/league/process-game-result";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface TimeoutableGame {
  id: string;
  turn: "white" | "black";
  move_count: number;
  white_player_id: string;
  black_player_id: string;
  white_rating: number | null;
  black_rating: number | null;
  rated: boolean;
  tournament_id?: string | null;
}

/**
 * Resolves a game whose active player's clock has hit zero. Shared by:
 * - /api/game/move (self-check when a player tries to move after their own clock died)
 * - /api/game/timeout-check (client-callable check, polled by the opponent's tab)
 * - /api/game/timeout (cron sweep over all active games)
 *
 * Two outcomes:
 * - ABORT — nobody made a single move (move_count === 0). This is the
 *   "opponent never showed up" case: no winner, no rating change, no
 *   berries. Tournament and battle games are never aborted this way —
 *   they always resolve decisively since brackets/stakes need a result.
 * - TIMEOUT — a normal decisive loss for whoever's clock ran out. This is
 *   the "opponent disconnected mid-game" case: counts as a real result
 *   (rating change if rated, berries to the winner, battle/tournament
 *   settlement as usual).
 */
export async function resolveTimeoutForGame(admin: AdminClient, game: TimeoutableGame) {
  const loser = game.turn;

  // Is this linked to a battle? Battles always resolve decisively —
  // there's real money in escrow, so "abort" isn't an option for them.
  const { data: battle } = await admin
    .from("battles")
    .select("id, status, white_player_id, black_player_id, armageddon_game_id")
    .or(`game_id.eq.${game.id},armageddon_game_id.eq.${game.id}`)
    .in("status", ["playing", "draw_armageddon"])
    .limit(1)
    .single();

  const isNoShow = game.move_count === 0 && !game.tournament_id && !battle;

  if (isNoShow) {
    // Atomic claim: only proceed if still "playing". resolveTimeoutForGame
    // is shared by 3 entry points (move self-check, timeout-check polled
    // by opponent, cron sweep) that can all race on the same game.
    const { data: claimed } = await admin
      .from("games")
      .update({
        status: "abort",
        winner: null,
        ended_at: new Date().toISOString(),
        [`${loser}_clock_ms`]: 0,
      })
      .eq("id", game.id)
      .eq("status", "playing")
      .select("id")
      .single();

    if (!claimed) return { status: "already_resolved" as const, winner: null };

    return { status: "abort" as const, winner: null };
  }

  // Decisive timeout loss
  const winner = loser === "white" ? "black" : "white";
  const winnerId = winner === "white" ? game.white_player_id : game.black_player_id;
  const loserId = loser === "white" ? game.white_player_id : game.black_player_id;
  const loserRating = loser === "white" ? game.white_rating : game.black_rating;
  const winnerRating = loser === "white" ? game.black_rating : game.white_rating;

  // Atomic claim: only proceed if still "playing" — same race guard as
  // the no-show branch above.
  const { data: claimedTimeout } = await admin
    .from("games")
    .update({
      status: "timeout",
      winner,
      ended_at: new Date().toISOString(),
      [`${loser}_clock_ms`]: 0,
    })
    .eq("id", game.id)
    .eq("status", "playing")
    .select("id")
    .single();

  if (!claimedTimeout) return { status: "already_resolved" as const, winner: null };

  if (game.rated && loserRating != null && winnerRating != null) {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const K = 32;
    const winnerChange = Math.round(K * (1 - expectedWinner));
    const loserChange = -winnerChange;

    await admin.from("games").update({
      white_rating_change: loser === "white" ? loserChange : winnerChange,
      black_rating_change: loser === "black" ? loserChange : winnerChange,
    }).eq("id", game.id);

    const { data: winnerProfile } = await admin.from("profiles").select("wins, games_played").eq("id", winnerId).single();
    const { data: loserProfile } = await admin.from("profiles").select("losses, games_played").eq("id", loserId).single();

    await admin.from("profiles").update({
      rating: winnerRating + winnerChange,
      wins: (winnerProfile?.wins ?? 0) + 1,
      games_played: (winnerProfile?.games_played ?? 0) + 1,
    }).eq("id", winnerId);

    await admin.from("profiles").update({
      rating: loserRating + loserChange,
      losses: (loserProfile?.losses ?? 0) + 1,
      games_played: (loserProfile?.games_played ?? 0) + 1,
    }).eq("id", loserId);
  }

  // Berries for the winner (skipped automatically for tournament/battle games)
  await awardBerries(game.id, winnerId);

  // Tournament advancement
  if (game.tournament_id) {
    try {
      await processTournamentGameResult({
        gameId: game.id,
        whitePlayerId: game.white_player_id,
        blackPlayerId: game.black_player_id,
        winner: winner as "white" | "black",
        status: "timeout",
      });
    } catch (e) {
      console.error("[timeout] Tournament processing failed for game", game.id, e);

    // League fixture processing
    try {
      await processLeagueGameResult({
        gameId: game.id,
        whitePlayerId: game.white_player_id,
        blackPlayerId: game.black_player_id,
        winner: winner as "white" | "black",
        status: "timeout",
      });
    } catch (e) {
      console.error("[timeout] League processing failed for game", game.id, e);
    }
    }
  }

  // Battle settlement
  if (battle) {
    const isArmageddon = battle.armageddon_game_id === game.id;
    const battleWinnerId = winner === "white"
      ? (isArmageddon ? battle.black_player_id : battle.white_player_id)
      : (isArmageddon ? battle.white_player_id : battle.black_player_id);
    await settleBattle(battle.id, battleWinnerId, "timeout").catch((e) => console.error("Battle settlement failed:", e));
  }

  return { status: "timeout" as const, winner };
}
