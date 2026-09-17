"use client";
import { AlertTriangle, Check, X } from "lucide-react";

import { useState, useEffect, useCallback } from "react";
import { formatUsd, formatLocal, timeAgo, countryName } from "./sections";
import { COUNTRY_FLAGS } from "@/lib/geo/flags";
import {
  LEDGER_TYPE_LABELS,
  type ReconSummary,
  type ReconExceptionRow,
  type WalletEntry,
  type LedgerType,
  type ReconExceptionKind,
} from "@/lib/finance/phase2";
import type { FeedStatus } from "./types";

// ── Exception Types & Helpers ───────────────────────────────────────────────

export interface NormalizedException extends ReconExceptionRow {
  resolvedByProfile?: { username?: string; display_name?: string } | null;
}

function normalizeExceptionRow(raw: any): NormalizedException {
  return {
    id: String(raw.id || ""),
    kind: raw.kind as ReconExceptionKind,
    provider: raw.provider ?? null,
    providerRef: raw.provider_ref ?? raw.providerRef ?? null,
    entityType: raw.entity_type ?? raw.entityType ?? "none",
    entityId: raw.entity_id ?? raw.entityId ?? null,
    country: raw.country ?? null,
    currency: raw.currency ?? null,
    providerAmount:
      raw.provider_amount != null
        ? Number(raw.provider_amount)
        : raw.providerAmount != null
        ? Number(raw.providerAmount)
        : null,
    internalAmount:
      raw.internal_amount != null
        ? Number(raw.internal_amount)
        : raw.internalAmount != null
        ? Number(raw.internalAmount)
        : null,
    difference: raw.difference != null ? Number(raw.difference) : null,
    providerStatus: raw.provider_status ?? raw.providerStatus ?? null,
    internalStatus: raw.internal_status ?? raw.internalStatus ?? null,
    severity: raw.severity ?? "info",
    detectedAt: raw.detected_at ?? raw.detectedAt ?? new Date().toISOString(),
    resolved: Boolean(raw.resolved),
    resolvedBy: raw.resolved_by ?? raw.resolvedBy ?? null,
    resolvedAt: raw.resolved_at ?? raw.resolvedAt ?? null,
    resolutionAction: raw.resolution_action ?? raw.resolutionAction ?? null,
    resolutionNote: raw.resolution_note ?? raw.resolutionNote ?? null,
    resolvedByProfile: raw.resolved_by_profile ?? raw.resolvedByProfile ?? null,
  };
}

const EXCEPTION_KIND_LABELS: Record<string, string> = {
  amount_mismatch: "Amount mismatch",
  status_mismatch: "Status mismatch",
  unmatched_provider: "Unmatched provider",
  duplicate_internal: "Duplicate internal",
  missing_provider_record: "Missing provider record",
  stuck_pending: "Stuck pending",
};

