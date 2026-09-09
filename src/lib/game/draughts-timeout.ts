import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// How long a draughts player has to complete an early move (moves 0-1)
// before the game is treated as a no-show and aborted.
export const DRAUGHTS_NO_SHOW_SECONDS = 120;

/**
 * Rating + record bookkeeping for a resolved draughts game.
 * NOTE: kept in sync with the same-named function in
 * /api/draughts/move/route.ts — that route is left untouched because it
 * is the hot path for live games; if you change ELO logic, change both.
 */
export async function updateDraughtsRatingsForTimeout(
  admin: AdminClient,
  game: {
    id: string;
    white_player_id: string;
    black_player_id: string;
    rated?: boolean;
  },
  winner: string | null,
  status: string
) {
  const { data: whiteProfile } = await admin
    .from("profiles")
    .select("draughts_rating, draughts_games_played, draughts_wins, draughts_losses, draughts_draws")
    .eq("id", game.white_player_id)
    .single();

  const { data: blackProfile } = await admin
    .from("profiles")
    .select("draughts_rating, draughts_games_played, draughts_wins, draughts_losses, draughts_draws")
    .eq("id", game.black_player_id)
    .single();

  if (!whiteProfile || !blackProfile) return;

  const whiteRating = whiteProfile.draughts_rating || 1500;
  const blackRating = blackProfile.draughts_rating || 1500;

  const K = 32;
  const whiteExpected = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
  const whiteScore = winner === "white" ? 1 : winner === "black" ? 0 : 0.5;
  const blackScore = 1 - whiteScore;

  const whiteNewRating = Math.round(whiteRating + K * (whiteScore - whiteExpected));
  const blackNewRating = Math.round(blackRating + K * (blackScore - (1 - whiteExpected)));

  await admin.from("profiles").update({
    draughts_rating: whiteNewRating,
    draughts_games_played: (whiteProfile.draughts_games_played || 0) + 1,
    draughts_wins: (whiteProfile.draughts_wins || 0) + (winner === "white" ? 1 : 0),
    draughts_losses: (whiteProfile.draughts_losses || 0) + (winner === "black" ? 1 : 0),
    draughts_draws: (whiteProfile.draughts_draws || 0) + (status === "draw" ? 1 : 0),
  }).eq("id", game.white_player_id);

  await admin.from("profiles").update({
    draughts_rating: blackNewRating,
    draughts_games_played: (blackProfile.draughts_games_played || 0) + 1,
    draughts_wins: (blackProfile.draughts_wins || 0) + (winner === "black" ? 1 : 0),
    draughts_losses: (blackProfile.draughts_losses || 0) + (winner === "white" ? 1 : 0),
    draughts_draws: (blackProfile.draughts_draws || 0) + (status === "draw" ? 1 : 0),
  }).eq("id", game.black_player_id);

  await admin.from("draughts_games").update({
    white_rating_change: whiteNewRating - whiteRating,
    black_rating_change: blackNewRating - blackRating,
  }).eq("id", game.id);
}

/**
 * Resolves a draughts game whose active player's clock hit zero — a
 * decisive timeout loss with ELO update, matching the move route's
 * self-check. Atomic claim on status so concurrent sweeps can't
 * double-resolve.
 */
export async function resolveDraughtsTimeout(
  admin: AdminClient,
  game: { id: string; turn: string; white_player_id: string; black_player_id: string; rated?: boolean }
) {
  const loser = game.turn as "white" | "black";
  const winner = loser === "white" ? "black" : "white";

  const { data: claimed } = await admin
    .from("draughts_games")
    .update({
      status: "timeout",
      winner,
      ended_at: new Date().toISOString(),
      [`${loser}_clock_ms`]: 0,
    })
    .eq("id", game.id)
    .eq("status", "playing")
    .select("id")
    .maybeSingle();

  if (!claimed) return { status: "already_resolved" as const, winner: null };

  await updateDraughtsRatingsForTimeout(admin, game, winner, "timeout");
  return { status: "timeout" as const, winner };
}

/**
 * Aborts a draughts no-show (moves 0-1 never made in time): no winner,
 * no rating change. Atomic claim on status.
 */
export async function abortDraughtsNoShow(
  admin: AdminClient,
  game: { id: string }
) {
  const { data: claimed } = await admin
    .from("draughts_games")
    .update({
      status: "abort",
      winner: null,
      ended_at: new Date().toISOString(),
    })
    .eq("id", game.id)
    .eq("status", "playing")
    .select("id")
    .maybeSingle();

  return claimed
    ? { status: "abort" as const, winner: null }
    : { status: "already_resolved" as const, winner: null };
}
