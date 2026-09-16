/**
 * Shared domain logic for the Admin Command Centre (Phase 1).
 *
 * Pure functions only — the API routes fetch raw rows and run them
 * through these, and the unit tests exercise this module directly.
 * Revenue definitions follow the existing platform truth in
 * src/lib/revenue/sweep.ts: platform revenue is the battle rake,
 * withdrawal fees, and paid membership/ad purchases. Deposits and
 * gross transaction volume are NOT revenue.
 */

import { makeUsdConverter, type UsdConverter } from "./usd";

// ── Revenue streams ─────────────────────────────────────────────────────────

export const REVENUE_STREAMS = [
  "battles",
  "tournaments",
  "memberships",
  "ads",
  "withdrawal_fees",
] as const;
export type RevenueStream = (typeof REVENUE_STREAMS)[number];

export const STREAM_LABELS: Record<RevenueStream, string> = {
  battles: "Battles (rake)",
  tournaments: "Tournaments (creator profit)",
  memberships: "Memberships",
  ads: "Ads",
  withdrawal_fees: "Withdrawal Fees",
};

/** deposits rows that represent real money entering the platform from outside. */
export const MONEY_IN_METHODS = [
  "mobile_money",
  "card",
  "bank_transfer",
  "pawapay",
  "paychangu",
] as const;

/** deposits rows that carry platform revenue (amount is MWK-normalized). */
export const REVENUE_METHODS = {
  memberships: "membership_purchase",
  ads: "ad_purchase",
  tournaments: "tournament_creator_profit",
} as const;

// ── Periods ────────────────────────────────────────────────────────────────

export type RangePreset = "today" | "7d" | "30d" | "90d" | "12m" | "custom";

export interface Period {
  fromISO: string; // inclusive
  toISO: string; // exclusive
  prevFromISO: string;
  prevToISO: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the reporting window plus the immediately-preceding window of
 * equal length (for % change). `from`/`to` are ISO date strings (YYYY-MM-DD
 * or full ISO); the returned window is [start, start + length).
 */
export function computePeriod(
  preset: RangePreset,
  fromInput?: string | null,
  toInput?: string | null,
  now: Date = new Date()
): Period {
  const nowMs = now.getTime();
  let fromMs: number;
  let toMs: number;

  switch (preset) {
    case "today":
      fromMs = startOfDay(nowMs);
      toMs = startOfDay(nowMs) + DAY_MS;
      break;
    case "7d":
      toMs = startOfDay(nowMs) + DAY_MS;
      fromMs = toMs - 7 * DAY_MS;
      break;
    case "30d":
      toMs = startOfDay(nowMs) + DAY_MS;
      fromMs = toMs - 30 * DAY_MS;
      break;
    case "90d":
      toMs = startOfDay(nowMs) + DAY_MS;
      fromMs = toMs - 90 * DAY_MS;
      break;
    case "12m":
      toMs = startOfDay(nowMs) + DAY_MS;
      fromMs = toMs - 365 * DAY_MS;
      break;
    case "custom": {
      fromMs = fromInput ? startOfDay(Date.parse(fromInput)) : startOfDay(nowMs);
      toMs = toInput ? startOfDay(Date.parse(toInput)) + DAY_MS : startOfDay(nowMs) + DAY_MS;
      if (!Number.isFinite(fromMs)) fromMs = startOfDay(nowMs) - 30 * DAY_MS;
      if (!Number.isFinite(toMs) || toMs <= fromMs) toMs = fromMs + DAY_MS;
      break;
    }
    default: {
      // Unknown preset — safe 30-day fallback
      toMs = startOfDay(nowMs) + DAY_MS;
      fromMs = toMs - 30 * DAY_MS;
    }
  }

  const len = toMs - fromMs;
  return {
    fromISO: new Date(fromMs).toISOString(),
    toISO: new Date(toMs).toISOString(),
    prevFromISO: new Date(fromMs - len).toISOString(),
    prevToISO: new Date(fromMs).toISOString(),
  };
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** % change vs previous period; null when there is no baseline (prev = 0). */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// ── Status normalization ────────────────────────────────────────────────────

export type FeedStatus = "completed" | "pending" | "failed" | "cancelled";

export function depositStatus(status: string | null | undefined): FeedStatus {
  switch (status) {
    case "success":
      return "completed";
    case "pending":
      return "pending";
    case "failed":
      return "failed";
    default:
      return "cancelled"; // cancelled / unknown
  }
}

export function withdrawalStatus(status: string | null | undefined): FeedStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "pending":
    case "approved":
      return "pending";
    case "failed":
    case "rejected":
      return "failed";
    default:
      return "cancelled";
  }
}