function humanizeKind(kind: string): string {
  return EXCEPTION_KIND_LABELS[kind] || kind.replace(/_/g, " ");
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles =
    severity === "critical"
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : severity === "warning"
      ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${styles}`}>
      {severity}
    </span>
  );
}

function FeedStatusBadge({ status }: { status: FeedStatus | string }) {
  const s = (status || "").toLowerCase();
  const styles =
    s === "completed" || s === "success"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : s === "pending" || s === "processing" || s === "approved"
      ? "bg-amber-400/10 text-amber-400 border-amber-400/20"
      : s === "failed" || s === "rejected"
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      {status}
    </span>
  );
}

// ── 1. ReconciliationView Component ─────────────────────────────────────────

interface ReconciliationData {
  summary: ReconSummary;
  exceptions: NormalizedException[];
  resolvedRecent: NormalizedException[];
  sync: { inserted: number; autoResolved: number };
}

export function ReconciliationView() {
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve Drawer state
  const [selectedException, setSelectedException] = useState<NormalizedException | null>(null);
  const [action, setAction] = useState<"confirm_match" | "adjust" | "dismiss">("confirm_match");
  const [note, setNote] = useState("");
  const [adjustAmountMwk, setAdjustAmountMwk] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Resolved history toggle
  const [resolvedHistoryOpen, setResolvedHistoryOpen] = useState(false);

  const fetchReconciliation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/commandcentre/reconciliation", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Reconciliation failed: HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData({
        summary: json.summary,
        exceptions: (json.exceptions || []).map(normalizeExceptionRow),
        resolvedRecent: (json.resolvedRecent || []).map(normalizeExceptionRow),
        sync: json.sync || { inserted: 0, autoResolved: 0 },
      });
    } catch (e: any) {
      setError(e.message || "Failed to run reconciliation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReconciliation();
  }, [fetchReconciliation]);

  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  const handleOpenResolveModal = (ex: NormalizedException) => {
    setSelectedException(ex);
    setAction("confirm_match");
    setNote("");
    setAdjustAmountMwk("");
    setSubmitError(null);
  };

  const handleCloseResolveModal = () => {
    setSelectedException(null);
    setSubmitError(null);
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedException) return;

    if (!note || note.trim().length < 5) {
      setSubmitError("A resolution note of at least 5 characters is required");
      return;
    }

    if (action === "adjust") {
      const amt = Number(adjustAmountMwk);
      if (!adjustAmountMwk || isNaN(amt) || amt === 0) {
        setSubmitError("Adjustment amount (MWK) is required and must be non-zero");
        return;
      }
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload: any = {
        id: selectedException.id,
        action,
        note: note.trim(),
      };
      if (action === "adjust") {
        payload.adjustAmountMwk = Number(adjustAmountMwk);
      }

      const res = await fetch("/api/admin/commandcentre/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      if (res.status === 409) {
        setSubmitError("Exception already resolved");
        await fetchReconciliation();
        return;
      }

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to resolve exception");
      }

      setToastMessage("Exception resolved successfully");
      handleCloseResolveModal();
      await fetchReconciliation();
    } catch (e: any) {
      setSubmitError(e.message || "Failed to resolve exception");
    } finally {
      setSubmitting(false);
    }
  };

  const summary = data?.summary;
  const issuesCount = summary ? summary.failed + summary.amountMismatches + summary.statusMismatches : 0;

  return (
    <div className="space-y-6 text-[13px] text-white">
      {/* Top Header & Run Reconciliation Action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Reconciliation Engine</h2>
          <p className="text-xs text-ccb-muted">
            Cross-check CrazyChess ledger against provider payment callbacks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {summary?.checkedAt && (
            <span className="text-xs text-ccb-muted">
              Last checked: {timeAgo(summary.checkedAt)}
            </span>
          )}
          <button
            onClick={fetchReconciliation}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Running reconciliation...</span>
              </>
            ) : (
              <span>Run reconciliation</span>
            )}
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
          <Check className="h-4 w-4 shrink-0" />
          {toastMessage}
        </div>
      )}

      {/* Main Error */}
      {error && (
        <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Reconciliation Summary Panel */}
      {summary && (
        <div className="rounded-xl border border-ccb-border bg-ccb-card p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ccb-muted">
                Provider Volume
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-white">
                {summary.providerTransactions.toLocaleString()} transactions
              </p>
            </div>

            {/* Status Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {summary.matched.toLocaleString()} Matched
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                {summary.pending.toLocaleString()} Pending
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {issuesCount.toLocaleString()} Issues
              </span>
            </div>
          </div>

          {/* Small detail metrics */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6 border-t border-ccb-border pt-3 text-xs text-ccb-muted">
            <div>
              <span className="block text-[11px] uppercase tracking-wider">Amount Mismatches</span>
              <span className="text-sm font-semibold text-white">{summary.amountMismatches}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider">Status Mismatches</span>
              <span className="text-sm font-semibold text-white">{summary.statusMismatches}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider">Duplicates</span>
              <span className="text-sm font-semibold text-white">{summary.duplicates}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider">Unmatched Provider</span>
              <span className="text-sm font-semibold text-white">{summary.unmatched}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider">Missing Provider</span>
              <span className="text-sm font-semibold text-white">{summary.missingProviderRecords}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider">Stuck Pending</span>
              <span className="text-sm font-semibold text-white">{summary.stuckPending}</span>
            </div>
          </div>

          {/* Sync status & Immature store note */}
          <div className="flex flex-col gap-1 border-t border-ccb-border/60 pt-2 text-[11px] text-ccb-muted sm:flex-row sm:items-center sm:justify-between">
            {data?.sync && (
              <span>
                Engine sync: {data.sync.inserted} exceptions detected/inserted, {data.sync.autoResolved} auto-resolved.
              </span>
            )}
            {!summary.storeMature && (
              <span className="text-amber-400/90 font-medium">
                ⓘ Provider store live since Sep 17 2026 — matching fidelity grows as callbacks accumulate.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Exceptions Queue Table */}
      <div className="rounded-xl border border-ccb-border bg-ccb-card overflow-hidden space-y-0">
        <div className="border-b border-ccb-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Exceptions Queue ({data?.exceptions.length ?? 0})
          </h3>
          <span className="text-xs text-ccb-muted">Click row to resolve</span>
        </div>

        {!data && loading ? (
          <div className="p-8 text-center text-xs text-ccb-muted">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ccb-muted border-t-white mr-2 align-middle" />
            Loading reconciliation data...
          </div>
        ) : data?.exceptions.length === 0 ? (
          <div className="p-8 text-center text-xs text-emerald-400">
            <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />No open reconciliation exceptions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead>
                <tr className="border-b border-ccb-border bg-ccb-surface/50 text-[11px] uppercase tracking-wider text-ccb-muted">
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium">Entity</th>
                  <th className="px-3 py-2 font-medium">Provider Ref</th>
                  <th className="px-3 py-2 font-medium">Country</th>
                  <th className="px-3 py-2 font-medium">Provider Amt</th>
                  <th className="px-3 py-2 font-medium">Internal Amt</th>
                  <th className="px-3 py-2 font-medium">Diff</th>
                  <th className="px-3 py-2 font-medium">Provider Status</th>
                  <th className="px-3 py-2 font-medium">Internal Status</th>
                  <th className="px-3 py-2 font-medium">Detected</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ccb-border/50 font-mono text-[12px]">
                {data?.exceptions.map((ex) => {
                  const countryFlag = ex.country ? COUNTRY_FLAGS[ex.country.toUpperCase()] || "" : "";
                  return (
                    <tr
                      key={ex.id}
                      onClick={() => handleOpenResolveModal(ex)}
                      className="cursor-pointer transition-colors hover:bg-violet-500/10"
                    >
                      <td className="px-3 py-2.5 font-sans font-medium text-white whitespace-nowrap">
                        {humanizeKind(ex.kind)}
                      </td>
                      <td className="px-3 py-2.5 font-sans whitespace-nowrap">
                        <SeverityBadge severity={ex.severity} />
                      </td>
                      <td className="px-3 py-2.5 text-ccb-muted whitespace-nowrap">
                        {ex.entityType} {ex.entityId ? `#${ex.entityId.slice(0, 8)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-ccb-muted whitespace-nowrap">
                        {ex.providerRef || "—"}
                      </td>
                      <td className="px-3 py-2.5 font-sans whitespace-nowrap">
                        {countryFlag ? `${countryFlag} ` : ""}{countryName(ex.country)}
                      </td>
                      <td className="px-3 py-2.5 text-white whitespace-nowrap">
                        {formatLocal(ex.providerAmount, ex.currency) || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-white whitespace-nowrap">
                        {formatLocal(ex.internalAmount, ex.currency) || "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {ex.difference != null ? (
                          <span className="text-red-400 font-semibold">
                            {ex.difference > 0 ? "+" : ""}
                            {formatLocal(ex.difference, ex.currency)}
                          </span>
                        ) : (
                          <span className="text-ccb-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-ccb-muted whitespace-nowrap font-sans">
                        {ex.providerStatus || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-ccb-muted whitespace-nowrap font-sans">
                        {ex.internalStatus || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-ccb-muted whitespace-nowrap font-sans">
                        {timeAgo(ex.detectedAt)}
                      </td>
                      <td className="px-3 py-2.5 font-sans whitespace-nowrap">
                        <span className="rounded bg-violet-600/20 px-2 py-0.5 text-[11px] font-semibold text-violet-400 hover:bg-violet-600/40">
                          Resolve →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resolved History Collapsible */}
      <div className="rounded-xl border border-ccb-border bg-ccb-card overflow-hidden">
        <button
          onClick={() => setResolvedHistoryOpen(!resolvedHistoryOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-left font-semibold text-white hover:bg-ccb-surface/40 transition-colors"
        >
          <span>Resolved History ({data?.resolvedRecent.length ?? 0})</span>
          <span className="text-xs text-ccb-muted">
            {resolvedHistoryOpen ? "▲ Hide" : "▼ Show"}
          </span>
        </button>

        {resolvedHistoryOpen && (
          <div className="border-t border-ccb-border overflow-x-auto">
            {!data?.resolvedRecent || data.resolvedRecent.length === 0 ? (
              <p className="p-4 text-xs text-ccb-muted">No recently resolved exceptions.</p>
            ) : (
              <table className="w-full text-left text-[12px] border-collapse">
                <thead>
                  <tr className="border-b border-ccb-border bg-ccb-surface/50 text-[11px] uppercase tracking-wider text-ccb-muted">
                    <th className="px-3 py-2 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Resolved By</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                    <th className="px-3 py-2 font-medium">Resolved At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ccb-border/50 text-ccb-muted">
                  {data.resolvedRecent.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-medium text-white whitespace-nowrap">
                        {humanizeKind(r.kind)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.resolvedByProfile?.username || r.resolvedBy || "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">
                        {r.resolutionAction || "—"}
                      </td>
                      <td className="px-3 py-2 max-w-md truncate">
                        {r.resolutionNote || "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.resolvedAt ? timeAgo(r.resolvedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Resolve Exception Modal / Drawer */}
      {selectedException && (
        <>
          <div
            onClick={handleCloseResolveModal}
            className="fixed inset-0 bg-black/60 z-40 transition-opacity"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-[520px] max-w-full bg-ccb-card border-l border-ccb-border overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-ccb-border pb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Resolve Exception</h3>
                <p className="text-xs text-ccb-muted">
                  ID: <span className="font-mono">{selectedException.id}</span>
                </p>
              </div>
              <button
                onClick={handleCloseResolveModal}
                className="rounded p-1 text-ccb-muted hover:text-white hover:bg-ccb-surface"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Exception Detail Summary */}
            <div className="rounded-lg border border-ccb-border bg-ccb-surface p-3.5 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-ccb-muted block text-[11px]">Kind</span>
                  <span className="font-semibold text-white">{humanizeKind(selectedException.kind)}</span>
                </div>
                <div>
                  <span className="text-ccb-muted block text-[11px]">Severity</span>
                  <SeverityBadge severity={selectedException.severity} />
                </div>
                <div>
                  <span className="text-ccb-muted block text-[11px]">Entity</span>
                  <span className="font-mono text-white">
                    {selectedException.entityType} #{selectedException.entityId || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-ccb-muted block text-[11px]">Provider Ref</span>
                  <span className="font-mono text-white">{selectedException.providerRef || "—"}</span>
                </div>
                <div>
                  <span className="text-ccb-muted block text-[11px]">Country</span>
                  <span className="text-white">{countryName(selectedException.country)}</span>
                </div>
                <div>
                  <span className="text-ccb-muted block text-[11px]">Detected</span>
                  <span className="text-white">{timeAgo(selectedException.detectedAt)}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-ccb-border/60 pt-2">
                <div>
                  <span className="text-ccb-muted block text-[11px]">Provider Amt</span>
                  <span className="font-semibold text-white">
                    {formatLocal(selectedException.providerAmount, selectedException.currency) || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-ccb-muted block text-[11px]">Internal Amt</span>
                  <span className="font-semibold text-white">
                    {formatLocal(selectedException.internalAmount, selectedException.currency) || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-ccb-muted block text-[11px]">Difference</span>
                  <span className="font-semibold text-red-400">
                    {selectedException.difference != null
                      ? `${selectedException.difference > 0 ? "+" : ""}${formatLocal(selectedException.difference, selectedException.currency)}`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Resolution Form */}
            <form onSubmit={handleResolveSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white mb-2">Resolution Action</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 rounded-lg border border-ccb-border bg-ccb-surface p-2.5 cursor-pointer hover:border-violet-500/50">
                    <input
                      type="radio"
                      name="action"
                      value="confirm_match"
                      checked={action === "confirm_match"}
                      onChange={() => setAction("confirm_match")}
                      className="accent-violet-600"
                    />
                    <div>
                      <span className="block font-semibold text-white">Confirm matched</span>
                      <span className="block text-[11px] text-ccb-muted">
                        Confirm that provider and internal records match logically.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 rounded-lg border border-ccb-border bg-ccb-surface p-2.5 cursor-pointer hover:border-violet-500/50">
                    <input
                      type="radio"
                      name="action"
                      value="adjust"
                      checked={action === "adjust"}
                      onChange={() => setAction("adjust")}
                      className="accent-violet-600"
                    />
                    <div>
                      <span className="block font-semibold text-white">Correct via adjustment</span>
                      <span className="block text-[11px] text-ccb-muted">
                        Apply a signed financial adjustment to resolve ledger discrepancy.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 rounded-lg border border-ccb-border bg-ccb-surface p-2.5 cursor-pointer hover:border-violet-500/50">
                    <input
                      type="radio"
                      name="action"
                      value="dismiss"
                      checked={action === "dismiss"}
                      onChange={() => setAction("dismiss")}
                      className="accent-violet-600"
                    />
                    <div>
                      <span className="block font-semibold text-white">Dismiss with note</span>
                      <span className="block text-[11px] text-ccb-muted">
                        Dismiss exception without modifying balances.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {action === "adjust" && (
                <div className="space-y-1.5 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
                  <label className="block text-xs font-semibold text-white">
                    Adjustment amount (MWK, + credits / − debits)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={adjustAmountMwk}
                    onChange={(e) => setAdjustAmountMwk(e.target.value)}
                    placeholder="e.g. 5000 or -2000"
                    required
                    className="w-full rounded-md border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white placeholder:text-ccb-muted focus:border-violet-500 focus:outline-none"
                  />
                  <p className="text-[11px] leading-relaxed text-ccb-muted">
                    Corrections are applied through apply_financial_adjustment — ledger row + wallet RPC + audit entry. Wallet balances are never edited directly.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-white mb-1">
                  Resolution note (required, min 5 chars)
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Provide context for why this exception is being resolved or adjusted..."
                  required
                  className="w-full rounded-md border border-ccb-border bg-ccb-surface px-3 py-2 text-xs text-white placeholder:text-ccb-muted focus:border-violet-500 focus:outline-none"
                />
              </div>

              {submitError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                  {submitError === "Exception already resolved" ? "Exception already resolved" : submitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-ccb-border pt-4">
                <button
                  type="button"
                  onClick={handleCloseResolveModal}
                  className="rounded-lg border border-ccb-border bg-ccb-surface px-4 py-2 text-xs font-medium text-white hover:bg-ccb-surface/80"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {submitting ? "Resolving..." : "Confirm Resolution"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

// ── 2. PlayersView Component ──────────────────────────────────────────────────

interface PlayerSearchResult {
  id: string;
  username: string;
  display_name: string | null;
  country: string | null;
  wallet_balance: number | null;
  walletCurrency: string;
  walletBalanceUsd: number | null;
  created_at: string;
}

interface PlayerDossier {
  player: {
    id: string;
    username: string;
    display_name: string | null;
    country: string | null;
    wallet_balance: number | null;
    walletCurrency: string;
    storedBalanceUsd: number | null;
    created_at: string;
    is_banned?: boolean;
    is_admin?: boolean;
    membership_until?: string | null;
  };
  totals: {
    totalDepositedMwk: number;
    totalWithdrawnMwk: number;
    totalWinningsMwk: number;
    totalFeesMwk: number;
    pendingDepositsMwk: number;
    pendingWithdrawalsMwk: number;
    derivedLedgerMwk: number;
    derivedLedgerUsd: number | null;
    storedBalanceUsd: number | null;
    discrepancyUsd: number | null;
    entryCount: number;
  };
  history: WalletEntry[];
}

export function PlayersView() {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selected player dossier drawer
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<PlayerDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);

  // Pagination for history
  const [historyPageSize, setHistoryPageSize] = useState(50);

  // Manage Player state (wallet adjustment, ban/unban, admin role)
  const [manageAmount, setManageAmount] = useState("");
  const [manageReason, setManageReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [manageMsg, setManageMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [manageConfirm, setManageConfirm] = useState<string | null>(null);

  const searchPlayers = useCallback(async (q: string) => {
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/admin/commandcentre/players?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Player search failed: HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setPlayers(json.players || []);
    } catch (e: any) {
      setSearchError(e.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    searchPlayers("");
  }, [searchPlayers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchPlayers(query);
  };

  const openPlayerDrawer = async (id: string) => {
    setSelectedPlayerId(id);
    setDossier(null);
    setLoadingDossier(true);
    setDossierError(null);
    setHistoryPageSize(50);
    setManageAmount("");
    setManageReason("");
    setManageMsg(null);
    setManageConfirm(null);

    try {
      const res = await fetch(`/api/admin/commandcentre/players?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Failed to load player: HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setDossier(json);
    } catch (e: any) {
      setDossierError(e.message || "Failed to load player details");
    } finally {
      setLoadingDossier(false);
    }
  };

  const runUserAction = async (action: string, value?: unknown, reason?: string) => {
    if (!selectedPlayerId) return false;
    setActionBusy(true);
    setManageMsg(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedPlayerId, action, value, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      // Refresh dossier + list so balances / status reflect the change
      await Promise.all([openPlayerDrawer(selectedPlayerId), searchPlayers(query)]);
      return true;
    } catch (e: any) {
      setManageMsg({ ok: false, text: e.message || "Action failed" });
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  const closePlayerDrawer = () => {
    setSelectedPlayerId(null);
    setDossier(null);
  };

  return (
    <div className="space-y-6 text-[13px] text-white">
      {/* Search Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Player Wallet Ledgers</h2>
          <p className="text-xs text-ccb-muted">
            Search players, view stored wallet balances, and audit complete ledger history.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-lg">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username or display name..."
          className="flex-1 rounded-lg border border-ccb-border bg-ccb-surface px-3.5 py-2 text-xs text-white placeholder:text-ccb-muted focus:border-violet-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {searchError && (
        <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {searchError}
        </div>
      )}

      {/* Players Results Table */}
      <div className="rounded-xl border border-ccb-border bg-ccb-card overflow-hidden">
        <div className="border-b border-ccb-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Players ({players.length})
          </h3>
          <span className="text-xs text-ccb-muted">Click player to view full wallet dossier</span>
        </div>

        {searching ? (
          <div className="p-8 text-center text-xs text-ccb-muted">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ccb-muted border-t-white mr-2 align-middle" />
            Searching players...
          </div>
        ) : players.length === 0 ? (
          <div className="p-8 text-center text-xs text-ccb-muted">
            No players found matching your query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead>
                <tr className="border-b border-ccb-border bg-ccb-surface/50 text-[11px] uppercase tracking-wider text-ccb-muted">
                  <th className="px-4 py-2.5 font-medium">Username</th>
                  <th className="px-4 py-2.5 font-medium">Display Name</th>
                  <th className="px-4 py-2.5 font-medium">Country</th>
                  <th className="px-4 py-2.5 font-medium">Wallet Balance</th>
                  <th className="px-4 py-2.5 font-medium">USD Value</th>
                  <th className="px-4 py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ccb-border/50">
                {players.map((p) => {
                  const flag = p.country ? COUNTRY_FLAGS[p.country.toUpperCase()] || "" : "";
                  return (
                    <tr
                      key={p.id}
                      onClick={() => openPlayerDrawer(p.id)}
                      className="cursor-pointer transition-colors hover:bg-violet-500/10"
                    >
                      <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                        {p.username}
                      </td>
                      <td className="px-4 py-3 text-ccb-muted whitespace-nowrap">
                        {p.display_name || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {flag ? `${flag} ` : ""}{p.country || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-white whitespace-nowrap">
                        {formatLocal(p.wallet_balance, p.walletCurrency) || "0"}
                      </td>
                      <td className="px-4 py-3 font-mono text-ccb-muted whitespace-nowrap">
                        {formatUsd(p.walletBalanceUsd)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="rounded bg-violet-600/20 px-2.5 py-1 text-[11px] font-semibold text-violet-400 hover:bg-violet-600/40">
                          View Dossier →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Player Wallet Dossier Drawer */}
      {selectedPlayerId && (
        <>
          <div
            onClick={closePlayerDrawer}
            className="fixed inset-0 bg-black/60 z-40 transition-opacity"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-[520px] max-w-full bg-ccb-card border-l border-ccb-border overflow-y-auto p-6 space-y-6 shadow-2xl text-[13px]">
            {/* Header / Close */}
            <div className="flex items-start justify-between border-b border-ccb-border pb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Player Wallet Dossier</h3>
                <p className="text-xs text-ccb-muted font-mono">{selectedPlayerId}</p>
              </div>
              <button
                onClick={closePlayerDrawer}
                className="rounded p-1 text-ccb-muted hover:text-white hover:bg-ccb-surface"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingDossier ? (
              <div className="py-12 text-center text-xs text-ccb-muted">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ccb-muted border-t-white mr-2 align-middle" />
                Loading wallet history...
              </div>
            ) : dossierError ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {dossierError}
              </div>
            ) : dossier ? (
              <>
                {/* Player Profile & Stored Balance */}
                <div className="rounded-xl border border-ccb-border bg-ccb-surface p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-white">{dossier.player.username}</h4>
                      <p className="text-xs text-ccb-muted">
                        {dossier.player.display_name || "No display name"} ·{" "}
                        {dossier.player.country ? `${COUNTRY_FLAGS[dossier.player.country.toUpperCase()] || ""} ` : ""}
                        {countryName(dossier.player.country)}
                      </p>
                    </div>
                    <span className="rounded bg-violet-600/20 px-2 py-0.5 text-xs font-semibold text-violet-400">
                      {dossier.player.walletCurrency}
                    </span>
                  </div>

                  <div className="border-t border-ccb-border/60 pt-3">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                      Stored Wallet Balance
                    </span>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span className="text-2xl font-bold tracking-tight text-white">
                        {formatLocal(dossier.player.wallet_balance, dossier.player.walletCurrency) || "0 MWK"}
                      </span>
                      <span className="text-xs text-ccb-muted">
                        ({formatUsd(dossier.player.storedBalanceUsd)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Manage Player — wallet adjustment, ban/unban, admin role.
                    Same security as the legacy panel (requireAdmin endpoints,
                    atomic RPCs), but wallet moves go through
                    apply_financial_adjustment: ledger row + audit trail. */}
                <div className="rounded-xl border border-ccb-border bg-ccb-surface p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">
                      Manage Player
                    </span>
                    <div className="flex gap-1.5">
                      {dossier.player.is_banned && (
                        <span className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400">BANNED</span>
                      )}
                      {dossier.player.is_admin && (
                        <span className="rounded bg-violet-600/20 px-2 py-0.5 text-[10px] font-semibold text-violet-400">ADMIN</span>
                      )}
                    </div>
                  </div>

                  {/* Wallet adjustment */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-white">
                      Wallet adjustment (MWK, + credit / − debit)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={manageAmount}
                      onChange={(e) => setManageAmount(e.target.value)}
                      placeholder="e.g. 5000 or -2000"
                      disabled={actionBusy}
                      className="w-full rounded-md border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white placeholder:text-ccb-muted focus:border-violet-500 focus:outline-none disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={manageReason}
                      onChange={(e) => setManageReason(e.target.value)}
                      placeholder="Reason (required, min 3 chars — recorded on the ledger row + audit log)"
                      disabled={actionBusy}
                      className="w-full rounded-md border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white placeholder:text-ccb-muted focus:border-violet-500 focus:outline-none disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={async () => {
                        const amt = Number(manageAmount);
                        if (!Number.isFinite(amt) || amt === 0) {
                          setManageMsg({ ok: false, text: "Enter a non-zero amount (MWK)" });
                          return;
                        }
                        if (manageReason.trim().length < 3) {
                          setManageMsg({ ok: false, text: "A reason of at least 3 characters is required" });
                          return;
                        }
                        const ok = await runUserAction("wallet_adjustment", amt, manageReason.trim());
                        if (ok) setManageMsg({ ok: true, text: "Wallet adjusted — ledger row created" });
                      }}
                      className="w-full rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                    >
                      {actionBusy ? "Applying…" : "Apply adjustment"}
                    </button>
                  </div>

                  {/* Ban / admin role */}
                  <div className="flex flex-wrap gap-2 border-t border-ccb-border pt-3">
                    {(() => {
                      const isBanned = !!dossier.player.is_banned;
                      const banKind = isBanned ? "unban" : "ban";
                      return (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={async () => {
                            if (manageConfirm !== banKind) { setManageConfirm(banKind); return; }
                            const ok = await runUserAction(banKind);
                            if (ok) setManageMsg({ ok: true, text: isBanned ? "Player unbanned" : "Player banned" });
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                            manageConfirm === banKind
                              ? "bg-red-600 text-white hover:bg-red-500"
                              : isBanned
                                ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                : "border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          }`}
                        >
                          {manageConfirm === banKind ? `Confirm ${banKind}?` : isBanned ? "Unban player" : "Ban player"}
                        </button>
                      );
                    })()}
                    {(() => {
                      const isAdminP = !!dossier.player.is_admin;
                      const roleKind = isAdminP ? "revoke" : "grant";
                      return (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={async () => {
                            if (manageConfirm !== roleKind) { setManageConfirm(roleKind); return; }
                            const ok = await runUserAction("toggle_admin", !isAdminP);
                            if (ok) setManageMsg({ ok: true, text: isAdminP ? "Admin access revoked" : "Admin access granted" });
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                            manageConfirm === roleKind
                              ? "bg-amber-600 text-white hover:bg-amber-500"
                              : "border border-ccb-border bg-ccb-surface text-white hover:bg-ccb-surface/80"
                          }`}
                        >
                          {manageConfirm === roleKind
                            ? `Confirm ${roleKind} admin?`
                            : isAdminP
                              ? "Revoke admin"
                              : "Grant admin"}
                        </button>
                      );
                    })()}
                  </div>

                  {manageMsg && (
                    <div
                      className={`rounded-md border p-2.5 text-[11px] ${
                        manageMsg.ok
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                      }`}
                    >
                      {manageMsg.text}
                    </div>
                  )}
                </div>

                {/* Cross-Check Ledger Banner */}
                {(() => {
                  const hasDiscrepancy =
                    dossier.totals.discrepancyUsd != null && dossier.totals.discrepancyUsd > 0.01;
                  return (
                    <div
                      className={`rounded-xl border p-3.5 space-y-1.5 ${
                        hasDiscrepancy
                          ? "border-amber-400/40 bg-amber-400/10"
                          : "border-emerald-500/30 bg-emerald-500/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-semibold ${
                            hasDiscrepancy ? "text-amber-400" : "text-emerald-400"
                          }`}
                        >
                          {hasDiscrepancy ? (
                            <>
                              <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                              Discrepancy: {formatUsd(dossier.totals.discrepancyUsd)}
                            </>
                          ) : (
                            <>
                              <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                              Ledger matches stored balance
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between text-[11px] text-ccb-muted border-t border-current/10 pt-1.5">
                        <span>
                          Ledger-derived balance:{" "}
                          <strong className="text-white">
                            {formatUsd(dossier.totals.derivedLedgerUsd)}
                          </strong>
                        </span>
                        <span>
                          Stored balance:{" "}
                          <strong className="text-white">
                            {formatUsd(dossier.totals.storedBalanceUsd)}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Stat Tiles Grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 text-xs">
                  <div className="rounded-lg border border-ccb-border bg-ccb-surface p-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-ccb-muted block">
                      Deposited
                    </span>
                    <span className="font-semibold text-white">
                      {formatLocal(dossier.totals.totalDepositedMwk, "MWK") || "0 MWK"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-ccb-border bg-ccb-surface p-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-ccb-muted block">
                      Withdrawn
                    </span>
                    <span className="font-semibold text-white">
                      {formatLocal(dossier.totals.totalWithdrawnMwk, "MWK") || "0 MWK"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-ccb-border bg-ccb-surface p-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-ccb-muted block">
                      Battle Winnings
                    </span>
                    <span className="font-semibold text-white">
                      {formatLocal(dossier.totals.totalWinningsMwk, "MWK") || "0 MWK"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-ccb-border bg-ccb-surface p-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-ccb-muted block">
                      Fees
                    </span>
                    <span className="font-semibold text-white">
                      {formatLocal(dossier.totals.totalFeesMwk, "MWK") || "0 MWK"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-ccb-border bg-ccb-surface p-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-ccb-muted block">
                      Pending Deposits
                    </span>
                    <span className="font-semibold text-amber-400">
                      {formatLocal(dossier.totals.pendingDepositsMwk, "MWK") || "0 MWK"}
                    </span>
                  </div>
                  <div className="rounded-lg border border-ccb-border bg-ccb-surface p-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-ccb-muted block">
                      Pending Withdrawals
                    </span>
                    <span className="font-semibold text-amber-400">
                      {formatLocal(dossier.totals.pendingWithdrawalsMwk, "MWK") || "0 MWK"}
                    </span>
                  </div>
                </div>

                {/* Wallet History Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
                      Wallet Ledger History ({dossier.history.length})
                    </h4>
                  </div>

                  {dossier.history.length === 0 ? (
                    <p className="text-xs text-ccb-muted">No financial ledger entries for this player.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="overflow-x-auto rounded-lg border border-ccb-border">
                        <table className="w-full text-left text-[11px] border-collapse">
                          <thead>
                            <tr className="border-b border-ccb-border bg-ccb-surface text-[10px] uppercase tracking-wider text-ccb-muted">
                              <th className="px-2.5 py-2 font-medium">Time</th>
                              <th className="px-2.5 py-2 font-medium">Type</th>
                              <th className="px-2.5 py-2 font-medium">Label</th>
                              <th className="px-2.5 py-2 font-medium">MWK Amount</th>
                              <th className="px-2.5 py-2 font-medium">Local Amt</th>
                              <th className="px-2.5 py-2 font-medium">Status</th>
                              <th className="px-2.5 py-2 font-medium">Ref</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ccb-border/40 font-mono text-[11px]">
                            {dossier.history.slice(0, historyPageSize).map((entry) => {
                              const positive = entry.amountMwk > 0;
                              const negative = entry.amountMwk < 0;
                              return (
                                <tr key={entry.id} className="hover:bg-ccb-surface/50">
                                  <td className="px-2.5 py-2 font-sans text-ccb-muted whitespace-nowrap">
                                    {timeAgo(entry.time)}
                                  </td>
                                  <td className="px-2.5 py-2 font-sans whitespace-nowrap">
                                    <span className="rounded bg-ccb-surface px-1.5 py-0.5 text-[10px] font-medium text-white border border-ccb-border">
                                      {LEDGER_TYPE_LABELS[entry.type] || entry.type}
                                    </span>
                                  </td>
                                  <td className="px-2.5 py-2 font-sans text-white max-w-[100px] truncate">
                                    {entry.label}
                                  </td>
                                  <td className="px-2.5 py-2 whitespace-nowrap font-bold">
                                    <span
                                      className={
                                        positive
                                          ? "text-emerald-400"
                                          : negative
                                          ? "text-red-400"
                                          : "text-white"
                                      }
                                    >
                                      {positive ? "+" : ""}
                                      {formatLocal(entry.amountMwk, "MWK")}
                                    </span>
                                  </td>
                                  <td className="px-2.5 py-2 text-ccb-muted whitespace-nowrap">
                                    {formatLocal(entry.localAmount, entry.localCurrency) || "—"}
                                  </td>
                                  <td className="px-2.5 py-2 font-sans whitespace-nowrap">
                                    <FeedStatusBadge status={entry.status} />
                                  </td>
                                  <td className="px-2.5 py-2 text-ccb-muted whitespace-nowrap max-w-[90px] truncate">
                                    {entry.reference
                                      ? entry.reference.length > 12
                                        ? `${entry.reference.slice(0, 12)}...`
                                        : entry.reference
                                      : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Paginate visually button */}
                      {historyPageSize < dossier.history.length && (
                        <button
                          onClick={() => setHistoryPageSize((prev) => prev + 50)}
                          className="w-full rounded-lg border border-ccb-border bg-ccb-surface py-2 text-center text-xs font-semibold text-white transition-colors hover:border-violet-500/60"
                        >
                          Show more ({dossier.history.length - historyPageSize} remaining)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
