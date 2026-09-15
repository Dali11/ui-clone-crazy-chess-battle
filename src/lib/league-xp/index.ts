import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONFIGS } from "@/lib/platform-config";

/**
 * Duolingo-style XP Leagues.
 *
 * Everyone who joins starts in the Open League (tier 1) — the founding
 * members were Elo-seeded once at launch; tiers move only through
 * weekly results from then on. Players earn XP from every finished PvP
 * game (chess + draughts — bot/computer games never count, so XP cannot
 * be farmed). Standings reset every calendar week (1st–7th, 8th–14th,
 * 15th–21st, 22nd–month end); the settle cron pays out the morning after
 * each week closes and promotes the top 5 / demotes the bottom 5.
 */

// CAT is UTC+2 year-round (no DST) — a fixed offset is exact.
export const CAT_OFFSET_MS = 2 * 60 * 60 * 1000;

export const LEAGUE_TIERS = [
  { tier: 1, name: "Open League", emoji: "🌍", ratingBand: "Everyone starts here" },
  { tier: 2, name: "Amateur League", emoji: "🎯", ratingBand: "Developing players" },
  { tier: 3, name: "Bronze League", emoji: "🥉", ratingBand: "Intermediate players" },
  { tier: 4, name: "Knights Championship", emoji: "♞", ratingBand: "Advanced players" },
  { tier: 5, name: "Premier League", emoji: "🏆", ratingBand: "The platform's best" },
] as const;

/** Everyone who joins after launch starts in the Open League (tier 1). */
export const ENTRY_TIER = 1;

/**
 * Flat XP for staked battle games (incl. armageddon deciders).
 * Owner policy 2026-09-10: Win 3 / Draw 1 / Loss 0 — battles already pay
 * cash, so league XP is a small participation bonus and the ladder can't
 * be bought with stakes. Normal PvP games keep cfg rates (10/4/2 + upset).
 */
/**
 * XP for staked battle games (flat rates — no rating bonus). Owner policy
 * 2026-09-11 (reversal same day): a loss costs XP, and weekly standings
 * can go negative — no floor. Makes players fight for the win, and keeps
 * the leaderboard honest about who's actually losing vs never played.
 */
export const BATTLE_XP = { win: 3, draw: 1, loss: -1 } as const;

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
  /**
   * Owner policy 2026-09-11: standard top-N promotion / bottom-N
   * relegation is BUILT IN but OFF while the player base grows —
   * rosters move via the fair-share rebalance only. Flip ON when
   * Premier approaches the tier cap (~1k players). Cash rewards pay
   * the top N every week regardless of this flag.
   */
  tier_moves_enabled?: boolean;
  rewards_enabled: boolean;
  /**
   * Owner policy 2026-09-11: kill-switch for WEEKLY cash payouts only.
   * When false the settle still runs (XP reset, snapshots, rebalance)
   * and players still see reward amounts everywhere — but no wallet
   * credits. Used to skip the first partial week (Season 1 began
   * 2026-09-11 mid-week). Absent = true.
   */
  weekly_payouts_enabled?: boolean;
  /**
   * Date gate (ISO yyyy-mm-dd): the settle pays only for weeks that START
   * on or after this date — the in-code replacement for the old one-time
   * "resume payouts" automation. Season 1's opening week (starting
   * 2026-09-08) plays for free; the first paid close is the settle after
   * the week starting on payouts_start (2026-09-15 → pays 2026-09-22).
   */
  payouts_start?: string | null;
  /**
   * Denomination of the WEEKLY tier reward arrays (owner decision
   * 2026-09-15): "USD" — rewards_tN arrays hold USD amounts, converted
   * to MWK at settle time at the live rate and credited to wallets in
   * MWK. Absent/"MWK" — arrays are MWK amounts as before. Monthly
   * championship arrays remain MWK-denominated for now (feature off).
   */
  rewards_currency?: "MWK" | "USD";
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
/**
 * Weekly payout array for a tier, denominated in cfg.rewards_currency
 * (default MWK). Prefers the currency-agnostic `rewards_tN` key, falls
 * back to the legacy `rewards_tN_mwk` arrays.
 */
export function rewardsForTier(c: LeagueXpConfig, tier: number): number[] {
  const tierRewards = (c as any)[`rewards_t${tier}`] ?? (c as any)[`rewards_t${tier}_mwk`];
  if (Array.isArray(tierRewards) && tierRewards.length > 0 && tierRewards.every((v: unknown) => typeof v === "number" && v >= 0)) {
    return tierRewards as number[];
  }
  return rewardsArray(c);
}

/** Currency the weekly reward arrays are denominated in ("MWK" | "USD"). */
export function rewardsCurrency(c: LeagueXpConfig): "MWK" | "USD" {
  return c.rewards_currency === "USD" ? "USD" : "MWK";
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
 * ISO date (yyyy-mm-dd) of the calendar week start in CAT. Owner policy
 * 2026-09-11: weeks are date-anchored inside each month — the 1st–7th,
 * 8th–14th, 15th–21st and 22nd–month end. The settle cron pays out the
 * morning after each week closes (the 8th, 15th, 22nd and the 1st).
 */
export function currentWeekStart(now = new Date()): string {
  const cat = new Date(now.getTime() + CAT_OFFSET_MS);
  const day = cat.getUTCDate();
  const weekDay = day <= 7 ? 1 : day <= 14 ? 8 : day <= 21 ? 15 : 22;
  return cat.toISOString().slice(0, 8) + String(weekDay).padStart(2, "0");
}

/**
 * ISO date of the next calendar week start (CAT). 1→8→15→22, and the
 * 22nd rolls over to the 1st of the next month (the last week runs to
 * month end, so it can be 7–9 days long).
 */
export function nextWeekStart(now = new Date()): string {
  const cur = currentWeekStart(now);
  if (cur.endsWith("-22")) {
    const d = new Date(cur + "T00:00:00Z");
    const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    return nextMonth.toISOString().slice(0, 10);
  }
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
