import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExchangeRate } from "@/lib/geo/fx";
import { loadUsdConverter, roundUsd } from "@/lib/finance/usd";
import {
  fetchAll,
  normalizeCountry,
  REVENUE_METHODS,
  battleRakeUnits,
} from "@/lib/finance/commandcentre";
import { COUNTRY_CURRENCY } from "@/lib/geo/currency-map";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/markets — Phase 2 country-level finance.
 *
 * For every pawaPay market (signup footprint unioned with countries seen
 * in production data): deposits, withdrawals, transaction volume, revenue
 * (battle rake + memberships + ads + tournament entries + withdrawal
 * fees), player balances, withdrawal fees collected, transaction counts
 * with success/failure split, and the live reconciliation status (open
 * exception count).
 *
 * Global reporting stays USD; the UI shows the local currency alongside
 * in the per-country drilldown (each row carries its currency + the
 * local-currency aggregates).
 *
 * Query: ?country=MW → drilldown detail for one market.
 * READ-ONLY. Admin-only (401/403).
 */

interface MarketAgg {
  code: string;
  currency: string;
  depositsUsd: number;
  withdrawalsUsd: number;
  volumeUsd: number;
  revenueUsd: number;
  feesUsd: number;
  playerBalancesUsd: number;
  txCount: number;
  successfulTx: number;
  failedTx: number;
  players: Set<string>;
  openExceptions: number;
  // local-currency aggregates for the drilldown
  depositsLocal: number | null;
  withdrawalsLocal: number | null;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const drill = (url.searchParams.get("country") || "").toUpperCase() || null;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const since = from
      ? new Date(`${from}T00:00:00`).toISOString()
      : new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const until = to ? new Date(`${to}T23:59:59`).toISOString() : new Date().toISOString();

    const fx = await loadUsdConverter(admin, async () => getExchangeRate("MWK", "USD"));

    // ── Fetch ───────────────────────────────────────────────────────────
    const MONEY_IN = ["mobile_money", "card", "bank_transfer", "pawapay", "paychangu"];
    const REVENUE_METHODS_ALL = [
      REVENUE_METHODS.memberships, REVENUE_METHODS.ads, "tournament_entry",
    ];

    const deposits = await fetchAll((pg) =>
      admin.from("deposits")
        .select("id, user_id, amount, amount_local, currency, country, method, status, created_at")
        .in("method", [...MONEY_IN, ...REVENUE_METHODS_ALL])
        .gte("created_at", since).lte("created_at", until)
        .range(pg * 1000, pg * 1000 + 999), 1000, 20000);
    const withdrawals = await fetchAll((pg) =>
      admin.from("withdrawals")
        .select("id, user_id, amount, amount_local, fee, currency, country, status, created_at")
        .gte("created_at", since).lte("created_at", until)
        .range(pg * 1000, pg * 1000 + 999), 1000, 20000);
    const battles = await fetchAll((pg) =>
      admin.from("battles")
        .select("id, white_player_id, winner_id, pot, stake, winner_payout, settled, status, completed_at")
        .eq("settled", true).eq("status", "completed")
        .not("winner_id", "is", null)
        .gte("completed_at", since).lte("completed_at", until)
        .range(pg * 1000, pg * 1000 + 999), 1000, 20000);

    const profiles = await fetchAll((pg) =>
      admin.from("profiles")
        .select("id, country, wallet_balance")
        .range(pg * 1000, pg * 1000 + 999), 1000, 20000);
    const profileCountry = new Map<string, string | null>();
    for (const p of profiles) profileCountry.set(p.id, normalizeCountry(p.country));

    const { data: exceptionsByCountry } = await admin
      .from("reconciliation_exceptions")
      .select("country, severity")
      .eq("resolved", false)
      .limit(2000);

    // ── Aggregate per market ─────────────────────────────────────────────
    const countryOf = (userId: string | null | undefined, fallback?: string | null): string | null =>
      normalizeCountry(fallback) || (userId ? profileCountry.get(userId) ?? null : null);

    const markets = new Map<string, MarketAgg>();
    const marketOf = (code: string): MarketAgg => {
      let m = markets.get(code);
      if (!m) {
        m = {
          code, currency: COUNTRY_CURRENCY[code] || "USD",
          depositsUsd: 0, withdrawalsUsd: 0, volumeUsd: 0, revenueUsd: 0, feesUsd: 0,
          playerBalancesUsd: 0, txCount: 0, successfulTx: 0, failedTx: 0,
          players: new Set(), openExceptions: 0, depositsLocal: null, withdrawalsLocal: null,
        };
        markets.set(code, m);
      }
      return m;
    };

