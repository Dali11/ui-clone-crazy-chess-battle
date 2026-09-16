"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Search, Download, RefreshCw, ArrowDownToLine, ArrowUpFromLine,
  Coins, FileSpreadsheet, ChevronRight, Landmark,
} from "lucide-react";

/**
 * FinancePanel — unified money-movement ledger for the admin console.
 *
 * Surfaces EVERY entry in the deposits table (payment inflows, battle
 * escrow/payouts/refunds, tournament flows, membership, ads, affiliate
 * commissions, corrections, sweeps) with category filters, search,
 * date ranges, summary tiles and CSV export.
 */

interface LedgerRow {
  id: string;
  user_id: string;
  amount: number;
  amount_local: number | null;
  currency: string | null;
  status: string;
  method: string;
  reference: string | null;
  phone: string | null;
  operator: string | null;
  payment_provider: string | null;
  admin_notes: string | null;
  created_at: string;
  profiles?: { username: string | null; display_name: string | null } | null;
}

interface LedgerResponse {
  rows: LedgerRow[];
  page: number;
  limit: number;
  hasMore: boolean;
  summary: Record<string, { count: number; net: number }>;
}

const CATEGORY_ICON: Record<string, typeof Coins> = {
  "Money In": ArrowDownToLine,
  Battles: Coins,
  Tournaments: Coins,
  Membership: Coins,
  Ads: Coins,
  Affiliate: Coins,
  Corrections: Coins,
  "Revenue Sweep": Landmark,
  Other: Coins,
};

const CATEGORY_COLOR: Record<string, string> = {
  "Money In": "text-ccb-success",
  Battles: "text-ccb-primary",
  Tournaments: "text-ccb-accent",
  Membership: "text-ccb-primary",
  Ads: "text-ccb-accent",
  Affiliate: "text-ccb-primary",
  Corrections: "text-ccb-danger",
  "Revenue Sweep": "text-ccb-muted",
  Other: "text-ccb-muted",
};

const CATEGORY_OPTIONS = [
  { id: "all", label: "All" },
  { id: "money_in", label: "Money In" },
  { id: "battle", label: "Battles" },
  { id: "tournament", label: "Tournaments" },
  { id: "membership", label: "Membership" },
  { id: "ads", label: "Ads" },
  { id: "affiliate", label: "Affiliate" },
  { id: "corrections", label: "Corrections" },
  { id: "sweep", label: "Revenue Sweep" },
  { id: "other", label: "Other" },
];

const STATUS_COLOR: Record<string, string> = {
  success: "text-ccb-success",
  pending: "text-ccb-accent",
  processing: "text-ccb-accent",
  failed: "text-ccb-danger",
};

