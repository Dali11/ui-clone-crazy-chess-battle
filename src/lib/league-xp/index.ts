import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONFIGS } from "@/lib/platform-config";

/**
 * Monthly XP system (owner redesign 2026-09-26).
 *
 * ONE cycle: the calendar month (CAT). XP accumulates all month long,
 * the leaderboard resets on the 1st, and a lifetime XP total is kept
 * forever. There are no league tiers anymore — the only player LEVEL
 * is Club membership (Non-Club Member vs Club Member, i.e. an active
 * paid membership), which sets the XP rates:
 *
 *   Result | Free game (non-club / club) | Cash game (non-club / club)
 *   Win    |  +3 / +6                    |  +5 / +10
 *   Draw   |  +1 / +2                    |  +2.5 / +5
 *   Loss   |  -1 / -1                    |  +1 / +2
 *
 * Design objective: Free Games -> Join Club -> Play Cash Games ->
 * Earn XP faster -> compete on the monthly XP leaderboard.
 *
 * Cash games are staked battles (incl. their Armageddon deciders).
 * XP is awarded automatically, exactly once per completed game, and
 * never for abandoned/cancelled games.
 */

// CAT is UTC+2 year-round (no DST) — a fixed offset is exact.
export const CAT_OFFSET_MS = 2 * 60 * 60 * 1000;

export type XpGameType = "free" | "cash";
export type XpResult = "win" | "draw" | "loss";
export type PlayerLevel = "non_club" | "club";

export const PLAYER_LEVELS = [
  {
    level: "non_club" as const,
    name: "Non-Club Member",
    short: "Non-Club",
    blurb: "Everyone starts here — earn XP from every completed game.",
  },
  {
    level: "club" as const,
    name: "Club Member",
    short: "Club",
    blurb: "Active CCB Club membership — up to 2x XP on every result.",
  },
];

/**
 * The single XP allocation table (owner spec 2026-09-26). Exact values —
 * no upset bonuses, no multipliers, nothing stacks on top of these.
 */
export const XP_ALLOCATION: Record<XpGameType, Record<XpResult, Record<PlayerLevel, number>>> = {
  free: {
    win: { non_club: 3, club: 6 },
    draw: { non_club: 1, club: 2 },
    loss: { non_club: -1, club: -1 },
  },
  cash: {
    win: { non_club: 5, club: 10 },
    draw: { non_club: 2.5, club: 5 },
    loss: { non_club: 1, club: 2 },
  },
};

/** Exact XP for a completed game (owner spec 2026-09-26). */
export function xpFor(gameType: XpGameType, result: XpResult, level: PlayerLevel): number {
  return XP_ALLOCATION[gameType][result][level];
}

/** A player's level: Club Member while a paid membership is active. */
export function levelFor(membershipUntil?: string | null, now = new Date()): PlayerLevel {
  return !!membershipUntil && new Date(membershipUntil).getTime() > now.getTime()
    ? "club"
    : "non_club";
}

export interface LeagueXpConfig {
  enabled: boolean;
  /** Anti-farming cap on EARNED XP per player per day (losses always deduct). */
  daily_xp_cap: number;
  rewards_enabled: boolean;
  /** Admin kill-switch for monthly payouts (rankings always keep running). */
  monthly_rewards_enabled?: boolean;
  /** How many top players of the month get paid. */
  monthly_top_count?: number;
  /** Owner policy 2026-09-11: open registration — anyone can join. */
  registration_open?: boolean;
  /** yyyy-mm-dd — Season 1 official start. */
  season_start?: string;
  /** yyyy-mm-dd — payouts never pay for cycles starting before this date. */
  payouts_start?: string;
  /** Legacy flat rewards (pre per-tier config) — fallback for monthly payouts. */
  reward_1_mwk: number;
  reward_2_mwk: number;
  reward_3_mwk: number;
  reward_4_mwk: number;
  reward_5_mwk: number;
  /** Monthly top-N payouts, MWK: [1st, 2nd, ...]. */
  monthly_rewards_t1_mwk?: number[];
  /**
   * LEGACY (pre 2026-09-26) weekly/tiered fields — kept so old stored
   * configs and admin edits don't crash, no longer read by the settle.
   */
  rewards_currency?: "MWK" | "USD";
  xp_win?: number;
  xp_draw?: number;
  xp_loss?: number;
  xp_upset_bonus?: number;
  promote_count?: number;
  demote_count?: number;
  tier_cap?: number;
  weekly_payouts_enabled?: boolean;
  tier_moves_enabled?: boolean;
  [key: string]: unknown;
}

export function rewardsArray(c: LeagueXpConfig): number[] {
  return [c.reward_1_mwk, c.reward_2_mwk, c.reward_3_mwk, c.reward_4_mwk, c.reward_5_mwk];
}

/**
 * Monthly top-N payout array (MWK) for the single monthly leaderboard.
 * Falls back to the legacy flat rewards when no monthly array is set.
 */
export function monthlyRewardArray(c: LeagueXpConfig): number[] {
  const arr = c.monthly_rewards_t1_mwk;
  if (Array.isArray(arr) && arr.length > 0 && arr.every((v: unknown) => typeof v === "number" && v >= 0)) {
    return arr as number[];
  }
  return rewardsArray(c);
}

let cachedConfig: { at: number; cfg: LeagueXpConfig } | null = null;

export async function getLeagueXpConfig(admin?: ReturnType<typeof createAdminClient>): Promise<LeagueXpConfig> {
  if (cachedConfig && Date.now() - cachedConfig.at < 60_000) return cachedConfig.cfg;
  try {
    const db = admin ?? createAdminClient();
    const { data } = await db.from("platform_settings").select("config").eq("section", "leagues_xp").maybeSingle();
    const cfg = {
      ...(DEFAULT_CONFIGS.leagues_xp as Record<string, unknown>),
      ...(data?.config || {}),
    } as LeagueXpConfig;
    cachedConfig = { at: Date.now(), cfg };
    return cfg;
  } catch {
    return DEFAULT_CONFIGS.leagues_xp as LeagueXpConfig;
  }
}

/** ISO date (yyyy-mm-01) of the calendar month currently running in CAT. */
export function currentMonthStart(now = new Date()): string {
  const cat = new Date(now.getTime() + CAT_OFFSET_MS);
  return cat.toISOString().slice(0, 7) + "-01";
}

/** ISO date of the 1st of the NEXT month (CAT) — cycle end boundary. */
export function nextMonthStart(now = new Date()): string {
  const cat = new Date(now.getTime() + CAT_OFFSET_MS);
  const y = cat.getUTCFullYear();
  const m = cat.getUTCMonth(); // 0-based
  const nextY = m === 11 ? y + 1 : y;
  const nextM = m === 11 ? 1 : m + 2; // 1-based month number
  return `${nextY}-${String(nextM).padStart(2, "0")}-01`;
}

/** The current XP cycle — the calendar month (owner redesign 2026-09-26). */
export function currentCycleStart(now = new Date()): string {
  return currentMonthStart(now);
}

/** The next XP cycle boundary (1st of next month, CAT). */
export function nextCycleStart(now = new Date()): string {
  return nextMonthStart(now);
}
