"use client";

import { useEffect, useState, useCallback } from "react";
import { formatUsd, formatLocal, countryName } from "./sections";
import { COUNTRY_FLAGS } from "@/lib/geo/flags";

// ── Types ───────────────────────────────────────────────────────────────────

export interface MarketRow {
  code: string;
  currency: string;
  deposits: number;
  withdrawals: number;
  volume: number;
  revenue: number;
  fees: number;
  playerBalances: number;
  players: number;
  txCount: number;
  successfulTx: number;
  failedTx: number;
  openExceptions: number;
  reconciliationStatus: "clean" | "needs_review" | "minor";
  depositsLocal: number | null;
  withdrawalsLocal: number | null;
}

export type SettlementKind = "player_money" | "platform_revenue" | "company_funds";
export type SettlementStatus = "pending" | "in_transit" | "settled" | "reconciled";

export interface SettlementRow {
  id: string;
  country: string | null;
  currency: string;
  amount_local: number;
  amount_usd: number | null;
  kind: SettlementKind;
  provider_reference: string | null;
  settlement_date: string;
  status: SettlementStatus;
  notes: string | null;
  created_by: string;
  created_by_profile?: {
    username?: string | null;
    display_name?: string | null;
  } | null;
}

export interface AuditRow {
  id: string;
  created_at: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  transaction_ref: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  reason: string | null;
  admin_profile?: {
    username?: string | null;
    display_name?: string | null;
  } | null;
}

// ── 1. MarketsView ──────────────────────────────────────────────────────────

