"use client";
import Image from "next/image";

/**
 * CrazyChess Admin Command Centre — Phase 1 + Phase 2 shell.
 *
 * Phase 1: read-only financial + operational overview in USD, driven by
 * the overview + transactions feed endpoints.
 * Phase 2 (Finance & Reconciliation): transaction ledger, deposit and
 * withdrawal management, reconciliation against the payment provider,
 * player wallet ledgers, 14-market finance, settlements, downloadable
 * reports and the financial audit log. Each Phase 2 view is a
 * self-fetching section component (phase2-*.tsx).
 * The legacy /admin panel is untouched and linked for approvals.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import type {
  AttentionItem,
  FeedRow,
  MarketRow,
  OverviewResponse,
  RangePresetUi,
  RevenueStream,
  TransactionsResponse,
} from "./types";
import RevenueChart, { STREAM_COLORS } from "./chart";
import {
  AttentionStrip,
  KpiCard,
  MarketsTable,
  MarketModal,
  StreamTiles,
  TransactionFeed,
  TypeChips,
  formatLocal,
  formatUsd,
} from "./sections";
import { LedgerView, DepositsView, WithdrawalsView } from "./phase2-finance";
import { ReconciliationView, PlayersView } from "./phase2-recon";
import { ControlsView } from "./phase3-controls";
import { TournamentsView, GamesView, BattlesView } from "./phase4-tournaments";
import { MarketsView, SettlementsView, ReportsView, AuditView, VerificationView } from "./phase2-ops";
import { UsersView, IntegrityView, LogsView, LeaguesView, JobsView, SettingsView } from "./system-views";

type View =
  | "dashboard"
  | "finance-overview"
  | "finance-transactions"
  | "ledger"
  | "deposits"
  | "withdrawals"
  | "reconciliation"
  | "players"
  | "settlements"
  | "reports"
  | "audit"
  | "verification"
  | `rev-${RevenueStream}`
  | "markets"
  | "tournaments"
  | "games"
  | "battles"
  | "controls"
  | "users"
  | "integrity"
  | "logs"
  | "leagues"
  | "jobs"
  | "settings";

const RANGE_CHIPS: Array<[RangePresetUi, string]> = [
  ["today", "Today"],
  ["7d", "7 Days"],
  ["30d", "30 Days"],
  ["90d", "90 Days"],
  ["12m", "12 Months"],
  ["custom", "Custom"],
];

const VIEW_META: Record<string, { title: string; sub: string; txType?: string }> = {
  dashboard: { title: "Dashboard", sub: "Financial & operational pulse of CrazyChess" },
  battles: { title: "Battles", sub: "Staked battles — set result, abort & refund, restart stuck matches" },
  "finance-overview": { title: "Finance · Overview", sub: "Revenue performance across all streams" },
  "finance-transactions": { title: "Finance · Transactions", sub: "Unified activity feed", txType: "all" },
  ledger: { title: "Finance · Transaction Ledger", sub: "Every money movement — CrazyChess ↔ pawaPay reconciliation-ready" },
  deposits: { title: "Deposits", sub: "Money into the platform, by market, network and player" },
  withdrawals: { title: "Withdrawals", sub: "Payouts to players + the pending review queue" },
  reconciliation: { title: "Reconciliation", sub: "Does the money recorded by CrazyChess match the money processed by pawaPay?" },
  players: { title: "Players · Wallet & Management", sub: "Balances derived from the ledger, plus wallet adjustments, bans and roles" },
  controls: { title: "Financial Controls", sub: "Money levers for the platform — fees, limits, pricing and payouts" },
  tournaments: { title: "Operations · Tournaments", sub: "Full lifecycle control — platform and player-created events" },
  games: { title: "Operations · Games", sub: "Chess & draughts oversight — abort and result override" },
  settlements: { title: "Settlements", sub: "Money between the payment infrastructure and CrazyChess accounts" },
  reports: { title: "Financial Reports", sub: "Downloadable reports, consolidated in USD" },
  audit: { title: "Financial Audit Log", sub: "Every financial admin action — immutable" },
  verification: { title: "Verification", sub: "KYC document review and player identity confirmation" },
  "rev-battles": { title: "Revenue · Battles", sub: "Rake from settled battles", txType: "battle_fee" },
  "rev-tournaments": { title: "Revenue · Tournaments", sub: "Creator profit share from tournaments", txType: "tournament" },
  "rev-memberships": { title: "Revenue · Memberships", sub: "Membership purchases", txType: "membership" },
  "rev-ads": { title: "Revenue · Ads", sub: "Self-serve ad campaign spend", txType: "ad" },
  "rev-withdrawal_fees": { title: "Revenue · Withdrawal Fees", sub: "Payout fees collected", txType: "withdrawal_fee" },
  markets: { title: "Markets · Countries", sub: "Per-country performance — USD" },
  users: { title: "Users", sub: "Player accounts — search, roles, bans, wallet adjustments" },
  integrity: { title: "Integrity", sub: "Fraud & fairness flags with automated scans" },
  logs: { title: "Activity Log", sub: "Every admin action, immutable" },
  leagues: { title: "Leagues", sub: "Weekly league configuration, XP and payouts" },
  jobs: { title: "System Jobs", sub: "Scheduled automation health — heartbeats from the cron runner" },
  settings: { title: "Platform Settings", sub: "Every platform_config section + community rooms" },
};

/** Self-fetching Phase 2 section views (independent of the overview API). */
const PHASE2_VIEWS = new Set<View>([
  "ledger", "deposits", "withdrawals", "reconciliation", "players", "settlements",
  "reports", "audit", "markets", "verification", "controls", "tournaments", "games",
  "battles", "users", "integrity", "logs", "leagues", "jobs", "settings",
]);


