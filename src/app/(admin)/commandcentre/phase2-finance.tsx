'use client';

import { useEffect, useState, useCallback } from "react";
import { formatUsd, formatLocal, timeAgo } from "./sections";
import { countryFlag } from "@/lib/geo/flags";
import { LEDGER_TYPE_LABELS, type LedgerType } from "@/lib/finance/phase2";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LedgerRow {
  id: string;
  type: LedgerType;
  method: string;
  provider: string | null;
  providerRef: string | null;
  playerId: string | null;
  playerName: string | null;
  country: string | null;
  localAmount: number | null;
  localCurrency: string | null;
  amountUsd: number | null;
  amountMwk: number;
  status: string;
  time: string;
  reference: string | null;
}

interface LedgerResponse {
  rows: LedgerRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  types: { id: string; label: string }[];
}

export interface DepositRow {
  id: string;
  user_id: string;
  amount: number;
  amount_local: number | null;
  currency: string | null;
  country: string | null;
  method: string;
  status: string;
  created_at: string;
  reference: string | null;
  pawapay_ref: string | null;
  paychangu_ref: string | null;
  payment_provider: string | null;
  operator: string | null;
  phone: string | null;
  admin_notes: string | null;
  profiles: { username?: string; display_name?: string } | null;
  amountUsd: number | null;
}

interface DepositsKpis {
  totalUsd: number;
  volumeCount: number;
  successful: number;
  pending: number;
  failed: number;
  successRate: number;
}

interface DepositsResponse {
  rows: DepositRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  kpis: DepositsKpis;
}

interface ProviderHistoryEvent {
  provider: string;
  provider_ref: string;
  direction: string;
  provider_status: string;
  amount_local: number | null;
  currency: string | null;
  country: string | null;
  received_at: string;
  raw_payload?: unknown;
}

interface DepositDetailResponse {
  deposit: {
    id: string;
    user_id: string;
    amount: number;
    amount_local: number | null;
    currency: string | null;
    country: string | null;
    method: string;
    status: string;
    created_at: string;
    updated_at: string | null;
    reference: string | null;
    pawapay_ref: string | null;
    paychangu_ref: string | null;
    charge_id: string | null;
    payment_provider: string | null;
    operator: string | null;
    phone: string | null;
    admin_notes: string | null;
    credited_by: string | null;
    fx_rate: number | null;
    profiles: { id: string; username?: string; display_name?: string; country?: string; wallet_balance?: number } | null;
  };
  providerHistory: ProviderHistoryEvent[];
  related: Array<{
    id: string;
    amount: number;
    currency: string | null;
    method: string;
    status: string;
    created_at: string;
    reference: string | null;
  }>;
  amountUsd: number | null;
}

export interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  amount_local: number | null;
  fee: number | null;
  net_amount: number | null;
  currency: string | null;
  country: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
  pawapay_ref: string | null;
  payment_provider: string | null;
  operator_name: string | null;
  phone: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  profiles: { username?: string; display_name?: string } | null;
  amountUsd: number | null;
}

interface WithdrawalsKpis {
  totalUsd: number;
  completed: number;
  pending: number;
  failed: number;
  feesUsd: number;
}

interface WithdrawalsResponse {
  rows: WithdrawalRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  queue: WithdrawalRow[];
  kpis: WithdrawalsKpis;
}

interface WithdrawalDetailResponse {
  withdrawal: {
    id: string;
    user_id: string;
    amount: number;
    amount_local: number | null;
    fee: number | null;
    net_amount: number | null;
    currency: string | null;
    country: string | null;
    status: string;
    created_at: string;
    updated_at: string | null;
    processed_at: string | null;
    processed_by: string | null;
    pawapay_ref: string | null;
    payment_provider: string | null;
    operator_name: string | null;
    phone: string | null;
    admin_notes: string | null;
    rejection_reason: string | null;
    bank_code: string | null;
    account_number: string | null;
    recipient_name: string | null;
    profiles: { id: string; username?: string; display_name?: string; country?: string; wallet_balance?: number } | null;
  };
  providerHistory: ProviderHistoryEvent[];
  processor: { username?: string; display_name?: string } | null;
  amountUsd: number | null;
  feeUsd: number | null;
}