// ── Chart bucketing ────────────────────────────────────────────────────────

export type Granularity = "day" | "month";

/** Daily buckets up to ~120 days, monthly beyond that. */
export function chooseGranularity(fromMs: number, toMs: number): Granularity {
  return toMs - fromMs > 120 * DAY_MS ? "month" : "day";
}

export function bucketKey(dateISO: string, g: Granularity): string {
  const d = new Date(dateISO);
  if (g === "month") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

/** Ordered bucket keys covering [from, to) — empty buckets stay at zero. */
export function bucketRange(fromISO: string, toISO: string, g: Granularity): string[] {
  const keys: string[] = [];
  const start = new Date(fromISO).getTime();
  const end = new Date(toISO).getTime();
  if (g === "month") {
    const cursor = new Date(start);
    cursor.setUTCDate(1);
    while (cursor.getTime() < end) {
      keys.push(bucketKey(cursor.toISOString(), "month"));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    for (let t = startOfDay(start); t < end; t += DAY_MS) {
      keys.push(new Date(t).toISOString().slice(0, 10));
    }
  }
  return keys;
}

// ── Market classification ───────────────────────────────────────────────────

/**
 * The supported-market list for the Markets table. Derived from the
 * signup country list — the platform's actual go-to-market footprint —
 * unioned at query time with any countries seen in production data.
 */
export const SIGNUP_MARKETS = [
  "MW", "ZM", "KE", "NG", "ZA", "GH", "TZ", "UG", "ZW", "BW", "NA",
  "RW", "CM", "EG", "ET", "MA", "SN",
] as const;

// ── Battle rake ───────────────────────────────────────────────────────────

/**
 * Platform rake for one settled decisive battle, in the same whole units
 * as the battle row. Matches sweep.ts's battleFee (pot − payout).
 */
export function battleRakeUnits(battle: {
  pot?: number | null;
  stake?: number | null;
  winner_payout?: number | null;
}): number {
  const pot = Number(battle.pot ?? (battle.stake ?? 0) * 2);
  const payout = Number(battle.winner_payout ?? 0);
  return Math.max(0, pot - payout);
}

// ── Fetch helper ───────────────────────────────────────────────────────────

/**
 * Paginate a PostgREST query to exhaustion (Supabase caps single
 * responses). Page size 1000, hard cap 60k rows as a runaway guard.
 * The query builder passed in already has select/filters applied.
 */
export async function fetchAll(
  buildQuery: (page: number) => any,
  pageSize = 1000,
  maxRows = 60000
): Promise<any[]> {
  const out: any[] = [];
  for (let page = 0; page * pageSize < maxRows; page++) {
    const { data, error } = await buildQuery(page).range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(error.message || "fetchAll failed");
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

// ── Country helpers ────────────────────────────────────────────────────────

export function normalizeCountry(code: string | null | undefined): string | null {
  const c = (code || "").trim().toUpperCase();
  return c && c !== "OTHER" ? c : null;
}

/** Currency for a wallet/amount from a country code. */
export function walletCurrencyForCountry(
  country: string | null | undefined,
  countryCurrency: Record<string, string>,
  fallback = "MWK"
): string {
  return countryCurrency[normalizeCountry(country) || ""] || fallback;
}

export { makeUsdConverter };
export type { UsdConverter };
