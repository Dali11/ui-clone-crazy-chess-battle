import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Guard: check if a tournament round already exists before creating it.
 * Returns true if the round already exists (skip creation), false otherwise.
 *
 * This prevents duplicate game creation when multiple cron sections
 * (auto-advance + re-check after timeouts) both try to advance the same
 * tournament in a single cron run.
 */
export async function roundAlreadyExists(
  admin: SupabaseClient,
  tournamentId: string,
  roundNumber: number
): Promise<boolean> {
  const { data } = await admin
    .from("tournament_rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("round_number", roundNumber)
    .limit(1);

  return !!(data && data.length > 0);
}

/**
 * Guard: atomically advance a tournament's current_round using a conditional
 * update. Only updates if the current_round matches the expected value,
 * preventing race conditions between concurrent cron calls.
 *
 * Returns true if the update was applied (this caller "won" the race),
 * false if another caller already advanced it.
 */
export async function atomicAdvanceRound(
  admin: SupabaseClient,
  tournamentId: string,
  expectedCurrentRound: number,
  nextRound: number
): Promise<boolean> {
  const { data, error } = await admin
    .from("tournaments")
    .update({ current_round: nextRound })
    .eq("id", tournamentId)
    .eq("current_round", expectedCurrentRound)
    .select("id");

  if (error) {
    console.error("[atomicAdvanceRound] error:", error.message);
    return false;
  }

  return !!(data && data.length > 0);
}
