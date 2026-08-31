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
  leagues: {
    require_membership: true,
    auto_relegate: true,
    promotion_spots: 5,
    relegation_spots: 5,
    show_kpi_cards: true,
    page_size: 20,
  },
  seasons: {
    auto_create: false,
    default_duration_weeks: 12,
    allow_overlap: false,
    show_kpi_cards: true,
    page_size: 20,
  },
  membership: {
    auto_renew: false,
    grace_period_days: 10,
    require_verification: false,
    monthly_price: 10000,   // MWK — admin-configurable
    yearly_price: 100000,    // MWK — 10 months (2 free)
    currency: "MWK",
    membership_active: true,
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