export default function FinancePanel({
  formatMWK,
  formatDate,
}: {
  formatMWK: (n: number) => string;
  formatDate: (d: string) => string;
}) {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  const fetchLedger = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams({
        category, status, page: String(page), limit: "100",
      });
      if (search) params.set("search", search);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/ledger?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load ledger");
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, status, search, from, to, page]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Debounced search box → filter
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const setFilter = (fn: () => void) => {
    fn();
    setPage(0);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ category, status, format: "csv" });
      if (search) params.set("search", search);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/ledger?${params}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ccb-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const summaryEntries = data
    ? Object.entries(data.summary).sort(
        (a, b) => Math.abs(b[1].net) - Math.abs(a[1].net)
      )
    : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Unified Ledger</h2>
          <p className="text-xs text-ccb-muted">
            Every wallet movement — money in, battle & tournament flows, commissions, corrections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLedger(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-ccb-surface border border-ccb-border text-ccb-muted hover:text-ccb-text hover:border-ccb-primary/40 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-ccb-primary text-white hover:bg-ccb-primary/90 transition-colors disabled:opacity-60"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ccb-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search user, reference, phone…"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-ccb-dark border border-ccb-border text-sm text-ccb-text placeholder:text-ccb-muted/50 focus:outline-none focus:border-ccb-primary/50"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ccb-muted">
            <input
              type="date"
              value={from}
              onChange={(e) => setFilter(() => setFrom(e.target.value))}
              className="px-2 py-2 rounded-lg bg-ccb-dark border border-ccb-border text-ccb-text focus:outline-none focus:border-ccb-primary/50"
            />
            <span>→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setFilter(() => setTo(e.target.value))}
              className="px-2 py-2 rounded-lg bg-ccb-dark border border-ccb-border text-ccb-text focus:outline-none focus:border-ccb-primary/50"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilter(() => setCategory(c.id))}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  category === c.id
                    ? "bg-ccb-primary/20 text-ccb-primary border border-ccb-primary/40"
                    : "text-ccb-muted border border-ccb-border hover:text-ccb-text hover:border-ccb-muted/40"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <select
            value={status}
            onChange={(e) => setFilter(() => setStatus(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg bg-ccb-dark border border-ccb-border text-xs text-ccb-text focus:outline-none focus:border-ccb-primary/50"
          >
            <option value="all">All statuses</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Summary tiles */}
      {!loading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {summaryEntries.length === 0 && (
            <div className="card p-3 col-span-full text-center text-xs text-ccb-muted">
              No entries match the current filters.
            </div>
          )}
          {summaryEntries.map(([label, s]) => {
            const Icon = CATEGORY_ICON[label] || Coins;
            return (
              <div key={label} className="card p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ccb-muted font-bold">
                  <Icon className="w-3 h-3" />
                  {label}
                </div>
                <p className={`text-sm font-bold mt-1 ${CATEGORY_COLOR[label] || "text-ccb-text"}`}>
                  {formatMWK(s.net)}
                </p>
                <p className="text-[10px] text-ccb-muted">{s.count} entries</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Rows */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-3 flex items-center justify-between">
              <div className="h-4 w-1/3 rounded bg-ccb-muted/15" />
              <div className="h-4 w-16 rounded bg-ccb-muted/15" />
            </div>
          ))}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ccb-muted">
          No ledger entries found for these filters.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ccb-border text-ccb-muted">
                  <th className="text-left px-3 py-2 font-semibold">Date</th>
                  <th className="text-left px-3 py-2 font-semibold">Player</th>
                  <th className="text-left px-3 py-2 font-semibold">Method</th>
                  <th className="text-left px-3 py-2 font-semibold">Reference</th>
                  <th className="text-right px-3 py-2 font-semibold">Amount</th>
                  <th className="text-right px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const name = r.profiles?.display_name || r.profiles?.username || "—";
                  const negative = Number(r.amount) < 0;
                  return (
                    <tr key={r.id} className="border-b border-ccb-border/50 hover:bg-ccb-surface/50">
                      <td className="px-3 py-2 whitespace-nowrap text-ccb-muted">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="px-3 py-2 font-medium text-ccb-text max-w-[140px] truncate">
                        {name}
                      </td>
                      <td className="px-3 py-2 text-ccb-muted whitespace-nowrap">
                        {r.method}
                        {r.currency && r.currency !== "MWK" && (
                          <span className="ml-1 text-[10px] text-ccb-accent">{r.currency}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ccb-muted max-w-[160px] truncate" title={r.reference || ""}>
                        {r.reference || r.admin_notes || "—"}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap ${
                        negative ? "text-ccb-danger" : "text-ccb-success"
                      }`}>
                        {formatMWK(r.amount)}
                        {r.amount_local != null && r.currency && r.currency !== "MWK" && (
                          <span className="block text-[10px] font-normal text-ccb-muted">
                            {r.amount_local.toLocaleString()} {r.currency}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-medium ${STATUS_COLOR[r.status] || "text-ccb-muted"}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-ccb-border text-xs text-ccb-muted">
            <span>Page {page + 1} · {data.rows.length} rows</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2.5 py-1 rounded-lg bg-ccb-surface border border-ccb-border hover:border-ccb-primary/40 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.hasMore}
                className="px-2.5 py-1 rounded-lg bg-ccb-surface border border-ccb-border hover:border-ccb-primary/40 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