    for (const d of deposits) {
      const code = countryOf(d.user_id, d.country) || "ZZ";
      const m = marketOf(code);
      m.txCount += 1;
      if (d.status === "success") m.successfulTx += 1;
      else if (d.status === "failed") m.failedTx += 1;
      if (d.status !== "success") continue;

      const usd = fx.usdFromMwk(Math.abs(Number(d.amount || 0)));
      const isMoneyIn = MONEY_IN.includes(d.method);
      const isRevenue = REVENUE_METHODS_ALL.includes(d.method);

      if (isMoneyIn) {
        m.depositsUsd += usd ?? 0;
        m.volumeUsd += usd ?? 0;
        const local = Number(d.amount_local || 0);
        if (d.currency === m.currency) m.depositsLocal = (m.depositsLocal || 0) + local;
      }
      if (isRevenue) {
        m.revenueUsd += usd ?? 0;
        m.volumeUsd += usd ?? 0;
      }
      if (d.user_id) m.players.add(d.user_id);
    }

    for (const w of withdrawals) {
      const code = countryOf(w.user_id, w.country) || "ZZ";
      const m = marketOf(code);
      m.txCount += 1;
      if (w.status === "completed") m.successfulTx += 1;
      else if (w.status === "failed" || w.status === "rejected") m.failedTx += 1;

      const usd = fx.toUsd(Number(w.amount || 0), w.currency || "MWK") ?? 0;
      if (w.status === "completed") {
        m.withdrawalsUsd += usd;
        m.volumeUsd += usd;
        const feeUsd = fx.toUsd(Math.max(0, Number(w.fee || 0)), w.currency || "MWK") ?? 0;
        m.revenueUsd += feeUsd;
        m.feesUsd += feeUsd;
        const local = Number(w.amount_local || 0);
        if (w.currency === m.currency) m.withdrawalsLocal = (m.withdrawalsLocal || 0) + local;
      }
      if (w.user_id) m.players.add(w.user_id);
    }

    for (const b of battles) {
      const rake = battleRakeUnits(b);
      if (rake <= 0) continue;
      const code = countryOf(b.white_player_id) || "ZZ";
      const m = marketOf(code);
      // Battle stake/pot/winner_payout are always stored in MWK — the
      // platform's internal ledger unit — regardless of the player's
      // country (see challenge/create/route.ts). Using the player's
      // LOCAL currency here (e.g. ZMW for Zambia) instead of MWK was
      // the bug: it divided an MWK amount by a ZMW rate, inflating
      // non-Malawi revenue by ~70-100x. Always normalize via MWK.
      m.revenueUsd += fx.usdFromMwk(rake) ?? 0;
      if (b.white_player_id) m.players.add(b.white_player_id);
    }

    // Player balances per market (stored balances converted to USD).
    for (const p of profiles) {
      const code = normalizeCountry(p.country);
      if (!code || !markets.has(code)) continue;
      const m = markets.get(code)!;
      m.playerBalancesUsd += fx.toUsd(Number(p.wallet_balance || 0), COUNTRY_CURRENCY[code] || "MWK") ?? 0;
      m.players.add(p.id);
    }

    for (const e of exceptionsByCountry || []) {
      const code = normalizeCountry(e.country);
      if (code && markets.has(code)) markets.get(code)!.openExceptions += 1;
    }

    // ── Shape the response ──────────────────────────────────────────────
    const rows = [...markets.values()]
      .map((m) => ({
        code: m.code,
        currency: m.currency,
        deposits: roundUsd(m.depositsUsd),
        withdrawals: roundUsd(m.withdrawalsUsd),
        volume: roundUsd(m.volumeUsd),
        revenue: roundUsd(m.revenueUsd),
        fees: roundUsd(m.feesUsd),
        playerBalances: roundUsd(m.playerBalancesUsd),
        players: m.players.size,
        txCount: m.txCount,
        successfulTx: m.successfulTx,
        failedTx: m.failedTx,
        openExceptions: m.openExceptions,
        reconciliationStatus: m.openExceptions === 0 ? "clean" : m.openExceptions > 2 ? "needs_review" : "minor",
        depositsLocal: m.depositsLocal,
        withdrawalsLocal: m.withdrawalsLocal,
      }))
      .sort((a, b) => b.volume - a.volume);

    if (drill) {
      const row = rows.find((r) => r.code === drill);
      if (!row) return NextResponse.json({ error: "Market not found" }, { status: 404 });
      return NextResponse.json({ market: row, from: since, to: until });
    }

    return NextResponse.json({ markets: rows, from: since, to: until });
  } catch (e: any) {
    console.error("Phase 2 markets error:", e);
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}
