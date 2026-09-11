/**
 * Platform Config — single source of truth for admin-configurable settings.
 *
 * All admin settings live in the `platform_settings` table (one row per section,
 * config stored as JSONB). This helper reads + caches them so every backend route
 * can enforce the same config the admin panel shows.
 *
 * For sections that historically used a separate table (battle_config,
 * withdrawal_config), the PATCH route syncs writes to those tables too so existing
 * code keeps working during migration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Default configs (used when no row exists yet) ─────────────────────────

export const DEFAULT_CONFIGS: Record<string, Record<string, any>> = {
  overview: {
    show_kpi_cards: true,
    refresh_interval_seconds: 30,
  },
  // Push notifications (WhatsApp-style). Master switch + per-type throttle gaps.
  push: {
    enabled: true,
    dm_gap_min: 0,       // DMs always notify (per sender:recipient pair)
    group_gap_min: 10,   // one group notification per room per player per 10 min
    turn_gap_min: 5,     // "your move" reminders max once per 5 min per game
  },
  // Adsterra ad placements. Scripts are the raw snippet from the Adsterra
  // dashboard (the whole <script>...</script> block). Everything is OFF by
  // default — placements only render when individually toggled here.
  leagues_xp: {
    enabled: true,
    // Owner policy 2026-09-11: Win 3 / Draw 1 / Loss 0 (same as battles).
    xp_win: 3,
    xp_draw: 1,
    xp_loss: -1, // owner policy 2026-09-11 (no floor as of same day): losses deduct XP, weekly standings can go negative
    xp_upset_bonus: 0,
    daily_xp_cap: 100,
    promote_count: 5,
    demote_count: 5, // owner policy 2026-09-11: top promote, bottom demote
    tier_cap: 1000, // max players per league above Open (Open is uncapped)
    rewards_enabled: true,
    // Legacy flat rewards (pre per-tier config) — kept as fallback.
    reward_1_mwk: 2000,
    reward_2_mwk: 1000,
    reward_3_mwk: 500,
    reward_4_mwk: 250,
    reward_5_mwk: 100,
    // Per-league weekly payouts, MWK. rewards_tN_mwk = [1st, 2nd, 3rd, ...]
    // for tier N. Higher leagues pay more — climb for bigger rewards.
    rewards_t1_mwk: [2000, 1000, 500, 250, 100],
    rewards_t2_mwk: [3000, 1500, 750, 400, 150],
    rewards_t3_mwk: [5000, 2500, 1200, 600, 250],
    rewards_t4_mwk: [8000, 4000, 2000, 1000, 400],
    rewards_t5_mwk: [15000, 8000, 4000, 2000, 1000],
    // Monthly championship (calendar month, settled on the 1st)
    monthly_rewards_enabled: true,
    monthly_top_count: 5,
    // Owner policy 2026-09-11: open registration, anyone can join any league.
    registration_open: true,
    // Season 1 started Fri 2026-09-11 00:00 CAT (owner policy). Monthly
    // championships never count XP earned before this date.
    season_start: "2026-09-11",
    monthly_rewards_t1_mwk: [8000, 4000, 2000, 1000, 500],
    monthly_rewards_t2_mwk: [12000, 6000, 3000, 1600, 600],
    monthly_rewards_t3_mwk: [20000, 10000, 5000, 2400, 1000],
    monthly_rewards_t4_mwk: [32000, 16000, 8000, 4000, 1600],
    monthly_rewards_t5_mwk: [60000, 32000, 16000, 8000, 4000],
  },
  ads: {
    enabled: false, // global kill switch
    lobby_enabled: false,
    lobby_script: "",
    spectate_enabled: false,
    spectate_script: "",
    game_results_enabled: false,
    game_results_script: "",
    battle_settlement_enabled: false,
    battle_settlement_script: "",
    draughts_results_enabled: false,
    draughts_results_script: "",
    leagues_enabled: false,
    leagues_script: "",
    leagues_inline_enabled: false,
    leagues_inline_script: "",
    // Frequency router caps (per player, localStorage-tracked):
    // min gap between any two ads, max per rolling hour / 24h, and the
    // end-of-game ad shows only on every Nth finished game.
    frequency_min_gap_sec: 90,
    frequency_hourly_cap: 4,
    frequency_daily_cap: 12,
    results_every_n: 3,
  },
  deposits: {
    enabled: true,
    auto_credit: false,
    min_amount: 1000,
    max_amount: 10_000_000,
    require_approval_above: 50_000,
    show_kpi_cards: true,
    default_filter: "pending",
    page_size: 20,
  },
  withdrawals: {
    enabled: true,
    auto_approve: false,
    min_amount: 10_000,
    max_amount: 500_000,
    daily_limit: 100_000,
    processing_fee_pct: 0,
    withdrawal_fee: 0,
    show_kpi_cards: true,
    default_filter: "pending",
    page_size: 20,
  },
  battles: {
    enabled: true,
    min_stake: 500,
    max_stake: 50_000,
    platform_fee_pct: 10,
    auto_cancel_minutes: 10,
    stake_levels: [500, 1000, 2000, 5000, 10000],
    show_kpi_cards: true,
    page_size: 20,
  },
  games: {
    allow_spectators: true,
    max_concurrent_games: 5,
    show_kpi_cards: true,
    default_filter: "all",
    page_size: 20,
  },
  users: {
    allow_signup: true,
    require_email_verification: false,
    default_is_admin: false,
    show_kpi_cards: true,
    page_size: 20,
  },
  tournaments: {
    require_approval: true,
    auto_approve_below_players: 0,
    max_players: 128,
    // ── Pricing ──
    default_entry_fee: 1000,        // base currency (MWK)
    max_entry_fee: 5000,            // cap for user-created tournaments
    min_entry_fee: 0,               // 0 = free tournaments allowed
    default_creator_profit_pct: 10, // default house/creator cut on paid tournaments
    // ── Auto-create defaults (weekly cron) ──
    auto_create_time_control: "rapid",
    auto_create_initial_minutes: 10,
    auto_create_increment_seconds: 5,
    auto_create_max_players: 128,
    auto_create_min_players: 6,
    auto_create_creator_profit_pct: 10,
    show_kpi_cards: true,
    page_size: 20,
  },
  verification: {
    require_id_document: true,
    require_selfie: false,
    auto_approve_trusted: false,
    show_kpi_cards: true,
    page_size: 20,
  },
  logs: {
    retention_days: 90,
    page_size: 50,
    show_kpi_cards: true,
  },
};

// ─── Legacy table sync map ────────────────────────────────────────────────

export const LEGACY_SYNC: Record<string, { table: string; fieldMap: Record<string, string> }> = {
  withdrawals: {
    table: "withdrawal_config",
    fieldMap: {
      auto_approve: "auto_approve_enabled",
      min_amount: "min_withdrawal",
      max_amount: "max_withdrawal",
      daily_limit: "daily_withdrawal_limit",
      processing_fee_pct: "processing_fee_pct",
      withdrawal_fee: "withdrawal_fee",
    },
  },
  battles: {
    table: "battle_config",
    fieldMap: {
      enabled: "enabled",
      platform_fee_pct: "platform_fee_pct",
    },
  },
};

// ─── Helper: read one section's config ────────────────────────────────────

export async function getPlatformConfig(
  admin: SupabaseClient,
  section: string
): Promise<Record<string, any>> {
  const { data } = await admin
    .from("platform_settings")
    .select("config")
    .eq("section", section)
    .limit(1)
    .single();

  return { ...DEFAULT_CONFIGS[section], ...(data?.config || {}) };
}

// ─── Helper: read multiple sections at once ─────────────────────────────

export async function getPlatformConfigs(
  admin: SupabaseClient,
  sections: string[]
): Promise<Record<string, Record<string, any>>> {
  const { data } = await admin
    .from("platform_settings")
    .select("section, config")
    .in("section", sections);

  const result: Record<string, Record<string, any>> = {};
  for (const section of sections) {
    const row = data?.find((r) => r.section === section);
    result[section] = { ...DEFAULT_CONFIGS[section], ...(row?.config || {}) };
  }
  return result;
}

// ─── Helper: sync to legacy table on save ────────────────────────────────

export async function syncLegacyTable(
  admin: SupabaseClient,
  section: string,
  config: Record<string, any>,
  userId: string
): Promise<void> {
  const legacy = LEGACY_SYNC[section];
  if (!legacy) return;

  const updates: Record<string, any> = { updated_at: new Date().toISOString(), updated_by: userId };
  for (const [platformKey, legacyKey] of Object.entries(legacy.fieldMap)) {
    if (config[platformKey] !== undefined) {
      updates[legacyKey] = config[platformKey];
    }
  }

  if (Object.keys(updates).length <= 2) return;

  const { data: existing } = await admin.from(legacy.table).select("id").limit(1).single();
  if (existing?.id) {
    await admin.from(legacy.table).update(updates).eq("id", existing.id);
  } else {
    await admin.from(legacy.table).insert(updates);
  }
}
