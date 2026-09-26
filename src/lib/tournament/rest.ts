// ── Rest-between-rounds logic ────────────────────────────────────────────────
// Tournaments schedule the next round's games at now + rest minutes. The
// `rest_minutes` column is optional: when a creator leaves it unset the
// fallback below derives a sensible rest from the time control, instead of
// the old hard-coded `|| 1` that gave even 30+0 classical tournaments just
// one minute between rounds.
//
// Larger thinking time needs larger rest: a blitz player has usually
// finished their post-game glance at the board in a minute, while a
// classical player expects a few minutes to reset. Derived defaults:
//   bullet (<=2 min)      -> 1 min rest
//   blitz  (3-5 min)      -> 2 min rest
//   rapid  (6-15 min)     -> 3 min rest
//   classical (>=16 min)  -> 5 min rest
// Explicit values (1..30) always win over the derivation.

export const MIN_REST_MINUTES = 1;
export const MAX_REST_MINUTES = 30;

export interface RestSource {
  // `unknown` on purpose: tournament rows come from Postgres/JSON where the
  // column can be number, null, or (in bad payloads) a string — clamp and
  // derive defensively.
  rest_minutes?: unknown;
  initial_minutes?: unknown;
}

/** Clamp a creator-supplied rest value into the allowed 1..30 range. */
export function clampRestMinutes(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_REST_MINUTES, Math.max(MIN_REST_MINUTES, Math.round(n)));
}

/** Fallback rest derived from the tournament's thinking time. */
export function derivedRestMinutes(initialMinutes: unknown): number {
  const m = Number(initialMinutes);
  if (!Number.isFinite(m) || m <= 0) return MIN_REST_MINUTES;
  if (m <= 2) return 1;
  if (m <= 5) return 2;
  if (m <= 15) return 3;
  return 5;
}

/**
 * The single source of truth for how long players rest between rounds:
 * an explicit valid rest_minutes wins, otherwise derive from time control.
 */
export function getRestMinutes(t: RestSource): number {
  const explicit = clampRestMinutes(t.rest_minutes);
  if (explicit !== null) return explicit;
  return derivedRestMinutes(t.initial_minutes);
}
