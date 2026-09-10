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

// Battle games begin in "waiting" status: clocks frozen, no forfeit
// possible, for up to BATTLE_JOIN_WINDOW_SECONDS from game creation.
// The game flips to "playing" the moment BOTH players are on the board
// (heartbeat early-start in timeout-check), or naturally when the window
// expires (/api/game/state auto-transition + the cron sweep). Challenges
// are often shared asynchronously (posted in a WhatsApp group) and
// accepted while the challenger isn't watching the app — without this
// window their clock, with real money in escrow, burns from the second
// of creation before they even know a game exists.
export const BATTLE_JOIN_WINDOW_SECONDS = 120;

// After the join window (or once both players are present) the game
// progresses naturally: the standard "must move" no-show countdowns.
// Battles keep the 2-minute thresholds (bullet battles get the full 2
// minutes rather than the casual 30s) — they resolve decisively, never
// abort, because stakes are in escrow.
export const BATTLE_FIRST_MOVE_GRACE_SECONDS = 120;
export const BATTLE_REPLY_GRACE_SECONDS = REPLY_ABORT_SECONDS;

/**
 * Returns the abort threshold in seconds for a given time control.
 * Falls back to DEFAULT_ABORT_SECONDS if the time control is unrecognized.
 */
export function getAbortSeconds(timeControl: string): number {
  return FIRST_MOVE_ABORT_SECONDS[timeControl] ?? DEFAULT_ABORT_SECONDS;
}
