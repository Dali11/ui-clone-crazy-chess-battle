/**
 * Abandonment detection: a player who leaves their game silently for
 * ABANDON_SECONDS is auto-resigned so their opponent isn't left staring at
 * the board indefinitely.
 *
 * Presence signal: the game client polls /api/game/timeout-check every 4
 * seconds while it is open on the game page (game-client.tsx). That poll
 * doubles as a heartbeat — each hit refreshes the polling player's
 * white_last_seen / black_last_seen on the games row. If a player closes
 * the app, navigates away, or their device freezes the PWA, their
 * heartbeat goes silent; once that silence passes the threshold the
 * opponent's poll (or the /api/game/timeout cron sweep, when both
 * players are gone) resolves the game as a resignation by the abandoner
 * via the shared finalizeResign flow — identical to tapping Resign.
 */

/** Silence threshold before a player is considered to have abandoned. */
export const ABANDON_SECONDS = 120;

/**
 * Abandonment is enforced from this move onward. Moves 0 and 1 already
 * have their own no-show abort rules (getAbortSeconds / REPLY_ABORT_SECONDS)
 * in both timeout-check and the cron sweep, so this only covers
 * mid-game rage-quits — the case where no existing rule ever fires.
 */
export const ABANDONMENT_MIN_MOVE = 2;

/** Heartbeat writes are throttled to at most one refresh per this window. */
export const HEARTBEAT_REFRESH_MS = 15_000;

export interface PresenceFields {
  move_count: number | null;
  white_last_seen: string | null;
  black_last_seen: string | null;
}

function msSince(raw: string | null, nowMs: number): number | null {
  if (!raw) return null; // never seen since the feature shipped — exempt
  return nowMs - new Date(raw).getTime();
}

/**
 * Returns the color that should be auto-resigned (the abandoner), or null.
 * Used by the cron sweep where either or both players may be gone:
 *   - exactly one stale  -> that player abandoned
 *   - both stale         -> the one who went silent FIRST abandoned
 *     (their opponent demonstrably stayed longer; if that's still a
 *     judgment call, the atomic claim in finalizeResign keeps it safe)
 * A player who has never been seen (NULL last_seen) is never resigned —
 * games created before this feature shipped rely on the clock rules alone.
 */
export function getAbandonedColor(game: PresenceFields, nowMs = Date.now()): "white" | "black" | null {
  if ((game.move_count ?? 0) < ABANDONMENT_MIN_MOVE) return null;

  const whiteAge = msSince(game.white_last_seen, nowMs);
  const blackAge = msSince(game.black_last_seen, nowMs);
  const whiteAbandoned = whiteAge !== null && whiteAge >= ABANDON_SECONDS * 1000;
  const blackAbandoned = blackAge !== null && blackAge >= ABANDON_SECONDS * 1000;

  if (whiteAbandoned && blackAbandoned) {
    // Both gone: older last_seen left first.
    return new Date(game.white_last_seen!).getTime() <= new Date(game.black_last_seen!).getTime()
      ? "white"
      : "black";
  }
  if (whiteAbandoned) return "white";
  if (blackAbandoned) return "black";
  return null;
}

/**
 * Whether the polling player's heartbeat should be written now. Throttled so
 * a 4-second poll cadence doesn't turn into a 4-second write cadence —
 * at most one UPDATE per player per HEARTBEAT_REFRESH_MS, still far
 * tighter than the 120s abandonment threshold.
 */
export function shouldRefreshHeartbeat(lastSeen: string | null, nowMs = Date.now()): boolean {
  if (!lastSeen) return true;
  return nowMs - new Date(lastSeen).getTime() >= HEARTBEAT_REFRESH_MS;
}
