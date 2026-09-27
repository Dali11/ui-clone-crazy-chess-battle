/**
 * Affiliate shared server-side data helpers.
 *
 * One place to fetch everything the affiliate subpages need, so the
 * Overview / Dashboard / Team / Earnings pages stay thin and consistent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";

export interface ReferralRow {
  id: string;
  referred_id: string | null;
  referrer_id: string | null;
  status: string | null;
  created_at: string;
  activated_at: string | null;
  activation_condition: string | null;
  commission_amount: number | null;
  commission_paid: boolean | null;
}

export interface LedgerEntry {
  id: string;
  amount: number;
  created_at: string;
}

/** Referral rows for a referrer, newest first. */
export async function getReferrals(
  admin: SupabaseClient,
  referrerId: string
): Promise<ReferralRow[]> {
  // fetchAll(): PostgREST silently caps responses at 1000 rows
  return fetchAll(() =>
    admin
      .from("referrals")
      .select(
        `id, referred_id, referrer_id, status, created_at, activated_at,
         activation_condition, commission_amount, commission_paid`
      )
      .eq("referrer_id", referrerId)
      .order("created_at", { ascending: false })
  );
}

/** Successful affiliate_commission deposits — the earnings ledger. */
export async function getCommissionLedger(
  admin: SupabaseClient,
  userId: string
): Promise<LedgerEntry[]> {
  return fetchAll(() =>
    admin
      .from("deposits")
      .select("id, amount, created_at")
      .eq("user_id", userId)
      .eq("method", "affiliate_commission")
      .eq("status", "success")
      .order("created_at", { ascending: false })
  );
}

export interface AffiliateStats {
  total: number;
  active: number;
  pending: number;
  lifetimeEarned: number;
  earnedThisMonth: number;
  perMonth: number[];
}

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** UTC month key (YYYY-MM) — deterministic, no hydration drift. */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Derive headline stats. `perMonth` covers the last `months` calendar
 * months (UTC), oldest → newest, for the dashboard bar chart.
 */
export function computeStats(
  referrals: ReferralRow[],
  ledger: LedgerEntry[],
  months = 6
): AffiliateStats {
  const active = referrals.filter(
    (r) =>
      r.status === "activated" ||
      r.status === "rewarded" ||
      !!r.activated_at
  ).length;

  const lifetimeEarned = ledger.reduce((s, e) => s + (e.amount || 0), 0);

  // Build the rolling window of month keys, oldest → newest.
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const byMonth = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const e of ledger) {
    const k = monthKey(e.created_at);
    if (byMonth.has(k)) byMonth.set(k, (byMonth.get(k) || 0) + (e.amount || 0));
  }
  const currentKey = keys[keys.length - 1];

  return {
    total: referrals.length,
    active,
    pending: referrals.length - active,
    lifetimeEarned,
    earnedThisMonth: byMonth.get(currentKey) || 0,
    perMonth: keys.map((k) => byMonth.get(k) || 0),
  };
}

/** Month labels for the chart window: e.g. ["May", "Jun", ..., "Oct"]. */
export function chartMonthLabels(months = 6): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(MONTH_LABELS[d.getUTCMonth()]);
  }
  return out;
}
