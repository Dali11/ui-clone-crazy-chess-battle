import { createAdminClient } from "@/lib/supabase/admin";
import { processTournamentGameResult } from "@/lib/tournament/results";
import { settleBattle } from "@/lib/battles/settle";
import { awardGameXp } from "@/lib/league-xp/award";

/**
 * Shared "a player resigns, opponent wins" resolution flow, extracted from
 * the /api/game/resign route so it can also be driven server-side:
 *
 *   1. The player taps Resign (client-initiated).
 *   2. Abandonment enforcement: a player who left the game page silently
 *      for ABANDON_SECONDS is auto-resigned by the opponent's poll or the
 *      cron sweep (src/lib/game/abandonment.ts).
 *
 * Performs, in order:
 *   - atomic claim of the game row (status playing -> resign) so concurrent
 *     callers (client resign vs. abandonment poll vs. cron) can never
 *     double-process; the loser gets { ok: false }
 *   - realtime broadcast so the other client updates instantly
 *   - Elo + W/L updates on both profiles
 *   - tournament bracket advancement / league fixture result, if any
 *   - battle settlement (escrow -> winner), including armageddon inversion
 *
 * All downstream steps are safe to re-run-never: they only execute when this
 * call won the atomic claim.
 */
export async function finalizeResign(opts: {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  /** "white" | "black" — the player who wins by resignation */
  winner: "white" | "black";
  /** Player who resigned (for the realtime broadcast payload). */
  resignedPlayerId: string;
  /** Admin client to reuse when called from a route that already has one. */
  admin?: ReturnType<typeof createAdminClient>;
}): Promise<{ ok: boolean }> {
  const admin = opts.admin ?? createAdminClient();
  const { gameId, whitePlayerId, blackPlayerId, winner } = opts;

  // ── Atomic claim: only succeed if still "playing" at update time ──────
  const { data: claimedGame, error: updateError } = await admin.from("games").update({
    status: "resign",
    winner,
    ended_at: new Date().toISOString(),
  }).eq("id", gameId).eq("status", "playing").select("id").single();

  if (updateError || !claimedGame) {
    // Someone else (client resign, abandonment poll, cron sweep) already
    // resolved this game — not an error, we simply lost the race.
    return { ok: false };
  }

  // ── Broadcast to the other client for instant UI update ───────────────
  const channel = admin.channel(`game:${gameId}`);
  await channel.send({
    type: "broadcast",
    event: "resign",
    payload: { from: opts.resignedPlayerId, winner },
  });

  // ── Ratings & W/L records ────────────────────────────────────────────
  const { data: whiteProfile } = await admin
    .from("profiles")
    .select("rating, games_played, wins, losses, draws")
    .eq("id", whitePlayerId)
    .single();

  const { data: blackProfile } = await admin
    .from("profiles")
    .select("rating, games_played, wins, losses, draws")
    .eq("id", blackPlayerId)
    .single();

  if (whiteProfile && blackProfile) {
    const K = 32;
    const whiteExpected = 1 / (1 + Math.pow(10, (blackProfile.rating - whiteProfile.rating) / 400));
    const blackExpected = 1 - whiteExpected;
    const whiteScore = winner === "white" ? 1 : 0;
    const blackScore = 1 - whiteScore;

    const whiteNewRating = Math.round(whiteProfile.rating + K * (whiteScore - whiteExpected));
    const blackNewRating = Math.round(blackProfile.rating + K * (blackScore - blackExpected));

    await admin.from("profiles").update({
      rating: whiteNewRating,
      games_played: (whiteProfile.games_played || 0) + 1,
      wins: (whiteProfile.wins || 0) + (winner === "white" ? 1 : 0),
      losses: (whiteProfile.losses || 0) + (winner === "black" ? 1 : 0),
    }).eq("id", whitePlayerId);

    await admin.from("profiles").update({
      rating: blackNewRating,
      games_played: (blackProfile.games_played || 0) + 1,
      wins: (blackProfile.wins || 0) + (winner === "black" ? 1 : 0),
      losses: (blackProfile.losses || 0) + (winner === "white" ? 1 : 0),
    }).eq("id", blackPlayerId);

    await admin.from("games").update({
      white_rating_change: whiteNewRating - whiteProfile.rating,
      black_rating_change: blackNewRating - blackProfile.rating,
    }).eq("id", gameId);
  }

  // ── XP Leagues: award XP for the finished game (idempotent) ──────────
  awardGameXp({
    gameId,
    game: {
      white_player_id: whitePlayerId,
      black_player_id: blackPlayerId,
      winner,
    },
    admin,
  }).catch(() => {});

  // ── Tournament result processing ─────────────────────────────
  const { data: fullGame } = await admin
    .from("games")
    .select("tournament_id")
    .eq("id", gameId)
    .single();

  if (fullGame?.tournament_id) {
    try {
      await processTournamentGameResult({
        gameId,
        whitePlayerId,
        blackPlayerId,
        winner,
        status: "resign",
      });
    } catch (e) {
      console.error("[finalizeResign] Tournament processing failed for game", gameId, e);
    }
  }

  // ── Battle settlement (escrow -> winner), incl. armageddon ────────────
  const { data: battle } = await admin
    .from("battles")
    .select("id, status, white_player_id, black_player_id, armageddon_game_id")
    .or(`game_id.eq.${gameId},armageddon_game_id.eq.${gameId}`)
    .in("status", ["playing", "draw_armageddon"])
    .limit(1)
    .maybeSingle();

  if (battle) {
    const isArmageddon = !fullGame?.tournament_id && battle.armageddon_game_id === gameId;
    const battleWinnerId = winner === "white"
      ? (isArmageddon ? battle.black_player_id : battle.white_player_id)
      : (isArmageddon ? battle.white_player_id : battle.black_player_id);

    await settleBattle(battle.id, battleWinnerId, "resign").catch((e) =>
      console.error("[finalizeResign] Battle settlement failed:", e)
    );
  }

  return { ok: true };
}