export default function CommandCentreClient() {
  const [view, setView] = useState<View>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Collapsible nav groups — collapsed by default; switching views
  // auto-expands the section that owns the view.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const GROUP_OF: Partial<Record<View, string>> = {
    "finance-transactions": "finance", ledger: "finance", deposits: "finance", withdrawals: "finance",
    "finance-overview": "revenue", "rev-battles": "revenue", "rev-tournaments": "revenue",
    "rev-memberships": "revenue", "rev-ads": "revenue", "rev-withdrawal_fees": "revenue",
    players: "players", verification: "players", users: "players", integrity: "players",
    reconciliation: "operations", audit: "operations", settlements: "operations",
    reports: "operations", markets: "operations", controls: "operations",
    tournaments: "operations", games: "operations", logs: "operations", leagues: "operations", jobs: "operations", settings: "operations",
  };
  useEffect(() => {
    const g = GROUP_OF[view];
    if (g) setExpandedGroups((prev) => new Set(prev).add(g));
  }, [view]);
  const [range, setRange] = useState<RangePresetUi>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [txRows, setTxRows] = useState<FeedRow[]>([]);
  const [txType, setTxType] = useState<string>("all");
  const [txLoading, setTxLoading] = useState(false);
  const [txCursor, setTxCursor] = useState<string | null>(null);

  const [openMarket, setOpenMarket] = useState<MarketRow | null>(null);
  const [activeStreams, setActiveStreams] = useState<string[]>([]);

  const overviewAbort = useRef<AbortController | null>(null);

  // ── Overview fetch ──────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    overviewAbort.current?.abort();
    const ctl = new AbortController();
    overviewAbort.current = ctl;
    setError(null);
    try {
      const params = new URLSearchParams({ range });
      if (range === "custom") {
        if (customFrom) params.set("from", customFrom);
        if (customTo) params.set("to", customTo);
      }
      const res = await fetch(`/api/admin/commandcentre/overview?${params}`, {
        signal: ctl.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Overview failed (${res.status})`);
      }
      const json: OverviewResponse = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (err?.name !== "AbortError") setError(err?.message || "Failed to load overview");
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, [range, customFrom, customTo]);

  // ── Transactions fetch ─────────────────────────────────────────────
  const fetchTransactions = useCallback(
    async (type: string, cursor?: string | null) => {
      setTxLoading(true);
      try {
        const params = new URLSearchParams({ type, limit: "50" });
        if (cursor) params.set("before", cursor);
        const res = await fetch(`/api/admin/commandcentre/transactions?${params}`, {
          cache: "no-store",
        });
        const json: TransactionsResponse = await res.json();
        if (!res.ok) throw new Error((json as any).error || "Feed failed");
        setTxRows((prev) => (cursor ? [...prev, ...json.rows] : json.rows));
        setTxCursor(json.nextCursor);
      } catch {
        // keep previous rows on refresh failure
      } finally {
        setTxLoading(false);
      }
    },
    []
  );

  // ── Effects: load + auto-refresh ────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    const id = setInterval(fetchOverview, 90_000);
    return () => clearInterval(id);
  }, [fetchOverview]);

  // The finance feed views and the revenue stream pages render transaction
  // rows — everywhere else the feed isn't visible so we skip fetching it.
  const feedType = VIEW_META[view]?.txType;
  const effectiveType = view === "finance-transactions" ? txType : feedType;

  useEffect(() => {
    if (!feedType) return;
    fetchTransactions(effectiveType!, null);
  }, [feedType, effectiveType, fetchTransactions]);

  useEffect(() => {
    if (!feedType) return;
    const id = setInterval(() => fetchTransactions(effectiveType!, null), 45_000);
    return () => clearInterval(id);
  }, [feedType, effectiveType, fetchTransactions]);

  // ── Handlers ────────────────────────────────────────────────────────
  const toggleStream = (s: string) =>
    setActiveStreams((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  const openStreamPage = (s: string) => setView(`rev-${s}` as View);

  const onReview = (item: AttentionItem) => {
    if (item.action === "withdrawals") {
      setView("withdrawals");
    } else if (item.action === "transactions") {
      setView("finance-transactions");
      setTxType("all");
    } else {
      // integrity flags
      setView("integrity");
    }
  };

  const granularity = data?.period.granularity ?? "day";
  const streamForView = view.startsWith("rev-") ? (view.slice(4) as RevenueStream) : null;

  const streamKpi = useMemo(() => {
    if (!streamForView || !data) return null;
    const cur = data.revenue.streams[streamForView] ?? 0;
    const prev = data.revenue.streamsPrev[streamForView] ?? 0;
    const series = data.series.map((p) => ({
      bucket: p.bucket,
      value: p[streamForView],
    }));
    const best = series.reduce((m, p) => (p.value > (m?.value ?? -1) ? p : m), null as { bucket: string; value: number } | null);
    return { cur, prev, pct: prev === 0 ? null : ((cur - prev) / prev) * 100, best, series };
  }, [streamForView, data]);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileNavOpen]);

  const navItem = (v: View, label: string, opts?: { dot?: boolean }) => (
    <button
      key={v}
      onClick={() => {
        setView(v);
        setMobileNavOpen(false);
      }}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] transition-colors ${
        view === v
          ? "bg-violet-600/20 font-semibold text-white"
          : "text-ccb-muted hover:bg-ccb-surface hover:text-white"
      }`}
    >
      {label}
      {opts?.dot && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
    </button>
  );

  const navGroup = (label: string, groupId: string, children: React.ReactNode) => {
    const open = expandedGroups.has(groupId);
    return (
      <div className="mb-2">
        <button
          type="button"
          onClick={() =>
            setExpandedGroups((prev) => {
              const next = new Set(prev);
              if (next.has(groupId)) next.delete(groupId);
              else next.add(groupId);
              return next;
            })
          }
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ccb-muted/70 transition-colors hover:bg-ccb-surface hover:text-white"
        >
          {label}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
          />
        </button>
        {open && <div className="mt-1 space-y-0.5">{children}</div>}
      </div>
    );
  };

  const brandBlock = (
    <div className="mb-6 px-2">
      <div className="flex items-center gap-2">
        <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full" />
        <p className="text-sm font-bold tracking-tight text-white">Crazy Chess</p>
      </div>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ccb-muted">
        Command Centre
      </p>
    </div>
  );

  const sidebarNav = (
    <>
      {navItem("dashboard", "Dashboard")}
      {navGroup("Finance", "finance",
        <>
          {navItem("finance-transactions", "Transactions")}
          {navItem("ledger", "Ledger")}
          {navItem("deposits", "Deposits")}
          {navItem("withdrawals", "Withdrawals")}
        </>
      )}
      {navGroup("Revenue", "revenue",
        <>
          {navItem("finance-overview", "Overview")}
          {navItem("rev-battles", "Battles")}
          {navItem("rev-tournaments", "Tournaments")}
          {navItem("rev-memberships", "Memberships")}
          {navItem("rev-ads", "Ads")}
          {navItem("rev-withdrawal_fees", "Withdrawal Fees")}
        </>
      )}
      {navGroup("Players", "players",
        <>
          {navItem("users", "Users")}
          {navItem("players", "Wallet & Management")}
          {navItem("verification", "Verification")}
          {navItem("integrity", "Integrity")}
        </>
      )}
      {navGroup("Operations", "operations",
        <>
          {navItem("tournaments", "Tournaments")}
          {navItem("battles", "Battles")}
          {navItem("games", "Games")}
          {navItem("reconciliation", "Reconciliation")}
          {navItem("audit", "Audit Log")}
          {navItem("settlements", "Settlements")}
          {navItem("reports", "Reports")}
          {navItem("markets", "Country Finance")}
          {navItem("controls", "Financial Controls")}
          {navItem("logs", "Activity Log")}
          {navItem("leagues", "Leagues")}
          {navItem("jobs", "System Jobs")}
          {navItem("settings", "Platform Settings")}
        </>
      )}
      <div className="mt-auto space-y-1 border-t border-ccb-border pt-3">
        <p className="px-3 pt-1 text-[10px] text-ccb-muted/60">
          Reporting currency: USD · Phase 1 read-only + Phase 2 finance ops
        </p>
      </div>

    </>
  );

  return (
    <>
      {/* ── Mobile top bar ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-ccb-border bg-ccb-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" />
          <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-bold tracking-tight text-white">
            <span className="whitespace-nowrap">Crazy Chess</span>
            <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] text-ccb-muted">
              Command Centre
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ccb-border text-ccb-muted hover:bg-ccb-surface hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-screen">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-ccb-border bg-ccb-surface/60 px-3 py-5 lg:flex">
        {brandBlock}
        {sidebarNav}
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 px-4 pb-16 pt-5 sm:px-6">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              {VIEW_META[view].title}
            </h1>
            <p className="mt-0.5 text-xs text-ccb-muted">{VIEW_META[view].sub}</p>
          </div>
          <div className={`flex flex-wrap items-center gap-2 ${PHASE2_VIEWS.has(view) ? "hidden" : ""}`}>
            {RANGE_CHIPS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  range === k
                    ? "bg-violet-600 text-white"
                    : "border border-ccb-border bg-ccb-surface text-ccb-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
            {range === "custom" && (
              <span className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-md border border-ccb-border bg-ccb-card px-2 py-1 text-xs text-white"
                />
                <span className="text-xs text-ccb-muted">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-md border border-ccb-border bg-ccb-card px-2 py-1 text-xs text-white"
                />
              </span>
            )}
            <button
              onClick={() => { fetchOverview(); }}
              className="rounded-md border border-ccb-border bg-ccb-surface px-2.5 py-1 text-xs font-medium text-white hover:border-violet-500/60"
              title="Refresh now"
            >
              ⟳
            </button>
          </div>
        </div>

        {data?.fx.mwkToUsdSource === "degraded" && (
          <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs text-amber-300">
            FX degraded — some currencies could not be converted to USD
            {data.fx.unavailableCurrencies.length > 0 &&
              ` (${data.fx.unavailableCurrencies.join(", ")})`}.
            Affected amounts show local values only.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {PHASE2_VIEWS.has(view) ? (
          <div className="space-y-5">
            {view === "ledger" && <LedgerView />}
            {view === "deposits" && <DepositsView />}
            {view === "withdrawals" && <WithdrawalsView />}
            {view === "reconciliation" && <ReconciliationView />}
            {view === "players" && <PlayersView />}
            {view === "markets" && <MarketsView />}
            {view === "settlements" && <SettlementsView />}
            {view === "reports" && <ReportsView />}
            {view === "audit" && <AuditView />}
            {view === "verification" && <VerificationView />}
            {view === "controls" && <ControlsView />}
            {view === "users" && <UsersView />}
            {view === "integrity" && <IntegrityView />}
            {view === "logs" && <LogsView />}
            {view === "leagues" && <LeaguesView />}
            {view === "jobs" && <JobsView />}
            {view === "settings" && <SettingsView />}
            {view === "tournaments" && <TournamentsView />}
            {view === "battles" && <BattlesView />}
            {view === "games" && <GamesView />}
          </div>
        ) : loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : !data ? (
          <div className="rounded-xl border border-ccb-border bg-ccb-card p-8 text-center text-sm text-ccb-muted">
            No data available.
          </div>
        ) : (
          <div className="space-y-5">
            {/* ── Dashboard ───────────────────────────────────────── */}
            {view === "dashboard" && (
              <>
                <AttentionStrip items={data.attention} onReview={onReview} />

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Total Revenue" kpi={data.kpis.totalRevenue} highlight hint="Actual CrazyChess earnings — deposits excluded" />
                  <KpiCard label="Total Deposits" kpi={data.kpis.deposits} hint="Money in (not revenue)" />
                  <KpiCard label="Player Balances" kpi={data.kpis.playerBalances} hint="Live wallets, all currencies → USD" />
                  <KpiCard label="Pending Withdrawals" kpi={data.kpis.pendingWithdrawals} />
                </div>

                <section className="rounded-xl border border-ccb-border bg-ccb-card p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Revenue Overview</h3>
                      <p className="text-[11px] text-ccb-muted">
                        Total: <span className="font-semibold text-white">{formatUsd(data.revenue.total)}</span>
                        {data.revenue.totalPrev > 0 && (
                          <span className="ml-1.5">
                            ({data.revenue.total >= data.revenue.totalPrev ? "▲" : "▼"}
                            {" "}
                            {Math.abs(((data.revenue.total - data.revenue.totalPrev) / data.revenue.totalPrev) * 100).toFixed(1)}% vs prev)
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => setView("finance-overview")}
                      className="text-xs font-semibold text-violet-400 hover:text-violet-300"
                    >
                      Full revenue view →
                    </button>
                  </div>
                  <StreamTiles data={data} activeStreams={activeStreams} onToggle={toggleStream} onOpenStream={openStreamPage} />
                  <div className="mt-4">
                    <RevenueChart series={data.series} streams={activeStreams} granularity={granularity} />
                  </div>
                </section>

              </>
            )}

            {/* ── Finance overview ─────────────────────────────────── */}
            {view === "finance-overview" && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Total Revenue" kpi={data.kpis.totalRevenue} highlight />
                  <KpiCard label="Deposits (gross)" kpi={data.kpis.deposits} hint="Not revenue" />
                  <KpiCard label="Withdrawals (gross)" kpi={data.kpis.withdrawals} />
                  <KpiCard label="Transaction Volume" kpi={data.kpis.transactionVolume} />
                </div>
                <section className="rounded-xl border border-ccb-border bg-ccb-card p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">Revenue by Stream</h3>
                  <StreamTiles data={data} activeStreams={activeStreams} onToggle={toggleStream} onOpenStream={openStreamPage} />
                  <div className="mt-4">
                    <RevenueChart series={data.series} streams={activeStreams} granularity={granularity} />
                  </div>
                  <p className="mt-3 text-[11px] text-ccb-muted">
                    Deposits and transaction volume are <span className="font-semibold text-white">not</span> revenue —
                    only battle rake, platform tournament profit, memberships, ad spend and withdrawal fees count.
                  </p>
                </section>
              </>
            )}

            {/* ── Feed views ───────────────────────────────────────── */}
            {(feedType != null) && (
              <section className="rounded-xl border border-ccb-border bg-ccb-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ccb-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-white">
                    {txLoading ? "Syncing…" : `${txRows.length} shown`}
                  </h3>
                  {(view === "finance-transactions") && (
                    <TypeChips value={txType} onChange={setTxType} />
                  )}
                </div>
                <TransactionFeed rows={txRows} onOpen={() => {}} />
                {txCursor && (
                  <div className="border-t border-ccb-border p-3 text-center">
                    <button
                      onClick={() => fetchTransactions(effectiveType!, txCursor)}
                      className="rounded-md border border-ccb-border bg-ccb-surface px-4 py-1.5 text-xs font-semibold text-white hover:border-violet-500/60"
                    >
                      Load older
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* ── Stream detail ────────────────────────────────────── */}
            {streamKpi && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-500/10 to-transparent p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">Revenue this period</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatUsd(streamKpi.cur)}</p>
                  <p className={`mt-1 text-[11px] ${streamKpi.pct == null ? "text-ccb-muted" : streamKpi.pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {streamKpi.pct == null ? "no baseline" : `${streamKpi.pct >= 0 ? "▲" : "▼"} ${Math.abs(streamKpi.pct).toFixed(1)}%`}
                  </p>
                </div>
                <div className="rounded-xl border border-ccb-border bg-ccb-card p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">Previous period</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatUsd(streamKpi.prev)}</p>
                  <p className="mt-1 text-[11px] text-ccb-muted">Equal-length window before this one</p>
                </div>
                <div className="rounded-xl border border-ccb-border bg-ccb-card p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">Best {granularity === "month" ? "month" : "day"}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatUsd(streamKpi.best?.value ?? 0)}</p>
                  <p className="mt-1 text-[11px] text-ccb-muted">{streamKpi.best?.bucket ?? "—"}</p>
                </div>
                <section className="sm:col-span-3 rounded-xl border border-ccb-border bg-ccb-card p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: STREAM_COLORS[streamForView!] }} />
                    <h3 className="text-sm font-semibold text-white">Trend</h3>
                  </div>
                  <RevenueChart
                    series={data.series}
                    streams={[streamForView!]}
                    granularity={granularity}
                  />
                </section>
              </div>
            )}

            {/* ── Markets ──────────────────────────────────────────── */}
            {view === "markets" && (
              <>
                <MarketsTable markets={data.markets} onOpenMarket={setOpenMarket} />
                <p className="text-[11px] leading-relaxed text-ccb-muted">
                  USD conversion uses each transaction&apos;s recorded FX rate; the table shows the
                  union of the platform&apos;s signup markets and every country seen in live data.
                  Original local-currency values are never modified.
                </p>
              </>
            )}
          </div>
        )}

        <p className="mt-8 text-[10px] text-ccb-muted/60">
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString()} · auto-refreshes every 90s · figures in USD`
            : "…"}
        </p>
      </main>

      {openMarket && <MarketModal market={openMarket} onClose={() => setOpenMarket(null)} />}
      </div>

      {/* ── Mobile navigation drawer ───────────────────────────────── */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto border-r border-ccb-border bg-ccb-surface px-3 py-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between gap-2 px-2">
              <div className="flex min-w-0 items-center gap-2">
                <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full" />
                <p className="text-sm font-bold tracking-tight text-white">Crazy Chess</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-ccb-border text-ccb-muted hover:bg-ccb-surface hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sidebarNav}
          </aside>
        </div>
      )}
    </>
  );
}
