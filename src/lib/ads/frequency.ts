/**
 * Ad frequency router — pure decision logic for when an AdSlot may render.
 *
 * The admin configures caps once (Platform Settings → Ads); every placement
 * mount goes through decideAd() before rendering. Rules, in order:
 *
 *  1. NTH-GAME GATE (results placements only): the end-of-game ad shows
 *     on every Nth finished game, not every game — players who grind
 *     quick matches don't get an ad in their face 30x/hour.
 *  2. DAILY CAP: max impressions per player per day, across ALL
 *     placements (0 = unlimited).
 *  3. HOURLY CAP: max impressions per player per rolling hour, across
 *     all placements.
 *  4. MIN GAP: a cooldown between any two ads, regardless of placement —
 *     nobody sees two banners within seconds of each other.
 *
 * decideAd is PURE (state in → decision + new state out) so the whole
 * policy is unit-testable without a browser. The client persists the
 * state in localStorage; the server never sees it.
 */

export interface AdFrequencyCaps {
  /** Cooldown between any two ads (seconds). 0 = no minimum gap. */
  minGapSec: number;
  /** Max impressions per rolling hour, all placements. 0 = unlimited. */
  hourlyCap: number;
  /** Max impressions per rolling 24h, all placements. 0 = unlimited. */
  dailyCap: number;
  /** Show the results ad only on every Nth finished game. 0/1 = every game. */
  resultsEveryN: number;
}

export interface RouterState {
  /** placement -> impression timestamps (epoch ms), kept pruned to 24h. */
  imp: Record<string, number[]>;
  /** results placement -> finished-game counter (monotonic). */
  games: Record<string, number>;
}

export interface AdDecision {
  show: boolean;
  reason: string;
  /** The updated state — ALWAYS persist this, even when show is false
   *  (the game counter increments on every results-screen mount). */
  state: RouterState;
}

export const RESULTS_PLACEMENTS = [
  "game_results",
  "battle_settlement",
  "draughts_results",
  "challenge_finished",
] as const;

export const isResultsPlacement = (p: string): boolean =>
  (RESULTS_PLACEMENTS as readonly string[]).includes(p);

export function emptyState(): RouterState {
  return { imp: {}, games: {} };
}

function prune(times: number[], now: number): number[] {
  // Corrupt localStorage (null / non-array) must never break the router.
  return (Array.isArray(times) ? times : []).filter(
    (t) => typeof t === "number" && now - t < 24 * 3600_000
  );
}

/**
 * Decide whether this placement mount may render an ad, and produce the
 * next state atomically (game counter + impression recording included).
 */
export function decideAd(input: {
  placement: string;
  caps: AdFrequencyCaps;
  state: RouterState;
  now: number;
}): AdDecision {
  const { placement, caps, now } = input;
  const state: RouterState = {
    imp: Object.fromEntries(
      Object.entries(input.state.imp ?? {}).map(([k, v]) => [k, prune(v ?? [], now)])
    ),
    games: { ...(input.state.games ?? {}) },
  };

  // 1) nth-game gate — the counter counts EVERY finished game, whether
  //    or not an ad is shown (so "every 3rd" really means 3 games).
  if (isResultsPlacement(placement)) {
    const n = caps.resultsEveryN > 1 ? Math.floor(caps.resultsEveryN) : 1;
    const count = (state.games[placement] ?? 0) + 1;
    state.games[placement] = count;
    if (n > 1 && count % n !== 0) {
      return { show: false, reason: `nth-game gate (${count} % ${n})`, state };
    }
  }

  // 2) global impression history across all placements.
  const all = Object.values(state.imp).flat().sort((a, b) => a - b);

  if (caps.dailyCap > 0 && all.length >= caps.dailyCap) {
    return { show: false, reason: `daily cap (${all.length}/${caps.dailyCap})`, state };
  }
  if (caps.hourlyCap > 0) {
    const lastHour = all.filter((t) => now - t < 3600_000);
    if (lastHour.length >= caps.hourlyCap) {
      return { show: false, reason: `hourly cap (${lastHour.length}/${caps.hourlyCap})`, state };
    }
  }
  if (caps.minGapSec > 0 && all.length > 0) {
    const last = all[all.length - 1];
    if (now - last < caps.minGapSec * 1000) {
      return { show: false, reason: `min gap (${Math.round((now - last) / 1000)}s < ${caps.minGapSec}s)`, state };
    }
  }

  // Allow — record the impression.
  (state.imp[placement] ??= []).push(now);
  return { show: true, reason: "ok", state };
}

/* ---------- localStorage persistence (client only) ---------- */

const LS_KEY = "ccb_ad_router_v1";

export function loadState(): RouterState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      imp: parsed.imp ?? {},
      games: parsed.games ?? {},
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: RouterState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // Storage full / private mode — frequency caps degrade to per-session.
  }
}
