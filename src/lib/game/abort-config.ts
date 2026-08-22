// First-move abort thresholds in seconds, by base time control.
// If no move is made within this window, the game is aborted (no rating
// change, no winner). Tournament and battle games are never aborted —
// they always resolve decisively.
export const FIRST_MOVE_ABORT_SECONDS: Record<string, number> = {
  bullet: 10,
  blitz: 15,
  rapid: 20,
  classical: 30,
};

// Default fallback if time_control is unrecognized
export const DEFAULT_ABORT_SECONDS = 15;

/**
 * Returns the abort threshold in seconds for a given time control.
 * Falls back to DEFAULT_ABORT_SECONDS if the time control is unrecognized.
 */
export function getAbortSeconds(timeControl: string): number {
  return FIRST_MOVE_ABORT_SECONDS[timeControl] ?? DEFAULT_ABORT_SECONDS;
}
