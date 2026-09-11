import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONFIGS } from "@/lib/platform-config";

/**
 * Duolingo-style XP Leagues.
 *
 * Everyone who joins starts in the Open League (tier 1) — the founding
 * members were Elo-seeded once at launch; tiers move only through
 * weekly results from then on. Players earn XP from every finished PvP
 * game (chess + draughts — bot/computer games never count, so XP cannot
 * be farmed). Standings reset weekly (Friday 00:00 CAT); the settle cron
 * rewards and promotes the top 5 and demotes the bottom 5 of each tier
 * (payouts land on Saturday).
 */

// CAT is UTC+2 year-round (no DST) — a fixed offset is exact.
export const CAT_OFFSET_MS = 2 * 60 * 60 * 1000;

export const LEAGUE_TIERS = [
  { tier: 1, name: "Open League", emoji: "🌍" },
  { tier: 2, name: "Amateur League", emoji: "🎯" },
  { tier: 3, name: "Bronze League", emoji: "🥉" },
  { tier: 4, name: "Knights Championship", emoji: "♞" },
  { tier: 5, name: "Premier League", emoji: "🏆" },
] as const;

/** Everyone who joins after launch starts in the Open League (tier 1). */
export const ENTRY_TIER = 1;

/**
 * Flat XP for staked battle games (incl. armageddon deciders).
 * Owner policy 2026-09-10: Win 3 / Draw 1 / Loss 0 — battles already pay
 * cash, so league XP is a small participation bonus and the ladder can't
 * be bought with stakes. Normal PvP games keep cfg rates (10/4/2 + upset).
 */
export const BATTLE_XP = { win: 3, draw: 1, loss: 0 } as const;

export interface LeagueXpConfig {
  enabled: boolean;
  xp_win: number;
  xp_draw: number;
  xp_loss: number;
  xp_upset_bonus: number;
  daily_xp_cap: number;
  promote_count: number;
  demote_count: number;
  tier_cap: number;
  rewards_enabled: boolean;
  reward_1_mwk: number;
  reward_2_mwk: number;
  reward_3_mwk: number;
  reward_4_mwk: number;
  reward_5_mwk: number;
  /** Per-tier weekly payouts (MWK): rewards_tN_mwk = [1st, 2nd, …]. */
  rewards_t1_mwk?: number[];
  rewards_t2_mwk?: number[];
  rewards_t3_mwk?: number[];
  rewards_t4_mwk?: number[];
  rewards_t5_mwk?: number[];
  /** Monthly championship: separate payouts paid on the 1st of each month. */
  monthly_rewards_enabled?: boolean;
  /** Owner policy 2026-09-11: open registration — anyone can join any league. */
  registration_open?: boolean;
  /** yyyy-mm-dd — Season 1 official start (paid challenges league phase). */
  season_start?: string;
  monthly_top_count?: number;
  monthly_rewards_t1_mwk?: number[];
  monthly_rewards_t2_mwk?: number[];
  monthly_rewards_t3_mwk?: number[];
  monthly_rewards_t4_mwk?: number[];
  monthly_rewards_t5_mwk?: number[];
}

export function rewardsArray(c: LeagueXpConfig): number[] {
  return [c.reward_1_mwk, c.reward_2_mwk, c.reward_3_mwk, c.reward_4_mwk, c.reward_5_mwk];
}

/**
 * Configurable weekly payout for a specific league tier (MWK).
 * Falls back to the legacy flat rewards when the tier's array is missing
 * or malformed, so old configs keep working.
 */
export function rewardsForTier(c: LeagueXpConfig, tier: number): number[] {
  const tierRewards = (c as any)[`rewards_t${tier}_mwk`];
  if (Array.isArray(tierRewards) && tierRewards.length > 0 && tierRewards.every((v: unknown) => typeof v === "number" && v >= 0)) {
    return tierRewards as number[];
  }
  return rewardsArray(c);
}

/** All tiers' payout arrays — for UI display (per-league rewards preview). */
export function allTierRewards(c: LeagueXpConfig): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (let t = 1; t <= LEAGUE_TIERS.length; t++) out[t] = rewardsForTier(c, t);
  return out;
}

/**
 * Monthly championship payouts for a league tier (MWK). Falls back to the
 * tier's weekly array when no monthly array is configured.
 */
export function monthlyRewardsForTier(c: LeagueXpConfig, tier: number): number[] {
  const arr = (c as any)[`monthly_rewards_t${tier}_mwk`];
  if (Array.isArray(arr) && arr.length > 0 && arr.every((v: unknown) => typeof v === "number" && v >= 0)) {
    return arr as number[];
  }
  return rewardsForTier(c, tier);
}

/** All tiers' monthly payout arrays — for UI display. */
export function allMonthlyTierRewards(c: LeagueXpConfig): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (let t = 1; t <= LEAGUE_TIERS.length; t++) out[t] = monthlyRewardsForTier(c, t);
  return out;
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

/**
 * ISO date (yyyy-mm-dd) of the FRIDAY 00:00 CAT that starts the current
 * cycle. Owner policy 2026-09-11: XP weeks run Friday to Friday; the
 * settle cron pays out on Saturday.
 */
export function currentWeekStart(now = new Date()): string {
  const cat = new Date(now.getTime() + CAT_OFFSET_MS);
  const day = cat.getUTCDay(); // 0 Sun ... 5 Fri ... 6 Sat
  const daysSinceFriday = (day + 2) % 7;
  const friday = new Date(cat.getTime() - daysSinceFriday * 86400_000);
  return friday.toISOString().slice(0, 10);
}

/** ISO date of the NEXT Friday 00:00 CAT (cycle end + 1s boundary). */
export function nextWeekStart(now = new Date()): string {
  const cur = currentWeekStart(now);
  const next = new Date(cur + "T00:00:00Z").getTime() + 7 * 86400_000;
  return new Date(next).toISOString().slice(0, 10);
}

/** ISO date (yyyy-mm-01) of the calendar month currently running in CAT. */
export function currentMonthStart(now = new Date()): string {
  const cat = new Date(now.getTime() + CAT_OFFSET_MS);
  return cat.toISOString().slice(0, 7) + "-01";
}

/** ISO date of the 1st of the NEXT month (CAT) — month cycle end boundary. */
export function nextMonthStart(now = new Date()): string {
  const cat = new Date(now.getTime() + CAT_OFFSET_MS);
  const y = cat.getUTCFullYear();
  const m = cat.getUTCMonth(); // 0-based
  const nextY = m === 11 ? y + 1 : y;
  const nextM = m === 11 ? 1 : m + 2; // 1-based month number
  return `${nextY}-${String(nextM).padStart(2, "0")}-01`;
}