// ── Common Helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  let color = "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  if (s === "completed" || s === "success") {
    color = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  } else if (s === "pending" || s === "processing" || s === "approved") {
    color = "bg-amber-400/10 text-amber-400 border-amber-400/20";
  } else if (s === "failed" || s === "rejected") {
    color = "bg-red-500/10 text-red-400 border-red-500/20";
  } else if (s === "cancelled") {
    color = "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${color}`}>
      {status}
    </span>
  );
}

function CountryBadge({ country }: { country: string | null }) {
  if (!country) return <span className="text-ccb-muted">—</span>;
  const flag = countryFlag(country);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs text-white">
      {flag && <span>{flag}</span>}
      <span>{country.toUpperCase()}</span>
    </span>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-ccb-border bg-ccb-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ccb-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-ccb-muted">{hint}</p>}
    </div>
  );
}

// ── Component 1: LedgerView ──────────────────────────────────────────────────

export function LedgerView() {
  const [typesList, setTypesList] = useState<{ id: string; label: string }[]>([]);
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [country, setCountry] = useState<string>("");
  const [player, setPlayer] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [min, setMin] = useState<string>("");
  const [max, setMax] = useState<string>("");
  const [sort, setSort] = useState<"time" | "amount">("time");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [page, setPage] = useState<number>(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/commandcentre/ledger", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: LedgerResponse) => {
        if (data.types) setTypesList(data.types);
      })
      .catch(() => {});
  }, []);

  const handleFilterChange = useCallback(() => {
    setPage(0);
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    if (country.trim()) params.set("country", country.trim().toUpperCase());
    if (player.trim()) params.set("player", player.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    if (sort !== "time") params.set("sort", sort);
    if (order !== "desc") params.set("order", order);
    params.set("page", page.toString());
    params.set("limit", "50");

    fetch(`/api/admin/commandcentre/ledger?${params.toString()}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load ledger data");
        return res.json();
      })
      .then((data: LedgerResponse) => {
        if (ignore) return;
        if (page === 0) {
          setRows(data.rows || []);
        } else {
          setRows((prev) => [...prev, ...(data.rows || [])]);
        }
        setTotal(data.total || 0);
        setHasMore(data.hasMore || false);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [type, status, country, player, from, to, min, max, sort, order, page]);

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    if (country.trim()) params.set("country", country.trim().toUpperCase());
    if (player.trim()) params.set("player", player.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    if (sort !== "time") params.set("sort", sort);
    if (order !== "desc") params.set("order", order);
    params.set("format", "csv");
    window.open(`/api/admin/commandcentre/ledger?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Unified Transaction Ledger</h2>
          <p className="text-xs text-ccb-muted">Showing {rows.length} of {total} transactions</p>
        </div>
        <button
          onClick={handleExportCsv}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] font-semibold text-white hover:border-violet-500/60 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ccb-border bg-ccb-card p-3">
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); handleFilterChange(); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        >
          <option value="all">All Types</option>
          {typesList.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); handleFilterChange(); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <input
          type="text"
          placeholder="ISO-2 Country"
          maxLength={2}
          value={country}
          onChange={(e) => { setCountry(e.target.value); handleFilterChange(); }}
          className="w-28 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none uppercase"
        />

        <input
          type="text"
          placeholder="Player search..."
          value={player}
          onChange={(e) => { setPlayer(e.target.value); handleFilterChange(); }}
          className="w-36 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
        />

        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); handleFilterChange(); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        />

        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); handleFilterChange(); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        />

        <input
          type="number"
          placeholder="Min $"
          value={min}
          onChange={(e) => { setMin(e.target.value); handleFilterChange(); }}
          className="w-24 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
        />

        <input
          type="number"
          placeholder="Max $"
          value={max}
          onChange={(e) => { setMax(e.target.value); handleFilterChange(); }}
          className="w-24 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
        />

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as "time" | "amount"); handleFilterChange(); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        >
          <option value="time">Sort by Time</option>
          <option value="amount">Sort by Amount</option>
        </select>

        <select
          value={order}
          onChange={(e) => { setOrder(e.target.value as "asc" | "desc"); handleFilterChange(); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        >
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-ccb-border bg-ccb-card">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-ccb-border bg-ccb-surface/50 text-[11px] font-semibold uppercase tracking-wider text-ccb-muted">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Original Amt</th>
              <th className="px-4 py-3">Currency</th>
              <th className="px-4 py-3">USD</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Provider Ref</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ccb-border/40">
            {rows.map((row) => {
              const typeLabel = LEDGER_TYPE_LABELS[row.type] || row.type;
              const shortId = row.id.slice(0, 8);
              const shortRef = row.providerRef ? (row.providerRef.length > 12 ? `${row.providerRef.slice(0, 12)}…` : row.providerRef) : "—";
              return (
                <tr key={row.id} className="hover:bg-ccb-surface/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-white" title={row.id}>
                    {shortId}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[11px] font-medium text-violet-300">
                      {typeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white">
                    {row.playerName || row.playerId?.slice(0, 8) || "Unknown"}
                  </td>
                  <td className="px-4 py-3">
                    <CountryBadge country={row.country} />
                  </td>
                  <td className="px-4 py-3 font-mono text-white">
                    {formatLocal(row.localAmount, row.localCurrency) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ccb-muted font-mono text-xs">
                    {row.localCurrency || "MWK"}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-white">
                    {formatUsd(row.amountUsd)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ccb-muted" title={row.providerRef || ""}>
                    {shortRef}
                  </td>
                  <td className="px-4 py-3 text-xs text-ccb-muted" title={new Date(row.time).toISOString()}>
                    {timeAgo(row.time)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-ccb-muted">
                  No transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination button */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setPage((prev) => prev + 1)}
            disabled={loading}
            className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
          >
            {loading ? "Loading..." : "Load older"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Component 2: DepositsView ────────────────────────────────────────────────

export function DepositsView() {
  const [country, setCountry] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [network, setNetwork] = useState("all");
  const [player, setPlayer] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [page, setPage] = useState(0);

  const [data, setData] = useState<DepositsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DepositDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (country.trim()) params.set("country", country.trim().toUpperCase());
    if (network !== "all") params.set("network", network);
    if (player.trim()) params.set("player", player.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    params.set("page", page.toString());
    params.set("limit", "50");

    fetch(`/api/admin/commandcentre/deposits?${params.toString()}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load deposits");
        return res.json();
      })
      .then((resData: DepositsResponse) => {
        if (ignore) return;
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Error loading deposits");
        setLoading(false);
      });

    return () => { ignore = true; };
  }, [country, from, to, status, network, player, min, max, page]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let ignore = false;
    setDetailLoading(true);
    setDetailError(null);

    fetch(`/api/admin/commandcentre/deposits?id=${encodeURIComponent(selectedId)}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load deposit detail");
        return res.json();
      })
      .then((resDetail: DepositDetailResponse) => {
        if (ignore) return;
        setDetail(resDetail);
        setDetailLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setDetailError(err instanceof Error ? err.message : "Error loading detail");
        setDetailLoading(false);
      });

    return () => { ignore = true; };
  }, [selectedId]);

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (country.trim()) params.set("country", country.trim().toUpperCase());
    if (network !== "all") params.set("network", network);
    if (player.trim()) params.set("player", player.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    params.set("format", "csv");
    window.open(`/api/admin/commandcentre/deposits?${params.toString()}`, "_blank");
  };

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Deposit Management</h2>
          <p className="text-xs text-ccb-muted">Track and inspect player deposit volume across providers</p>
        </div>
        <button
          onClick={handleExportCsv}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] font-semibold text-white hover:border-violet-500/60 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Deposits" value={formatUsd(kpis?.totalUsd ?? 0)} />
        <StatCard label="Deposit Volume" value={kpis?.volumeCount ?? 0} />
        <StatCard label="Successful" value={kpis?.successful ?? 0} />
        <StatCard label="Pending" value={kpis?.pending ?? 0} />
        <StatCard label="Failed" value={kpis?.failed ?? 0} />
        <StatCard label="Success Rate" value={`${kpis?.successRate ?? 0}%`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ccb-border bg-ccb-card p-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={network}
          onChange={(e) => { setNetwork(e.target.value); setPage(0); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        >
          <option value="all">All Networks / Providers</option>
          <option value="pawapay">Pawapay</option>
          <option value="paychangu">PayChangu</option>
          <option value="mobile_money">Mobile Money</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank Transfer</option>
        </select>

        <input
          type="text"
          placeholder="ISO-2 Country"
          maxLength={2}
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(0); }}
          className="w-28 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none uppercase"
        />

        <input
          type="text"
          placeholder="Player search..."
          value={player}
          onChange={(e) => { setPlayer(e.target.value); setPage(0); }}
          className="w-36 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
        />

        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(0); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        />

        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(0); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        />

        <input
          type="number"
          placeholder="Min $"
          value={min}
          onChange={(e) => { setMin(e.target.value); setPage(0); }}
          className="w-24 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
        />

        <input
          type="number"
          placeholder="Max $"
          value={max}
          onChange={(e) => { setMax(e.target.value); setPage(0); }}
          className="w-24 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-ccb-border bg-ccb-card">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-ccb-border bg-ccb-surface/50 text-[11px] font-semibold uppercase tracking-wider text-ccb-muted">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Amount Local</th>
              <th className="px-4 py-3">Amount USD</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Provider Ref</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ccb-border/40">
            {data?.rows.map((row) => {
              const shortId = row.id.slice(0, 8);
              const pRef = row.pawapay_ref || row.paychangu_ref || row.reference;
              const shortRef = pRef ? (pRef.length > 12 ? `${pRef.slice(0, 12)}…` : pRef) : "—";
              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className="hover:bg-ccb-surface/60 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-white" title={row.id}>
                    {shortId}
                  </td>
                  <td className="px-4 py-3 text-white">
                    {row.profiles?.username || row.profiles?.display_name || row.user_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <CountryBadge country={row.country} />
                  </td>
                  <td className="px-4 py-3 font-mono text-white">
                    {formatLocal(row.amount_local, row.currency) ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-white">
                    {formatUsd(row.amountUsd)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ccb-muted" title={pRef || ""}>
                    {shortRef}
                  </td>
                  <td className="px-4 py-3 text-xs text-ccb-muted truncate max-w-[150px]">
                    {row.admin_notes || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-ccb-muted" title={new Date(row.created_at).toISOString()}>
                    {timeAgo(row.created_at)}
                  </td>
                </tr>
              );
            })}
            {(!data || data.rows.length === 0) && !loading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-ccb-muted">
                  No deposits found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {data && (data.total > 50 || page > 0) && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-ccb-muted">
            Page {page + 1} (Showing {data.rows.length} of {data.total})
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:border-violet-500/60 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.hasMore || loading}
              className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:border-violet-500/60 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedId && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/60 transition-opacity"
            onClick={() => setSelectedId(null)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-[480px] overflow-y-auto border-l border-ccb-border bg-ccb-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ccb-border pb-4">
              <h3 className="text-base font-semibold text-white">Deposit Detail</h3>
              <button
                onClick={() => setSelectedId(null)}
                className="rounded-lg p-1 text-ccb-muted hover:bg-ccb-surface hover:text-white"
              >
                ✕
              </button>
            </div>
            {detailLoading && <p className="mt-4 text-xs text-ccb-muted">Loading detail...</p>}
            {detailError && <p className="mt-4 text-xs text-red-400">{detailError}</p>}
            {detail && (
              <div className="mt-4 space-y-6 text-xs text-white">
                <div>
                  <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ccb-muted mb-2">
                    Deposit Information
                  </h4>
                  <div className="space-y-1.5 rounded-lg border border-ccb-border bg-ccb-surface p-3">
                    <div className="flex justify-between"><span className="text-ccb-muted">ID:</span> <span className="font-mono">{detail.deposit.id}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Status:</span> <StatusBadge status={detail.deposit.status} /></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Amount Local:</span> <span>{formatLocal(detail.deposit.amount_local, detail.deposit.currency) ?? '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">USD Equivalent:</span> <span>{formatUsd(detail.amountUsd)}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Method:</span> <span>{detail.deposit.method}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Provider:</span> <span>{detail.deposit.payment_provider || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Operator:</span> <span>{detail.deposit.operator || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Phone:</span> <span>{detail.deposit.phone || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Country:</span> <CountryBadge country={detail.deposit.country} /></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Reference:</span> <span className="font-mono">{detail.deposit.reference || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Pawapay Ref:</span> <span className="font-mono">{detail.deposit.pawapay_ref || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">PayChangu Ref:</span> <span className="font-mono">{detail.deposit.paychangu_ref || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Admin Notes:</span> <span>{detail.deposit.admin_notes || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Created:</span> <span>{new Date(detail.deposit.created_at).toLocaleString()}</span></div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ccb-muted mb-2">
                    Player Details
                  </h4>
                  <div className="space-y-1.5 rounded-lg border border-ccb-border bg-ccb-surface p-3">
                    <div className="flex justify-between"><span className="text-ccb-muted">User ID:</span> <span className="font-mono">{detail.deposit.user_id}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Username:</span> <span>{detail.deposit.profiles?.username || detail.deposit.profiles?.display_name || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Wallet Balance:</span> <span>{formatLocal(detail.deposit.profiles?.wallet_balance ?? null, detail.deposit.currency) ?? '—'}</span></div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ccb-muted mb-2">
                    Provider History ({detail.providerHistory.length})
                  </h4>
                  {detail.providerHistory.length === 0 ? (
                    <p className="text-ccb-muted italic">No provider events recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.providerHistory.map((ev, i) => (
                        <div key={i} className="rounded-lg border border-ccb-border bg-ccb-surface p-3 space-y-1">
                          <div className="flex justify-between font-semibold">
                            <span>{ev.provider} ({ev.direction})</span>
                            <StatusBadge status={ev.provider_status} />
                          </div>
                          <div className="text-ccb-muted">Ref: <span className="font-mono text-white">{ev.provider_ref}</span></div>
                          <div className="text-ccb-muted">Amount: <span className="text-white">{formatLocal(ev.amount_local, ev.currency) ?? '—'}</span></div>
                          <div className="text-ccb-muted">Received: <span className="text-white">{new Date(ev.received_at).toLocaleString()}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ccb-muted mb-2">
                    Related Recent Transactions ({detail.related.length})
                  </h4>
                  {detail.related.length === 0 ? (
                    <p className="text-ccb-muted italic">No related transactions found.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.related.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-lg border border-ccb-border bg-ccb-surface p-2.5 text-xs">
                          <div>
                            <p className="font-medium text-white">{r.method}</p>
                            <p className="text-[11px] text-ccb-muted">{timeAgo(r.created_at)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-white">{formatLocal(r.amount, r.currency)}</p>
                            <StatusBadge status={r.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component 3: WithdrawalsView ─────────────────────────────────────────────

export function WithdrawalsView() {
  const [country, setCountry] = useState("");
  const [player, setPlayer] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [page, setPage] = useState(0);

  const [data, setData] = useState<WithdrawalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WithdrawalDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (country.trim()) params.set("country", country.trim().toUpperCase());
    if (player.trim()) params.set("player", player.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    params.set("page", page.toString());
    params.set("limit", "50");

    fetch(`/api/admin/commandcentre/withdrawals?${params.toString()}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load withdrawals");
        return res.json();
      })
      .then((resData: WithdrawalsResponse) => {
        if (ignore) return;
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Error loading withdrawals");
        setLoading(false);
      });

    return () => { ignore = true; };
  }, [country, player, status, from, to, min, max, page]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let ignore = false;
    setDetailLoading(true);
    setDetailError(null);

    fetch(`/api/admin/commandcentre/withdrawals?id=${encodeURIComponent(selectedId)}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load withdrawal detail");
        return res.json();
      })
      .then((resDetail: WithdrawalDetailResponse) => {
        if (ignore) return;
        setDetail(resDetail);
        setDetailLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setDetailError(err instanceof Error ? err.message : "Error loading detail");
        setDetailLoading(false);
      });

    return () => { ignore = true; };
  }, [selectedId]);

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (country.trim()) params.set("country", country.trim().toUpperCase());
    if (player.trim()) params.set("player", player.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    params.set("format", "csv");
    window.open(`/api/admin/commandcentre/withdrawals?${params.toString()}`, "_blank");
  };

  const kpis = data?.kpis;
  const queue = data?.queue || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Withdrawal Management</h2>
          <p className="text-xs text-ccb-muted">Monitor payout requests, pending approvals, and fee collection</p>
        </div>
        <button
          onClick={handleExportCsv}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] font-semibold text-white hover:border-violet-500/60 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Volume" value={formatUsd(kpis?.totalUsd ?? 0)} />
        <StatCard label="Completed" value={kpis?.completed ?? 0} />
        <StatCard label="Pending" value={kpis?.pending ?? 0} />
        <StatCard label="Failed" value={kpis?.failed ?? 0} />
        <StatCard label="Fees Collected" value={formatUsd(kpis?.feesUsd ?? 0)} />
      </div>

      {/* Pending Withdrawals Queue Panel */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-amber-400">Pending Withdrawals Queue</h3>
            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-300">
              {queue.length}
            </span>
          </div>
          <a
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition-colors"
          >
            Review in Admin Panel →
          </a>
        </div>

        {queue.length === 0 ? (
          <p className="text-xs text-ccb-muted">No pending withdrawals in queue.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {queue.map((q) => (
              <div key={q.id} className="rounded-lg border border-ccb-border bg-ccb-card p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    {q.profiles?.username || q.profiles?.display_name || q.user_id.slice(0, 8)}
                  </span>
                  <CountryBadge country={q.country} />
                </div>
                <div className="flex items-center justify-between font-mono">
                  <span className="text-ccb-muted">{formatLocal(q.amount_local, q.currency) ?? "—"}</span>
                  <span className="text-white font-medium">{formatUsd(q.amountUsd)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-ccb-muted pt-1">
                  <span>Age: {timeAgo(q.created_at)}</span>
                  <span>Operator: {q.operator_name || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ccb-border bg-ccb-card p-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>

        <input
          type="text"
          placeholder="ISO-2 Country"
          maxLength={2}
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(0); }}
          className="w-28 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none uppercase"
        />

        <input
          type="text"
          placeholder="Player search..."
          value={player}
          onChange={(e) => { setPlayer(e.target.value); setPage(0); }}
          className="w-36 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
        />

        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(0); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        />

        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(0); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white focus:border-violet-500 focus:outline-none"
        />

        <input
          type="number"
          placeholder="Min $"
          value={min}
          onChange={(e) => { setMin(e.target.value); setPage(0); }}
          className="w-24 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
        />

        <input
          type="number"
          placeholder="Max $"
          value={max}
          onChange={(e) => { setMax(e.target.value); setPage(0); }}
          className="w-24 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-[13px] text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-ccb-border bg-ccb-card">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-ccb-border bg-ccb-surface/50 text-[11px] font-semibold uppercase tracking-wider text-ccb-muted">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Amount Local</th>
              <th className="px-4 py-3">Amount USD</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payout Ref</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ccb-border/40">
            {data?.rows.map((row) => {
              const shortId = row.id.slice(0, 8);
              const pRef = row.pawapay_ref;
              const shortRef = pRef ? (pRef.length > 12 ? `${pRef.slice(0, 12)}…` : pRef) : "—";
              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className="hover:bg-ccb-surface/60 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-white" title={row.id}>
                    {shortId}
                  </td>
                  <td className="px-4 py-3 text-white">
                    {row.profiles?.username || row.profiles?.display_name || row.user_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <CountryBadge country={row.country} />
                  </td>
                  <td className="px-4 py-3 font-mono text-white">
                    {formatLocal(row.amount_local, row.currency) ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-white">
                    {formatUsd(row.amountUsd)}
                  </td>
                  <td className="px-4 py-3 font-mono text-ccb-muted">
                    {formatLocal(row.fee, row.currency) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ccb-muted" title={pRef || ""}>
                    {shortRef}
                  </td>
                  <td className="px-4 py-3 text-xs text-ccb-muted" title={new Date(row.created_at).toISOString()}>
                    {timeAgo(row.created_at)}
                  </td>
                </tr>
              );
            })}
            {(!data || data.rows.length === 0) && !loading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-ccb-muted">
                  No withdrawals found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {data && (data.total > 50 || page > 0) && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-ccb-muted">
            Page {page + 1} (Showing {data.rows.length} of {data.total})
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:border-violet-500/60 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.hasMore || loading}
              className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:border-violet-500/60 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedId && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/60 transition-opacity"
            onClick={() => setSelectedId(null)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-[480px] overflow-y-auto border-l border-ccb-border bg-ccb-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ccb-border pb-4">
              <h3 className="text-base font-semibold text-white">Withdrawal Detail</h3>
              <button
                onClick={() => setSelectedId(null)}
                className="rounded-lg p-1 text-ccb-muted hover:bg-ccb-surface hover:text-white"
              >
                ✕
              </button>
            </div>
            {detailLoading && <p className="mt-4 text-xs text-ccb-muted">Loading detail...</p>}
            {detailError && <p className="mt-4 text-xs text-red-400">{detailError}</p>}
            {detail && (
              <div className="mt-4 space-y-6 text-xs text-white">
                <div>
                  <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ccb-muted mb-2">
                    Withdrawal Information
                  </h4>
                  <div className="space-y-1.5 rounded-lg border border-ccb-border bg-ccb-surface p-3">
                    <div className="flex justify-between"><span className="text-ccb-muted">ID:</span> <span className="font-mono">{detail.withdrawal.id}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Status:</span> <StatusBadge status={detail.withdrawal.status} /></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Amount Local:</span> <span>{formatLocal(detail.withdrawal.amount_local, detail.withdrawal.currency) ?? '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">USD Equivalent:</span> <span>{formatUsd(detail.amountUsd)}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Fee:</span> <span>{formatLocal(detail.withdrawal.fee, detail.withdrawal.currency) ?? '—'} ({formatUsd(detail.feeUsd)})</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Net Amount:</span> <span>{formatLocal(detail.withdrawal.net_amount, detail.withdrawal.currency) ?? '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Provider:</span> <span>{detail.withdrawal.payment_provider || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Operator:</span> <span>{detail.withdrawal.operator_name || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Phone:</span> <span>{detail.withdrawal.phone || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Bank Code:</span> <span>{detail.withdrawal.bank_code || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Account Number:</span> <span>{detail.withdrawal.account_number || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Recipient Name:</span> <span>{detail.withdrawal.recipient_name || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Country:</span> <CountryBadge country={detail.withdrawal.country} /></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Payout Ref:</span> <span className="font-mono">{detail.withdrawal.pawapay_ref || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Processed By:</span> <span>{detail.processor?.username || detail.processor?.display_name || detail.withdrawal.processed_by || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Rejection Reason:</span> <span className="text-red-400">{detail.withdrawal.rejection_reason || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Admin Notes:</span> <span>{detail.withdrawal.admin_notes || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Created:</span> <span>{new Date(detail.withdrawal.created_at).toLocaleString()}</span></div>
                    {detail.withdrawal.processed_at && (
                      <div className="flex justify-between"><span className="text-ccb-muted">Processed:</span> <span>{new Date(detail.withdrawal.processed_at).toLocaleString()}</span></div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ccb-muted mb-2">
                    Player Details
                  </h4>
                  <div className="space-y-1.5 rounded-lg border border-ccb-border bg-ccb-surface p-3">
                    <div className="flex justify-between"><span className="text-ccb-muted">User ID:</span> <span className="font-mono">{detail.withdrawal.user_id}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Username:</span> <span>{detail.withdrawal.profiles?.username || detail.withdrawal.profiles?.display_name || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ccb-muted">Wallet Balance:</span> <span>{formatLocal(detail.withdrawal.profiles?.wallet_balance ?? null, detail.withdrawal.currency) ?? '—'}</span></div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ccb-muted mb-2">
                    Provider History ({detail.providerHistory.length})
                  </h4>
                  {detail.providerHistory.length === 0 ? (
                    <p className="text-ccb-muted italic">No provider events recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.providerHistory.map((ev, i) => (
                        <div key={i} className="rounded-lg border border-ccb-border bg-ccb-surface p-3 space-y-1">
                          <div className="flex justify-between font-semibold">
                            <span>{ev.provider} ({ev.direction})</span>
                            <StatusBadge status={ev.provider_status} />
                          </div>
                          <div className="text-ccb-muted">Ref: <span className="font-mono text-white">{ev.provider_ref}</span></div>
                          <div className="text-ccb-muted">Amount: <span className="text-white">{formatLocal(ev.amount_local, ev.currency) ?? '—'}</span></div>
                          <div className="text-ccb-muted">Received: <span className="text-white">{new Date(ev.received_at).toLocaleString()}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
