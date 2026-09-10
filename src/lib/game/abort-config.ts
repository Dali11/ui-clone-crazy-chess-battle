// First-move abort thresholds in seconds, by base time control.
// If no move is made within this window, the game is aborted (no rating
// change, no winner). Tournament and battle games are never aborted —
// they always resolve decisively.
//
// Bullet (1+0) is the shortest format — 30s is enough to tell if someone
// is actually there. Blitz and Rapid get 2 minutes since the games are
// longer and players may need a moment to settle in.
export const FIRST_MOVE_ABORT_SECONDS: Record<string, number> = {
  bullet: 30,
  blitz: 120,
  rapid: 120,
  classical: 120,
};

// Default fallback if time_control is unrecognized
export const DEFAULT_ABORT_SECONDS = 120;

// Black's first reply: how long the second player has to answer White's
// opening move before the game resolves. Casual games abort (no result),
// battles settle decisively (stakes in escrow). Matches the "must move"
// countdown shown in the game UI.
export const REPLY_ABORT_SECONDS = 120;

// Battles hold real money in escrow, so how long a no-show grace lasts
// matters more than for a casual game. Challenges are often shared
// asynchronously (e.g. posted in a WhatsApp group) — the challenger may
// not be watching the app at all when someone accepts and the game
// starts, so the standard 30s-2min casual thresholds are too tight and
// were burning people's stakes before they ever saw the game existed.
// Wider grace at move 0/1 gives real time for the in-app notification
// (and the ActiveBattleWatcher redirect, if a tab is open anywhere) to
// actually reach the player before the clock forfeits their stake.
export const BATTLE_FIRST_MOVE_GRACE_SECONDS = 300; // 5 minutes
export const BATTLE_REPLY_GRACE_SECONDS = 180; // 3 minutes

/**
 * Returns the abort threshold in seconds for a given time control.
 * Falls back to DEFAULT_ABORT_SECONDS if the time control is unrecognized.
 */
export function getAbortSeconds(timeControl: string): number {
  return FIRST_MOVE_ABORT_SECONDS[timeControl] ?? DEFAULT_ABORT_SECONDS;
}
