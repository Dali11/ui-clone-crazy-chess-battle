import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONFIGS } from "@/lib/platform-config";

/**
 * Duolingo-style XP Leagues.
 *
 * Everyone who joins starts in the Open League (tier 1) — the founding
 * members were Elo-seeded once at launch; tiers move only through
 * weekly results from then on. Players earn XP from every finished PvP
 * game (chess + draughts — bot/computer games never count, so XP cannot
 * be farmed). Standings reset weekly (Monday 00:00 CAT); the settle cron
 * rewards and promotes the top 5 and demotes the bottom 5 of each tier.
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

export interface LeagueXpConfig {
  enabled: boolean;
  xp_win: number;
  xp_draw: number;
  xp_loss: number;
  xp_upset_bonus: number;
  daily_xp_cap: number;
  promote_count: number;
  demote_count: number;
  rewards_enabled: boolean;
  reward_1_mwk: number;
  reward_2_mwk: number;
  reward_3_mwk: number;
  reward_4_mwk: number;
  reward_5_mwk: number;
}

export function rewardsArray(c: LeagueXpConfig): number[] {
  return [c.reward_1_mwk, c.reward_2_mwk, c.reward_3_mwk, c.reward_4_mwk, c.reward_5_mwk];
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

/** ISO date (yyyy-mm-dd) of the Monday 00:00 CAT that starts the current cycle. */
export function currentWeekStart(now = new Date()): string {
  const cat = new Date(now.getTime() + CAT_OFFSET_MS);
  const day = cat.getUTCDay(); // 0 Sun ... 6 Sat
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(cat.getTime() - daysSinceMonday * 86400_000);
  return monday.toISOString().slice(0, 10);
}

/** ISO date of the NEXT Monday 00:00 CAT (cycle end + 1s boundary). */
export function nextWeekStart(now = new Date()): string {
  const cur = currentWeekStart(now);
  const next = new Date(cur + "T00:00:00Z").getTime() + 7 * 86400_000;
  return new Date(next).toISOString().slice(0, 10);
}
