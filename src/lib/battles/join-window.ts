import { createAdminClient } from "@/lib/supabase/admin";
import { BATTLE_JOIN_WINDOW_SECONDS } from "@/lib/game/abort-config";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Battle join window — staked games (quick match or challenge) are created
 * in "waiting" status: clocks frozen (clock burn is measured from
 * last_move_at, which is only set when the game flips to "playing") and no
 * no-show forfeit can happen, for up to BATTLE_JOIN_WINDOW_SECONDS.
 *
 * The game starts EARLY the moment both players are on the board (their
 * 4s timeout-check polls are heartbeats — timeout-check flips it as soon
 * as both are fresh), or NATURALLY when the window expires (/api/game/state
 * auto-transition when polled, plus a bulk flip in the timeout cron sweep
 * in case nobody has the page open). After that the game progresses with
 * the standard no-show/clock rules.
 *
 * Fail-open: if this update fails the game simply stays "playing" — the
 * pre-window behavior — rather than blocking the battle from starting.
 */
export async function applyBattleJoinWindow(admin: AdminClient, gameId: string) {
  try {
    const { error } = await admin
      .from("games")
      .update({
        status: "waiting",
        scheduled_start: new Date(Date.now() + BATTLE_JOIN_WINDOW_SECONDS * 1000).toISOString(),
      })
      .eq("id", gameId);
    if (error) console.error("Battle join window update failed:", error);
  } catch (e) {
    console.error("Battle join window error:", e);
  }
}
