import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExchangeRate } from "@/lib/geo/fx";
import { loadUsdConverter, roundUsd, type UsdConverter } from "@/lib/finance/usd";
import {
  MONEY_IN_METHODS,
  REVENUE_METHODS,
  SIGNUP_MARKETS,
  bucketKey,
  bucketRange,
  battleRakeUnits,
  changePct,
  chooseGranularity,
  computePeriod,
  fetchAll,
  normalizeCountry,
  type Period,
  type RangePreset,
  type RevenueStream,
} from "@/lib/finance/commandcentre";
import { COUNTRY_CURRENCY } from "@/lib/geo/currency-map";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/overview
 *
 * Phase 1 Command Centre overview: financial KPIs with previous-period
 * deltas, revenue by stream, chart series, market table and
 * needs-attention items. READ-ONLY — no financial controls here.
 *
 * Definitions (USD reporting currency):
 *   Total Revenue      = battle rake + platform tournament profit +
 *                        memberships + ads + withdrawal fees
 *   Transaction Volume= successful money-in deposits + completed withdrawals
 *   Total Deposits     = successful money-in deposits (gross, NOT revenue)
 *   Total Withdrawals  = completed withdrawals (gross)
 *   Player Balances    = live snapshot of all wallets converted to USD
 *   Pending Withdrawals= open (pending/approved) withdrawal requests
 *
 * Historical USD values use each transaction's recorded FX (deposits
 * rows are MWK-normalized at pay time; wallet-currency amounts convert
 * through the daily-cached rate table).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    // ── Auth (same pattern as every admin route) ──────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // ── Period ────────────────────────────────────────────────────────
    const url = new URL(req.url);
    const presetRaw = (url.searchParams.get("range") || "30d") as RangePreset;
    const preset: RangePreset = ["today", "7d", "30d", "90d", "12m", "custom"].includes(presetRaw)
      ? presetRaw
      : "30d";
    const period = computePeriod(
      preset,
      url.searchParams.get("from"),
      url.searchParams.get("to")
    );

    // ── FX ────────────────────────────────────────────────────────────
    const fx: UsdConverter = await loadUsdConverter(admin, async () =>
      getExchangeRate("MWK", "USD")
    );

    // ── Raw fetches ────────────────────────────────────────────────────
    const depositsSelect = "id, user_id, amount, amount_local, currency, country, method, status, created_at";
    const withdrawalsSelect = "id, user_id, amount, amount_local, fee, currency, country, status, created_at, processed_at";
    const battlesSelect = "id, white_player_id, black_player_id, winner_id, pot, stake, winner_payout, completed_at";
    const revenueMethods = Object.values(REVENUE_METHODS);

    const within = (col: string, fromISO: string, toISO: string) =>
      (q: any) => q.gte(col, fromISO).lt(col, toISO);

    const fetchDepositsBetween = async (fromISO: string, toISO: string, methods: string[]) =>
      fetchAll((page) =>
        within("created_at", fromISO, toISO)(
          admin.from("deposits").select(depositsSelect).in("method", methods)
        ).order("created_at", { ascending: true }).range(page * 1000, page * 1000 + 999)
      );

    const fetchWithdrawalsBetween = async (fromISO: string, toISO: string) =>
      fetchAll((page) =>
        within("processed_at", fromISO, toISO)(
          admin.from("withdrawals").select(withdrawalsSelect).eq("status", "completed")
        ).order("processed_at", { ascending: true }).range(page * 1000, page * 1000 + 999)
      );

    const fetchBattlesBetween = async (fromISO: string, toISO: string) =>
      fetchAll((page) =>
        within("completed_at", fromISO, toISO)(
          admin
            .from("battles")
            .select(battlesSelect)
            .eq("settled", true)
            .eq("status", "completed")
            .not("winner_id", "is", null)
        ).order("completed_at", { ascending: true }).range(page * 1000, page * 1000 + 999)
      );

    const [
      moneyInCur, moneyInPrev,
      revCur, revPrev,
      withdrawalsCur, withdrawalsPrev,
      battlesCur, battlesPrev,
      playerFeeCur, playerFeePrev,
      profiles,
      pendingWithdrawals,
      failedDeposits,
      failedWithdrawals,
      stalePendingDeposits,
      openFlags,
    ] = await Promise.all([
      // Current + previous windows
      fetchDepositsBetween(period.fromISO, period.toISO, [...MONEY_IN_METHODS]),
      fetchDepositsBetween(period.prevFromISO, period.prevToISO, [...MONEY_IN_METHODS]),
      fetchDepositsBetween(period.fromISO, period.toISO, revenueMethods),
      fetchDepositsBetween(period.prevFromISO, period.prevToISO, revenueMethods),
      fetchWithdrawalsBetween(period.fromISO, period.toISO),
      fetchWithdrawalsBetween(period.prevFromISO, period.prevToISO),
      fetchBattlesBetween(period.fromISO, period.toISO),
      fetchBattlesBetween(period.prevFromISO, period.prevToISO),

      // Player-led tournament platform fees (5% of gross entry fees) are
      // recorded on tournaments.platform_fee_collected — NOT as deposits
      // ledger rows — so they must be added to the tournaments stream from
      // the tournaments table directly. fee_collected_at (migration 089)
      // is the exact settlement timestamp, written atomically alongside
      // the fee in settleFixedPoolEntryFees / finish.ts.
      fetchAll((page) =>
        within("fee_collected_at", period.fromISO, period.toISO)(
          admin
            .from("tournaments")
            .select("id, platform_fee_collected")
            .eq("is_player_created", true)
            .gt("platform_fee_collected", 0)
        ).range(page * 1000, page * 1000 + 999)
      ),
      fetchAll((page) =>
        within("fee_collected_at", period.prevFromISO, period.prevToISO)(
          admin
            .from("tournaments")
            .select("id, platform_fee_collected")
            .eq("is_player_created", true)
            .gt("platform_fee_collected", 0)
        ).range(page * 1000, page * 1000 + 999)
      ),

      // Snapshots / attention sources
      fetchAll((page) =>
        admin
          .from("profiles")
          .select("id, username, display_name, country, wallet_balance, is_admin")
          .range(page * 1000, page * 1000 + 999)
      ),
      fetchAll((page) =>
        admin
          .from("withdrawals")
          .select(withdrawalsSelect)
          .in("status", ["pending", "approved"])
          .order("created_at", { ascending: true })
          .range(page * 1000, page * 1000 + 999)
      ),
      fetchAll((page) =>
        admin
          .from("deposits")
          .select("id, user_id, amount, amount_local, currency, country, method, status, created_at")
          .in("method", [...MONEY_IN_METHODS])
          .eq("status", "failed")
          .gte("created_at", period.fromISO)
          .lt("created_at", period.toISO)
          .range(page * 1000, page * 1000 + 999)
      ),
      fetchAll((page) =>
        admin
          .from("withdrawals")
          .select(withdrawalsSelect)
          .eq("status", "failed")
          .gte("created_at", period.fromISO)
          .lt("created_at", period.toISO)
          .range(page * 1000, page * 1000 + 999)
      ),
      // money-in deposits pending for over 24h → almost certainly abandoned/stuck
      fetchAll((page) =>
        admin
          .from("deposits")
          .select("id, user_id, amount, amount_local, currency, country, method, status, created_at")
          .in("method", [...MONEY_IN_METHODS])
          .eq("status", "pending")
          .lt("created_at", new Date(Date.now() - DAY_MS).toISOString())
          .range(page * 1000, page * 1000 + 999)
      ),
      fetchAll((page) =>
        admin
          .from("integrity_flags")
          .select("id, user_id, type, severity, status, created_at")
          .eq("status", "open")
          .range(page * 1000, page * 1000 + 999)
      ),
    ]);

    // ── Profile indexes ────────────────────────────────────────────────
    const profileById = new Map<string, any>();
    for (const p of profiles) profileById.set(p.id, p);
    const countryOf = (userId: string | null | undefined, fallback?: string | null): string | null =>
      normalizeCountry(fallback) || normalizeCountry(profileById.get(userId || "")?.country);

    // ── USD aggregators ───────────────────────────────────────────────
    const depositUsd = (d: any) => roundUsd(fx.usdFromMwk(Number(d.amount || 0)) ?? 0);
    // Revenue-method rows follow the wallet-debit sign convention:
    // ad purchases are stored NEGATIVE (wallet out), memberships positive.
    // Platform revenue is the magnitude, so normalize with abs().
    const revDepositUsd = (d: any) => roundUsd(fx.usdFromMwk(Math.abs(Number(d.amount || 0))) ?? 0);
    const withdrawalUsd = (w: any) =>
      roundUsd(fx.toUsdOrZero(Number(w.amount || 0), w.currency || "MWK"));
    const withdrawalFeeUsd = (w: any) =>
      roundUsd(fx.toUsdOrZero(Math.max(0, Number(w.fee || 0)), w.currency || "MWK"));

    const battleRakeUsd = (b: any): number => {
      const rakeUnits = battleRakeUnits(b);
      if (rakeUnits <= 0) return 0;
      // Stake is denominated in the challenge creator's wallet currency;
      // white player is a stable per-row anchor for Phase 1 conversion.
      const country = countryOf(b.white_player_id);
      const currency = COUNTRY_CURRENCY[country || ""] || "MWK";
      return roundUsd(fx.toUsdOrZero(rakeUnits, currency));
    };

    const revenueFromDeposits = (rows: any[]) => {
      const out: Record<RevenueStream, number> = {
        battles: 0, tournaments: 0, memberships: 0, ads: 0, withdrawal_fees: 0,
      };
      for (const r of rows) {
        if (r.status !== "success") continue;
        const usd = revDepositUsd(r);
        if (r.method === REVENUE_METHODS.memberships) out.memberships += usd;
        else if (r.method === REVENUE_METHODS.ads) out.ads += usd;
        else if (r.method === REVENUE_METHODS.tournaments) {
          // Creator profit is platform revenue only when the creator is
          // an admin (platform-run tournament). User creators keep theirs.
          const creator = profileById.get(r.user_id);
          if (creator?.is_admin) out.tournaments += usd;
        }
      }
      return out;
    };

    // Player-led 5% entry-fee cut — entry fees are wallet-MWK-denominated,
    // so the fee converts through the same MWK anchor as deposits.
    const playerFeeUsd = (rows: any[]) =>
      roundUsd(rows.reduce((sum, t) => sum + (fx.usdFromMwk(Number(t.platform_fee_collected || 0)) ?? 0), 0));

    const revenueCur: Record<RevenueStream, number> = {
      ...revenueFromDeposits(revCur),
      tournaments: roundUsd(
        (revenueFromDeposits(revCur).tournaments || 0) + playerFeeUsd(playerFeeCur)
      ),
      battles: roundUsd(battlesCur.reduce((s, b) => s + battleRakeUsd(b), 0)),
      withdrawal_fees: roundUsd(withdrawalsCur.reduce((s, w) => s + withdrawalFeeUsd(w), 0)),
    };
    const revenuePrev: Record<RevenueStream, number> = {
      ...revenueFromDeposits(revPrev),
      tournaments: roundUsd(
        (revenueFromDeposits(revPrev).tournaments || 0) + playerFeeUsd(playerFeePrev)
      ),
      battles: roundUsd(battlesPrev.reduce((s, b) => s + battleRakeUsd(b), 0)),
      withdrawal_fees: roundUsd(withdrawalsPrev.reduce((s, w) => s + withdrawalFeeUsd(w), 0)),
    };

    const sumRevenue = (r: Record<RevenueStream, number>) =>
      roundUsd(Object.values(r).reduce((s, v) => s + v, 0));

    // ── KPIs ───────────────────────────────────────────────────────────
    const depositsCurUsd = roundUsd(moneyInCur
      .filter((d) => d.status === "success")
      .reduce((s, d) => s + depositUsd(d), 0));
    const depositsPrevUsd = roundUsd(moneyInPrev
      .filter((d) => d.status === "success")
      .reduce((s, d) => s + depositUsd(d), 0));
    const wdCurUsd = roundUsd(withdrawalsCur.reduce((s, w) => s + withdrawalUsd(w), 0));
    const wdPrevUsd = roundUsd(withdrawalsPrev.reduce((s, w) => s + withdrawalUsd(w), 0));

    const playerBalancesUsd = roundUsd(
      profiles.reduce((s, p) => {
        const currency = COUNTRY_CURRENCY[normalizeCountry(p.country) || ""] || "MWK";
        return s + fx.toUsdOrZero(Number(p.wallet_balance || 0), currency);
      }, 0)
    );

    const pendingWdUsd = roundUsd(pendingWithdrawals.reduce((s, w) => s + withdrawalUsd(w), 0));

    const kpis = {
      totalRevenue: {
        usd: sumRevenue(revenueCur),
        prevUsd: sumRevenue(revenuePrev),
        changePct: changePct(sumRevenue(revenueCur), sumRevenue(revenuePrev)),
        snapshot: false,
      },
      transactionVolume: {
        usd: roundUsd(depositsCurUsd + wdCurUsd),
        prevUsd: roundUsd(depositsPrevUsd + wdPrevUsd),
        changePct: changePct(depositsCurUsd + wdCurUsd, depositsPrevUsd + wdPrevUsd),
        snapshot: false,
      },
      deposits: {
        usd: depositsCurUsd,
        prevUsd: depositsPrevUsd,
        changePct: changePct(depositsCurUsd, depositsPrevUsd),
        snapshot: false,
      },
      withdrawals: {
        usd: wdCurUsd,
        prevUsd: wdPrevUsd,
        changePct: changePct(wdCurUsd, wdPrevUsd),
        snapshot: false,
      },
      playerBalances: {
        usd: playerBalancesUsd,
        prevUsd: null,
        changePct: null,
        snapshot: true, // live wallet snapshot — not a period delta
      },
      pendingWithdrawals: {
        usd: pendingWdUsd,
        prevUsd: null,
        changePct: null,
        snapshot: true,
        count: pendingWithdrawals.length,
        oldest: pendingWithdrawals[0]?.created_at || null,
      },
    };

    // ── Chart series ───────────────────────────────────────────────────
    const fromMs = Date.parse(period.fromISO);
    const toMs = Date.parse(period.toISO);
    const granularity = chooseGranularity(fromMs, toMs);
    const keys = bucketRange(period.fromISO, period.toISO, granularity);
    const series = new Map<string, Record<RevenueStream, number>>(
      keys.map((k) => [k, { battles: 0, tournaments: 0, memberships: 0, ads: 0, withdrawal_fees: 0 }])
    );

    const addSeries = (iso: string, stream: RevenueStream, usd: number) => {
      const k = bucketKey(iso, granularity);
      const row = series.get(k);
      if (row) row[stream] = roundUsd(row[stream] + usd);
    };
    for (const b of battlesCur) {
      const usd = battleRakeUsd(b);
      if (usd > 0) addSeries(b.completed_at, "battles", usd);
    }
    for (const w of withdrawalsCur) {
      const usd = withdrawalFeeUsd(w);
      if (usd > 0) addSeries(w.processed_at || w.created_at, "withdrawal_fees", usd);
    }
    for (const r of revCur) {
      if (r.status !== "success") continue;
      const usd = revDepositUsd(r);
      if (usd <= 0) continue;
      if (r.method === REVENUE_METHODS.memberships) addSeries(r.created_at, "memberships", usd);
      else if (r.method === REVENUE_METHODS.ads) addSeries(r.created_at, "ads", usd);
      else if (r.method === REVENUE_METHODS.tournaments) {
        if (profileById.get(r.user_id)?.is_admin) addSeries(r.created_at, "tournaments", usd);
      }
    }

    // ── Markets ────────────────────────────────────────────────────────
    interface MarketAgg {
      code: string;
      volume: number;
      deposits: number;
      withdrawals: number;
      revenue: number;
      players: Set<string>;
    }
    const markets = new Map<string, MarketAgg>();
    const marketOf = (code: string): MarketAgg => {
      let m = markets.get(code);
      if (!m) {
        m = { code, volume: 0, deposits: 0, withdrawals: 0, revenue: 0, players: new Set() };
        markets.set(code, m);
      }
      return m;
    };

    for (const d of moneyInCur) {
      if (d.status !== "success") continue;
      const code = countryOf(d.user_id, d.country) || "ZZ";
      const usd = depositUsd(d);
      const m = marketOf(code);
      m.deposits = roundUsd(m.deposits + usd);
      m.volume = roundUsd(m.volume + usd);
      if (d.user_id) m.players.add(d.user_id);
    }
    for (const w of withdrawalsCur) {
      const code = countryOf(w.user_id, w.country) || "ZZ";
      const usd = withdrawalUsd(w);
      const m = marketOf(code);
      m.withdrawals = roundUsd(m.withdrawals + usd);
      m.volume = roundUsd(m.volume + usd);
      if (w.user_id) m.players.add(w.user_id);
    }
    for (const b of battlesCur) {
      const usd = battleRakeUsd(b);
      if (usd <= 0) continue;
      const code = countryOf(b.white_player_id) || "ZZ";
      const m = marketOf(code);
      m.revenue = roundUsd(m.revenue + usd);
    }
    for (const r of revCur) {
      if (r.status !== "success") continue;
      const usd = revDepositUsd(r);
      if (usd <= 0) continue;
      let stream: RevenueStream | null = null;
      if (r.method === REVENUE_METHODS.memberships) stream = "memberships";
      else if (r.method === REVENUE_METHODS.ads) stream = "ads";
      else if (r.method === REVENUE_METHODS.tournaments && profileById.get(r.user_id)?.is_admin) stream = "tournaments";
      if (!stream) continue;
      const m = marketOf(countryOf(r.user_id, r.country) || "ZZ");
      m.revenue = roundUsd(m.revenue + usd);
    }
    for (const w of withdrawalsCur) {
      const usd = withdrawalFeeUsd(w);
      if (usd <= 0) continue;
      const m = marketOf(countryOf(w.user_id, w.country) || "ZZ");
      m.revenue = roundUsd(m.revenue + usd);
    }
    for (const p of profiles) {
      const code = normalizeCountry(p.country);
      if (code) marketOf(code).players.add(p.id);
    }

    // Union of signup markets + any market seen in data, ranked by volume.
    const codes = new Set<string>([...SIGNUP_MARKETS]);
    for (const c of markets.keys()) codes.add(c);

    const marketsOut = [...codes]
      .map((code) => {
        const m = markets.get(code) || { code, volume: 0, deposits: 0, withdrawals: 0, revenue: 0, players: new Set() as Set<string> };
        const active = m.volume > 0 || m.revenue > 0 || m.deposits > 0 || m.withdrawals > 0;
        return {
          code,
          currency: COUNTRY_CURRENCY[code] || "USD",
          volume: m.volume,
          deposits: m.deposits,
          withdrawals: m.withdrawals,
          revenue: m.revenue,
          players: m.players.size,
          status: active ? "active" : "quiet",
        };
      })
      .sort((a, b) => b.volume - a.volume || b.revenue - a.revenue);

    // ── Needs Attention ────────────────────────────────────────────────
    const attention = [] as Array<{
      key: string;
      label: string;
      detail: string;
      severity: "critical" | "warning" | "info";
      count: number;
      oldest?: string | null;
      action: "withdrawals" | "transactions" | "flags";
    }>;

    if (pendingWithdrawals.length > 0) {
      attention.push({
        key: "pending_withdrawals",
        label: "Pending withdrawals",
        detail: `${pendingWithdrawals.length} withdrawal request(s) awaiting processing — ${formatUsdClient(pendingWdUsd)}`,
        severity: "critical",
        count: pendingWithdrawals.length,
        oldest: pendingWithdrawals[0]?.created_at || null,
        action: "withdrawals",
      });
    }
    if (failedDeposits.length > 0) {
      const usd = roundUsd(failedDeposits.reduce((s, d) => s + depositUsd(d), 0));
      attention.push({
        key: "failed_deposits",
        label: "Failed deposits",
        detail: `${failedDeposits.length} deposit attempt(s) failed in this period — ${formatUsdClient(usd)}`,
        severity: "warning",
        count: failedDeposits.length,
        action: "transactions",
      });
    }
    if (failedWithdrawals.length > 0) {
      attention.push({
        key: "failed_withdrawals",
        label: "Failed withdrawals",
        detail: `${failedWithdrawals.length} payout(s) failed (funds auto-refunded) — review provider health`,
        severity: "warning",
        count: failedWithdrawals.length,
        action: "withdrawals",
      });
    }
    if (stalePendingDeposits.length > 0) {
      attention.push({
        key: "stale_deposits",
        label: "Stuck pending deposits",
        detail: `${stalePendingDeposits.length} deposit(s) pending for over 24h — webhook may have missed them`,
        severity: "critical",
        count: stalePendingDeposits.length,
        oldest: stalePendingDeposits[0]?.created_at || null,
        action: "transactions",
      });
    }
    if (openFlags.length > 0) {
      attention.push({
        key: "integrity_flags",
        label: "Open integrity flags",
        detail: `${openFlags.length} unresolved integrity flag(s) on player accounts`,
        severity: "warning",
        count: openFlags.length,
        oldest: openFlags[0]?.created_at || null,
        action: "flags",
      });
    }

    return NextResponse.json({
      period: {
        from: period.fromISO,
        to: period.toISO,
        preset,
        granularity,
      },
      fx: {
        mwkToUsdSource: fx.unavailable.size === 0 ? "ok" : "degraded",
        unavailableCurrencies: [...fx.unavailable],
      },
      kpis,
      revenue: {
        streams: revenueCur,
        streamsPrev: revenuePrev,
        total: sumRevenue(revenueCur),
        totalPrev: sumRevenue(revenuePrev),
      },
      series: keys.map((k) => ({ bucket: k, ...series.get(k)! })),
      markets: marketsOut,
      attention,
    });
  } catch (err: any) {
    console.error("[commandcentre/overview]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to build overview" },
      { status: 500 }
    );
  }
}

function formatUsdClient(usd: number): string {
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