export function MarketsView() {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<MarketRow | null>(null);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/commandcentre/markets", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to fetch markets (${res.status})`);
      }
      const data = await res.json();
      const list: MarketRow[] = data.markets || [];
      // Sort by volume descending
      list.sort((a, b) => b.volume - a.volume);
      setMarkets(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load markets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  return (
    <div className="space-y-4 text-[13px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">14-Market Finance</h2>
          <p className="text-xs text-ccb-muted">
            Global USD reporting · Click any market row for local currency drilldown
          </p>
        </div>
        <button
          onClick={fetchMarkets}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-ccb-muted transition hover:border-violet-500 hover:text-white"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-ccb-border bg-ccb-card">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : markets.length === 0 ? (
        <div className="rounded-xl border border-ccb-border bg-ccb-card p-8 text-center text-ccb-muted">
          No market data available.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ccb-border bg-ccb-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ccb-border text-[11px] uppercase tracking-wider text-ccb-muted">
                  <th className="px-4 py-3 font-medium">Country</th>
                  <th className="px-4 py-3 text-right font-medium">Deposits USD</th>
                  <th className="px-4 py-3 text-right font-medium">Withdrawals USD</th>
                  <th className="px-4 py-3 text-right font-medium">Volume USD</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue USD</th>
                  <th className="px-4 py-3 text-right font-medium">Fees USD</th>
                  <th className="px-4 py-3 text-right font-medium">Player Balances USD</th>
                  <th className="px-4 py-3 text-right font-medium">Players</th>
                  <th className="px-4 py-3 text-center font-medium">Tx Count</th>
                  <th className="px-4 py-3 text-center font-medium">Recon Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ccb-border/60">
                {markets.map((m) => (
                  <tr
                    key={m.code}
                    onClick={() => setSelectedMarket(m)}
                    className="cursor-pointer transition hover:bg-ccb-surface"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                      <span className="mr-1.5">{COUNTRY_FLAGS[m.code] || "🏳"}</span>
                      {countryName(m.code)}{" "}
                      <span className="text-xs text-ccb-muted">({m.code})</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-emerald-400">
                      +{formatUsd(m.deposits)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-red-400">
                      −{formatUsd(m.withdrawals)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-white">
                      {formatUsd(m.volume)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium text-white">
                      {formatUsd(m.revenue)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ccb-muted">
                      {formatUsd(m.fees)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-white">
                      {formatUsd(m.playerBalances)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-white">
                      {m.players.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums">
                      <div className="font-medium text-white">{m.txCount}</div>
                      <div className="text-[11px] text-ccb-muted">
                        ({m.successfulTx} ok / {m.failedTx} fail)
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      {m.reconciliationStatus === "clean" && (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                          Clean
                        </span>
                      )}
                      {m.reconciliationStatus === "needs_review" && (
                        <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400">
                          Needs review
                        </span>
                      )}
                      {m.reconciliationStatus === "minor" && (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                          {m.openExceptions} minor issue{m.openExceptions > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drilldown Drawer */}
      {selectedMarket && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedMarket(null)}
          />
          <div className="fixed inset-y-0 right-0 z-50 w-[480px] max-w-full overflow-y-auto border-l border-ccb-border bg-ccb-card p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-ccb-border pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  <span className="mr-2">{COUNTRY_FLAGS[selectedMarket.code] || "🏳"}</span>
                  {countryName(selectedMarket.code)} ({selectedMarket.code})
                </h3>
                <p className="mt-1 text-xs text-violet-400">
                  Global reporting: USD · Local: {selectedMarket.currency}
                </p>
              </div>
              <button
                onClick={() => setSelectedMarket(null)}
                className="rounded-lg border border-ccb-border px-2.5 py-1 text-xs text-ccb-muted hover:border-violet-500 hover:text-white"
              >
                ✕ Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                  Deposits
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-400">
                  Deposits:{" "}
                  {formatLocal(selectedMarket.depositsLocal, selectedMarket.currency) ??
                    `0 ${selectedMarket.currency}`}{" "}
                  · {formatUsd(selectedMarket.deposits)}
                </p>
              </div>

              <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                  Withdrawals
                </p>
                <p className="mt-1 text-sm font-semibold text-red-400">
                  Withdrawals:{" "}
                  {formatLocal(selectedMarket.withdrawalsLocal, selectedMarket.currency) ??
                    `0 ${selectedMarket.currency}`}{" "}
                  · {formatUsd(selectedMarket.withdrawals)}
                </p>
              </div>

              <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                  Volume
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Volume: {formatUsd(selectedMarket.volume)}
                </p>
              </div>

              <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                  Revenue & Fees
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Revenue: {formatUsd(selectedMarket.revenue)}
                </p>
                <p className="mt-0.5 text-xs text-ccb-muted">
                  Fees collected: {formatUsd(selectedMarket.fees)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                    Player Balances
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {formatUsd(selectedMarket.playerBalances)}
                  </p>
                </div>
                <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                    Active Players
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {selectedMarket.players.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                  Transactions Split
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {selectedMarket.txCount} total ({selectedMarket.successfulTx} successful,{" "}
                  {selectedMarket.failedTx} failed)
                </p>
              </div>

              <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                  Reconciliation Status
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="capitalize font-semibold text-white">
                    {selectedMarket.reconciliationStatus.replace("_", " ")}
                  </span>
                  <span className="text-xs text-ccb-muted">
                    ({selectedMarket.openExceptions} open exception
                    {selectedMarket.openExceptions === 1 ? "" : "s"})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 2. SettlementsView ──────────────────────────────────────────────────────

export function SettlementsView() {
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("");

  // Create Form modal / panel
  const [showForm, setShowForm] = useState(false);
  const [formCountry, setFormCountry] = useState("");
  const [formCurrency, setFormCurrency] = useState("USD");
  const [formAmountLocal, setFormAmountLocal] = useState("");
  const [formAmountUsd, setFormAmountUsd] = useState("");
  const [formKind, setFormKind] = useState<SettlementKind>("player_money");
  const [formProviderRef, setFormProviderRef] = useState("");
  const [formSettlementDate, setFormSettlementDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [formStatus, setFormStatus] = useState<SettlementStatus>("pending");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (kindFilter !== "all") params.set("kind", kindFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (countryFilter.trim()) params.set("country", countryFilter.trim());

      const res = await fetch(`/api/admin/commandcentre/settlements?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch settlements (${res.status})`);
      }
      const data = await res.json();
      setSettlements(data.settlements || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load settlements");
    } finally {
      setLoading(false);
    }
  }, [kindFilter, statusFilter, countryFilter]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  const handleCreateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amountLocalNum = Number(formAmountLocal);
    if (!Number.isFinite(amountLocalNum) || amountLocalNum <= 0) {
      setFormError("Local amount must be a number greater than 0");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        country: formCountry.trim() || null,
        currency: formCurrency.trim() || "USD",
        amountLocal: amountLocalNum,
        amountUsd: formAmountUsd !== "" ? Number(formAmountUsd) : null,
        kind: formKind,
        providerReference: formProviderRef.trim() || null,
        settlementDate: formSettlementDate || new Date().toISOString().slice(0, 10),
        status: formStatus,
        notes: formNotes.trim() || null,
      };

      const res = await fetch("/api/admin/commandcentre/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to record settlement");
      }

      // Success
      setShowForm(false);
      setFormCountry("");
      setFormCurrency("USD");
      setFormAmountLocal("");
      setFormAmountUsd("");
      setFormKind("player_money");
      setFormProviderRef("");
      setFormSettlementDate(new Date().toISOString().slice(0, 10));
      setFormStatus("pending");
      setFormNotes("");
      fetchSettlements();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save settlement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 text-[13px]">
      {/* Top explainer banner */}
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-xs text-violet-200">
        Player money · CrazyChess revenue · Settled company funds are tracked separately.
      </div>

      {/* Control / Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ccb-border bg-ccb-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="mr-2 text-xs font-medium text-ccb-muted">Kind:</label>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
            >
              <option value="all">All kinds</option>
              <option value="player_money">Player money</option>
              <option value="platform_revenue">Platform revenue</option>
              <option value="company_funds">Company funds</option>
            </select>
          </div>

          <div>
            <label className="mr-2 text-xs font-medium text-ccb-muted">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="in_transit">In transit</option>
              <option value="settled">Settled</option>
              <option value="reconciled">Reconciled</option>
            </select>
          </div>

          <div>
            <label className="mr-2 text-xs font-medium text-ccb-muted">Country:</label>
            <input
              type="text"
              placeholder="e.g. MW"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="w-24 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none uppercase"
            />
          </div>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500"
        >
          {showForm ? "Cancel" : "Record settlement"}
        </button>
      </div>

      {/* Record settlement form panel */}
      {showForm && (
        <form
          onSubmit={handleCreateSettlement}
          className="space-y-4 rounded-xl border border-violet-500/40 bg-ccb-card p-5 shadow-lg"
        >
          <h3 className="text-sm font-semibold text-white">Record New Settlement</h3>

          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-ccb-muted">Country</label>
              <input
                type="text"
                placeholder="e.g. MW"
                value={formCountry}
                onChange={(e) => setFormCountry(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ccb-muted">Currency</label>
              <input
                type="text"
                placeholder="USD"
                value={formCurrency}
                onChange={(e) => setFormCurrency(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ccb-muted">
                Amount Local <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                step="any"
                required
                placeholder="e.g. 100000"
                value={formAmountLocal}
                onChange={(e) => setFormAmountLocal(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ccb-muted">Amount USD (optional)</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 100.00"
                value={formAmountUsd}
                onChange={(e) => setFormAmountUsd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ccb-muted">Kind</label>
            <div className="mt-1.5 flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-white">
                <input
                  type="radio"
                  name="settlementKind"
                  value="player_money"
                  checked={formKind === "player_money"}
                  onChange={() => setFormKind("player_money")}
                  className="accent-violet-500"
                />
                Player Money
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-white">
                <input
                  type="radio"
                  name="settlementKind"
                  value="platform_revenue"
                  checked={formKind === "platform_revenue"}
                  onChange={() => setFormKind("platform_revenue")}
                  className="accent-violet-500"
                />
                Platform Revenue
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-white">
                <input
                  type="radio"
                  name="settlementKind"
                  value="company_funds"
                  checked={formKind === "company_funds"}
                  onChange={() => setFormKind("company_funds")}
                  className="accent-violet-500"
                />
                Company Funds
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-ccb-muted">Provider Reference</label>
              <input
                type="text"
                placeholder="Ref / Tx ID"
                value={formProviderRef}
                onChange={(e) => setFormProviderRef(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ccb-muted">Settlement Date</label>
              <input
                type="date"
                value={formSettlementDate}
                onChange={(e) => setFormSettlementDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ccb-muted">Status</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as SettlementStatus)}
                className="mt-1 w-full rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
              >
                <option value="pending">Pending</option>
                <option value="in_transit">In transit</option>
                <option value="settled">Settled</option>
                <option value="reconciled">Reconciled</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ccb-muted">Notes</label>
            <input
              type="text"
              placeholder="Internal notes or context"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-ccb-muted hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save settlement"}
            </button>
          </div>
        </form>
      )}

      {/* Settlements Table */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-ccb-border bg-ccb-card">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : settlements.length === 0 ? (
        <div className="rounded-xl border border-ccb-border bg-ccb-card p-8 text-center text-ccb-muted">
          No settlements found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ccb-border bg-ccb-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ccb-border text-[11px] uppercase tracking-wider text-ccb-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Country</th>
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="px-4 py-3 text-right font-medium">Amount Local</th>
                  <th className="px-4 py-3 text-right font-medium">USD</th>
                  <th className="px-4 py-3 font-medium">Provider Ref</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                  <th className="px-4 py-3 font-medium">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ccb-border/60">
                {settlements.map((s) => (
                  <tr key={s.id} className="transition hover:bg-ccb-surface">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                      {s.settlement_date}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-white">
                      {s.country ? (
                        <>
                          <span className="mr-1">{COUNTRY_FLAGS[s.country] || "🏳"}</span>
                          {s.country}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {s.kind === "player_money" && (
                        <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                          Player Money
                        </span>
                      )}
                      {s.kind === "platform_revenue" && (
                        <span className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">
                          Platform Revenue
                        </span>
                      )}
                      {s.kind === "company_funds" && (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          Company Funds
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-white">
                      {formatLocal(s.amount_local, s.currency) ?? `${s.amount_local} ${s.currency}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-white font-medium">
                      {formatUsd(s.amount_usd)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ccb-muted">
                      {s.provider_reference || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                          s.status === "reconciled"
                            ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
                            : s.status === "settled"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : s.status === "in_transit"
                            ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {s.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-ccb-muted" title={s.notes || ""}>
                      {s.notes || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ccb-muted">
                      {s.created_by_profile?.username ||
                        s.created_by_profile?.display_name ||
                        "Admin"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 3. ReportsView ──────────────────────────────────────────────────────────

export function ReportsView() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [country, setCountry] = useState("");
  const [stream, setStream] = useState("all");

  const handleDownload = (reportName: string) => {
    const params = new URLSearchParams();
    params.set("report", reportName);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (country.trim()) params.set("country", country.trim().toUpperCase());
    if (stream && stream !== "all") params.set("stream", stream);

    window.open(`/api/admin/commandcentre/reports?${params.toString()}`);
  };

  const reports = [
    {
      id: "deposits",
      title: "Deposits",
      description: "Successful external deposits across all payment channels",
    },
    {
      id: "withdrawals",
      title: "Withdrawals",
      description: "Completed payouts + fees per player/country",
    },
    {
      id: "revenue",
      title: "Revenue",
      description: "Platform revenue by stream, USD consolidated",
      hasStreamFilter: true,
    },
    {
      id: "fees",
      title: "Fees",
      description: "Withdrawal fees collected from processed payouts",
    },
    {
      id: "volume",
      title: "Volume",
      description: "Daily transaction counts + USD volume totals",
      typeNote: "Note: daily transaction counts & USD volume",
    },
    {
      id: "balances",
      title: "Player Balances",
      description: "Current player wallet balances by country and USD value",
    },
    {
      id: "countries",
      title: "Country Performance",
      description: "90-day per-country summary of deposits, volume and revenue",
    },
    {
      id: "reconciliation",
      title: "Reconciliation",
      description: "Full exception queue with resolutions and provider amounts",
    },
  ];

  return (
    <div className="space-y-4 text-[13px]">
      <div>
        <h2 className="text-base font-semibold text-white">Downloadable Reports</h2>
        <p className="text-xs text-ccb-muted">
          Select parameters below and download consolidated CSV reports.
        </p>
      </div>

      {/* Shared Filter Controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ccb-border bg-ccb-card p-4">
        <div>
          <label className="block text-xs font-medium text-ccb-muted">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ccb-muted">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-1 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ccb-muted">Country Filter</label>
          <input
            type="text"
            placeholder="e.g. MW"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="mt-1 w-28 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none uppercase"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ccb-muted">Revenue Stream</label>
          <select
            value={stream}
            onChange={(e) => setStream(e.target.value)}
            className="mt-1 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
          >
            <option value="all">All streams</option>
            <option value="battles">Battles</option>
            <option value="tournaments">Tournaments</option>
            <option value="memberships">Memberships</option>
            <option value="ads">Ads</option>
            <option value="withdrawal_fees">Withdrawal fees</option>
          </select>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {reports.map((rep) => (
          <div
            key={rep.id}
            className="flex flex-col justify-between rounded-xl border border-ccb-border bg-ccb-card p-4 transition hover:border-violet-500/50"
          >
            <div>
              <h3 className="text-sm font-semibold text-white">{rep.title}</h3>
              <p className="mt-1 text-xs text-ccb-muted">{rep.description}</p>
              {rep.typeNote && (
                <p className="mt-2 text-[11px] font-medium text-violet-400">{rep.typeNote}</p>
              )}
            </div>

            <button
              onClick={() => handleDownload(rep.id)}
              className="mt-4 w-full rounded-lg border border-violet-500/40 bg-violet-600/20 py-2 text-xs font-semibold text-violet-300 transition hover:bg-violet-600 hover:text-white"
            >
              Download CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. AuditView ────────────────────────────────────────────────────────────

export function AuditView() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actionsList, setActionsList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [entityIdInput, setEntityIdInput] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Pagination
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Expand states for row state inspection
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const fetchAuditLog = useCallback(
    async (pageNum: number, append = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (actionFilter !== "all") params.set("action", actionFilter);
        if (entityTypeFilter !== "all") params.set("entity_type", entityTypeFilter);
        if (entityIdInput.trim()) params.set("entity_id", entityIdInput.trim());
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
        params.set("page", String(pageNum));
        params.set("limit", "50");

        const res = await fetch(`/api/admin/commandcentre/audit?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch audit log (${res.status})`);
        }
        const data = await res.json();
        const newRows: AuditRow[] = data.rows || [];

        if (data.actions && Array.isArray(data.actions)) {
          setActionsList(data.actions);
        }

        if (append) {
          setRows((prev) => [...prev, ...newRows]);
        } else {
          setRows(newRows);
        }
        setHasMore(Boolean(data.hasMore));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load audit log");
      } finally {
        setLoading(false);
      }
    },
    [actionFilter, entityTypeFilter, entityIdInput, fromDate, toDate]
  );

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
    fetchAuditLog(0, false);
  }, [fetchAuditLog]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchAuditLog(nextPage, true);
  };

  return (
    <div className="space-y-4 text-[13px]">
      <div>
        <h2 className="text-base font-semibold text-white">Financial Audit Log</h2>
        <p className="text-xs text-ccb-muted">
          Immutable historical records of financial administrative actions
        </p>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ccb-border bg-ccb-card p-4">
        <div>
          <label className="block text-xs font-medium text-ccb-muted">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="mt-1 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
          >
            <option value="all">All actions</option>
            {actionsList.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-ccb-muted">Entity Type</label>
          <select
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value)}
            className="mt-1 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
          >
            <option value="all">All entity types</option>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="exception">Exception</option>
            <option value="settlement">Settlement</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-ccb-muted">Entity ID</label>
          <input
            type="text"
            placeholder="Search entity ID"
            value={entityIdInput}
            onChange={(e) => setEntityIdInput(e.target.value)}
            className="mt-1 w-36 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white placeholder-ccb-muted focus:border-violet-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ccb-muted">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ccb-muted">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-1 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-ccb-border bg-ccb-card">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-ccb-border bg-ccb-card p-8 text-center text-ccb-muted">
          No audit records found matching criteria.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ccb-border bg-ccb-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ccb-border text-[11px] uppercase tracking-wider text-ccb-muted">
                  <th className="px-4 py-3 font-medium">Time (ISO)</th>
                  <th className="px-4 py-3 font-medium">Admin</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity Type</th>
                  <th className="px-4 py-3 font-medium">Entity ID</th>
                  <th className="px-4 py-3 font-medium">Transaction Ref</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ccb-border/60">
                {rows.map((r) => {
                  const isExpanded = expandedRowId === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setExpandedRowId(isExpanded ? null : r.id)}
                      className="cursor-pointer transition hover:bg-ccb-surface"
                    >
                      <td colSpan={7} className="p-0">
                        <div className="flex items-center px-4 py-3">
                          <div className="w-[18%] whitespace-nowrap font-mono text-xs text-ccb-muted">
                            {r.created_at}
                          </div>
                          <div className="w-[12%] whitespace-nowrap font-medium text-white">
                            {r.admin_profile?.username ||
                              r.admin_profile?.display_name ||
                              r.admin_id.slice(0, 8)}
                          </div>
                          <div className="w-[16%] whitespace-nowrap">
                            <span className="inline-block rounded border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-violet-400">
                              {r.action}
                            </span>
                          </div>
                          <div className="w-[12%] whitespace-nowrap capitalize text-white">
                            {r.entity_type}
                          </div>
                          <div className="w-[14%] whitespace-nowrap font-mono text-xs text-ccb-muted">
                            {r.entity_id ? r.entity_id.slice(0, 8) + "..." : "—"}
                          </div>
                          <div className="w-[14%] whitespace-nowrap font-mono text-xs text-ccb-muted">
                            {r.transaction_ref || "—"}
                          </div>
                          <div className="w-[14%] truncate text-xs text-ccb-muted" title={r.reason || ""}>
                            {r.reason || "—"}
                          </div>
                        </div>

                        {/* Expanded JSON view */}
                        {isExpanded && (
                          <div className="border-t border-ccb-border/60 bg-ccb-surface/80 p-4">
                            <p className="mb-2 text-xs font-semibold text-violet-400">
                              State Change Inspection
                            </p>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-[11px] font-medium uppercase text-red-400">
                                  Previous State
                                </p>
                                <pre className="max-h-60 overflow-auto rounded-lg border border-red-500/20 bg-red-500/5 p-3 font-mono text-[11px] text-red-300">
                                  {r.previous_state
                                    ? JSON.stringify(r.previous_state, null, 2)
                                    : "null"}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 text-[11px] font-medium uppercase text-emerald-400">
                                  New State
                                </p>
                                <pre className="max-h-60 overflow-auto rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 font-mono text-[11px] text-emerald-300">
                                  {r.new_state
                                    ? JSON.stringify(r.new_state, null, 2)
                                    : "null"}
                                </pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="border-t border-ccb-border p-3 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="rounded-lg border border-ccb-border bg-ccb-surface px-4 py-1.5 text-xs font-semibold text-white transition hover:border-violet-500 disabled:opacity-50"
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer immutable note */}
      <div className="text-center text-xs text-ccb-muted">
        Financial audit records are immutable.
      </div>
    </div>
  );
}
