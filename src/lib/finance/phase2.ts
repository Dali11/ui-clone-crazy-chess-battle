/**
 * Shared domain logic for the Admin Command Centre Phase 2 —
 * Finance & Reconciliation. Pure functions only: the API routes fetch
 * raw rows and run them through these, and the unit tests exercise
 * this module directly. UI imports the types and label maps.
 *
 * Design principle (per the Phase 2 spec): "Does the money recorded by
 * CrazyChess match the money processed by our payment provider?"
 * The reconciliation engine in this module answers exactly that.
 */

import type { FeedStatus } from "./commandcentre";

// ── Ledger transaction taxonomy ────────────────────────────────────────

/** Phase 2 unified ledger types (spec §1). */
export type LedgerType =
  | "deposit" | "withdrawal" | "battle_fee" | "battle_stake" | "battle_win"
  | "tournament_payment" | "membership_payment" | "ad_payment"
  | "withdrawal_fee" | "refund" | "adjustment" | "sweep";

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  battle_fee: "Battle Fee",
  battle_stake: "Battle Stake",
  battle_win: "Battle Win",
  tournament_payment: "Tournament Payment",
  membership_payment: "Membership Payment",
  ad_payment: "Ad Payment",
  withdrawal_fee: "Withdrawal Fee",
  refund: "Refund",
  adjustment: "Adjustment",
  sweep: "Revenue Sweep",
};

/** deposits.method → ledger type. Anything unmapped lands in "adjustment" (generic). */
// Money direction for colour-coding in the Command Centre:
// money paid INTO the platform is green, money paid OUT is red,
// internal wallet transfers (stakes, entries, ads, rake) stay neutral.
const MONEY_IN_KINDS = new Set(["deposit", "membership", "membership_payment"]);
const MONEY_OUT_KINDS = new Set(["withdrawal", "withdrawal_fee", "sweep"]);

export function moneyDirectionClass(kind: string): string {
  if (MONEY_IN_KINDS.has(kind)) return "text-emerald-400";
  if (MONEY_OUT_KINDS.has(kind)) return "text-red-400";
  return "text-white";
}

export const METHOD_LEDGER_TYPE: Record<string, LedgerType> = {
  // Money in from the outside world
  mobile_money: "deposit",
  card: "deposit",
  bank_transfer: "deposit",
  pawapay: "deposit",
  paychangu: "deposit",
  // Battle lifecycle
  battle_escrow: "battle_stake",
  battle_challenge_escrow: "battle_stake",
  battle_payout: "battle_win",
  platform_cut: "battle_fee",
  // Tournament lifecycle
  tournament_entry: "tournament_payment",
  tournament_payout: "tournament_payment",
  tournament_creator_profit: "tournament_payment",
  // Platform revenue streams
  membership_purchase: "membership_payment",
  ad_purchase: "ad_payment",
  // Refunds / corrections
  battle_refund: "refund",
  battle_challenge_cancel: "refund",
  battle_cancel: "refund",
  battle_queue_refund: "refund",
  battle_queue_timeout: "refund",
  expired_challenge: "refund",
  cleanup_expired: "refund",
  heal_stuck: "refund",
  tournament_refund: "refund",
  tournament_payout_reversal: "refund",
  duplicate_payout_removal: "refund",
  clawback_duplicate_refund: "refund",
  withdrawal_failed_refund: "refund",
  // Corrections & sweeps
  admin_adjustment: "adjustment",
  platform_revenue_sweep: "sweep",
};

export function ledgerTypeForMethod(method: string): LedgerType {
  return METHOD_LEDGER_TYPE[method] || "adjustment";
}

/** All methods that represent money entering the platform from outside. */
export const LEDGER_DEPOSIT_METHODS = ["mobile_money", "card", "bank_transfer", "pawapay", "paychangu"] as const;

/**
 * Ledger rows stored POSITIVE but representing money LEAVING the wallet
 * (battle escrow locks the stake away from the player). Verified against
 * production data: battle_escrow / battle_challenge_escrow are stored
 * positive while ad_purchase / tournament_entry are stored negative.
 */
const WALLET_IMPACT_FLIP_METHODS = new Set(["battle_escrow", "battle_challenge_escrow"]);

/** Wallet-impact signed amount (MWK-normalized) for one deposits row. */
export function walletImpactAmount(method: string, amount: number): number {
  return WALLET_IMPACT_FLIP_METHODS.has(method) ? -Math.abs(amount) : amount;
}

// ── CSV helpers ────────────────────────────────────────────────────────

export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvResponse(filenameBase: string, lines: string[]): Response {
  const body = "\uFEFF" + lines.join("\n"); // BOM so Excel reads UTF-8
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

// ── Reconciliation engine (pure) ───────────────────────────────────────

export interface ReconInternalRow {
  id: string;
  providerRef: string | null;      // pawapay_ref (primary match key)
  fallbackRef: string | null;      // paychangu_ref / charge_id (paychangu match key)
  amountLocal: number | null;
  currency: string | null;
  country: string | null;
  internalStatus: string;           // raw internal status
  createdAt: string;
}

export interface ReconProviderRow {
  provider: string;               // 'pawapay' | 'paychangu' | ...
  providerRef: string;
  direction: "deposit" | "payout";
  providerStatus: string | null;   // raw provider status (COMPLETED, FAILED, ...)
  amountLocal: number | null;
  currency: string | null;
  country: string | null;
  receivedAt: string;
}

export type ReconExceptionKind =
  | "amount_mismatch" | "status_mismatch" | "unmatched_provider"
  | "duplicate_internal" | "missing_provider_record" | "stuck_pending";

export interface ReconExceptionDraft {
  kind: ReconExceptionKind;
  provider: string | null;
  providerRef: string | null;
  entityType: "deposit" | "withdrawal" | "none";
  entityId: string | null;
  country: string | null;
  currency: string | null;
  providerAmount: number | null;
  internalAmount: number | null;
  difference: number | null;
  providerStatus: string | null;
  internalStatus: string | null;
  severity: "critical" | "warning" | "info";
}

export interface ReconSummary {
  providerTransactions: number;   // distinct provider transactions in window
  matched: number;
  unmatched: number;               // provider rows with no internal record
  pending: number;                 // matched but still non-terminal on both sides
  failed: number;                   // matched & terminal-failed on the provider side
  amountMismatches: number;
  statusMismatches: number;
  duplicates: number;               // internal rows sharing one provider ref
  missingProviderRecords: number;   // internal success rows with a ref but no provider record
  stuckPending: number;             // non-terminal rows older than STUCK_PENDING_HOURS
  internalDeposits: number;
  internalWithdrawals: number;
  /** true when the webhook store is live long enough for full-fidelity matching */
  storeMature: boolean;
  checkedAt: string;
}

export const STUCK_PENDING_HOURS = 48;

/** Amount-mismatch tolerance: 1% or 1 unit of the local currency, whichever is larger. */
export function amountMismatchTolerance(amount: number): number {
  return Math.max(Math.abs(amount) * 0.01, 1);
}

function normalizeStatusGroup(raw: string | null | undefined, side: "internal" | "provider"): "pending" | "success" | "failed" {
  const s = (raw || "").toLowerCase();
  if (side === "internal") {
    if (s === "success" || s === "completed") return "success";
    if (s === "failed" || s === "rejected" || s === "cancelled") return "failed";
    return "pending"; // pending / processing / approved
  }
  // provider statuses: ACCEPTED, COMPLETED, FAILED, REJECTED, ENQUEUED / paychangu equivalents
  if (s === "completed" || s === "success") return "success";
  if (s === "failed" || s === "rejected" || s === "cancelled") return "failed";
  return "pending"; // accepted / enqueued / unknown
}

export interface ReconEngineInput {
  deposits: ReconInternalRow[];
  withdrawals: ReconInternalRow[];
  providerTxs: ReconProviderRow[];
  /** ISO date the provider-transaction store went live — rows created
   *  before it are not flagged as missing_provider_record (historical). */
  storeLiveAt: string;
  now?: Date;
}

export interface ReconEngineResult {
  summary: ReconSummary;
  exceptions: ReconExceptionDraft[];
}

/**
 * Compare the CrazyChess ledger against provider transactions and
 * produce (a) a summary and (b) a set of exception drafts to upsert
 * into reconciliation_exceptions.
 *
 * Matching key precedence per provider:
 *   pawapay   → deposits.pawapay_ref = depositId; withdrawals.pawapay_ref = payoutId
 *   paychangu → deposits.paychangu_ref (fallbackRef)
 * A provider transaction is "matched" when an internal row carries its ref.
 * The LATEST provider event per (provider, ref, direction) is authoritative.
 */
export function runReconciliation(input: ReconEngineInput): ReconEngineResult {
  const now = input.now ?? new Date();
  const storeLiveMs = Date.parse(input.storeLiveAt);

  // Latest provider event per logical provider transaction.
  const latest = new Map<string, ReconProviderRow>();
  for (const tx of input.providerTxs) {
    const key = `${tx.provider}|${tx.providerRef}|${tx.direction}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(tx.receivedAt) > Date.parse(prev.receivedAt)) latest.set(key, tx);
  }

  // Internal rows by match key, per direction.
  const byKey = (rows: ReconInternalRow[], dir: "deposit" | "payout") => {
    const m = new Map<string, ReconInternalRow[]>();
    for (const r of rows) {
      const keys = [r.providerRef, r.fallbackRef].filter(Boolean) as string[];
      for (const k of keys) {
        const list = m.get(k) || [];
        list.push(r);
        m.set(k, list);
      }
    }
    return m;
  };
  const depositsByKey = byKey(input.deposits, "deposit");
  const withdrawalsByKey = byKey(input.withdrawals, "payout");

  const exceptions: ReconExceptionDraft[] = [];
  const summary: ReconSummary = {
    providerTransactions: latest.size,
    matched: 0,
    unmatched: 0,
    pending: 0,
    failed: 0,
    amountMismatches: 0,
    statusMismatches: 0,
    duplicates: 0,
    missingProviderRecords: 0,
    stuckPending: 0,
    internalDeposits: input.deposits.length,
    internalWithdrawals: input.withdrawals.length,
    storeMature: now.getTime() - storeLiveMs > 7 * 24 * 3600 * 1000,
    checkedAt: now.toISOString(),
  };

  const matchedInternalIds = new Set<string>();

  // ── Pass 1: provider → internal ────────────────────────────────────
  for (const tx of latest.values()) {
    const table = tx.direction === "deposit" ? depositsByKey : withdrawalsByKey;
    const internal = table.get(tx.providerRef) || [];
    if (internal.length === 0) {
      summary.unmatched += 1;
      exceptions.push({
        kind: "unmatched_provider",
        provider: tx.provider,
        providerRef: tx.providerRef,
        entityType: "none",
        entityId: null,
        country: tx.country,
        currency: tx.currency,
        providerAmount: tx.amountLocal,
        internalAmount: null,
        difference: null,
        providerStatus: tx.providerStatus,
        internalStatus: null,
        severity: "critical",
      });
      continue;
    }

    summary.matched += 1;
    if (internal.length > 1) {
      summary.duplicates += 1;
      for (const r of internal) {
        exceptions.push({
          kind: "duplicate_internal",
          provider: tx.provider,
          providerRef: tx.providerRef,
          entityType: tx.direction === "deposit" ? "deposit" : "withdrawal",
          entityId: r.id,
          country: r.country ?? tx.country,
          currency: r.currency ?? tx.currency,
          providerAmount: tx.amountLocal,
          internalAmount: r.amountLocal,
          difference: r.amountLocal != null && tx.amountLocal != null ? r.amountLocal - tx.amountLocal : null,
          providerStatus: tx.providerStatus,
          internalStatus: r.internalStatus,
          severity: "critical",
        });
      }
    }

    const row = internal[0];
    matchedInternalIds.add(row.id);

    const provGroup = normalizeStatusGroup(tx.providerStatus, "provider");
    const intGroup = normalizeStatusGroup(row.internalStatus, "internal");
    if (provGroup === "pending") {
      summary.pending += 1;
    }
    if (provGroup === "failed") {
      summary.failed += 1;
    }

    // Amount mismatch (same-currency comparison only).
    if (
      tx.amountLocal != null && row.amountLocal != null &&
      tx.currency && row.currency && tx.currency === row.currency
    ) {
      const diff = row.amountLocal - tx.amountLocal;
      if (Math.abs(diff) > amountMismatchTolerance(tx.amountLocal)) {
        summary.amountMismatches += 1;
        exceptions.push({
          kind: "amount_mismatch",
          provider: tx.provider,
          providerRef: tx.providerRef,
          entityType: tx.direction === "deposit" ? "deposit" : "withdrawal",
          entityId: row.id,
          country: row.country ?? tx.country,
          currency: tx.currency,
          providerAmount: tx.amountLocal,
          internalAmount: row.amountLocal,
          difference: diff,
          providerStatus: tx.providerStatus,
          internalStatus: row.internalStatus,
          severity: "critical",
        });
      }
    }

    // Status mismatch (terminal disagreement).
    if (provGroup !== "pending" && intGroup !== "pending" && provGroup !== intGroup) {
      summary.statusMismatches += 1;
      exceptions.push({
        kind: "status_mismatch",
        provider: tx.provider,
        providerRef: tx.providerRef,
        entityType: tx.direction === "deposit" ? "deposit" : "withdrawal",
        entityId: row.id,
        country: row.country ?? tx.country,
        currency: rCurrency(row, tx),
        providerAmount: tx.amountLocal,
        internalAmount: row.amountLocal,
        difference: null,
        providerStatus: tx.providerStatus,
        internalStatus: row.internalStatus,
        severity: "critical",
      });
    }
  }

  // ── Pass 2: internal-only checks ────────────────────────────────────
  const allInternal: Array<{ row: ReconInternalRow; entityType: "deposit" | "withdrawal" }> = [
    ...input.deposits.map((r) => ({ row: r, entityType: "deposit" as const })),
    ...input.withdrawals.map((r) => ({ row: r, entityType: "withdrawal" as const })),
  ];

  const refCount = new Map<string, number>();
  for (const { row } of allInternal) {
    for (const k of [row.providerRef, row.fallbackRef].filter(Boolean) as string[]) {
      refCount.set(k, (refCount.get(k) || 0) + 1);
    }
  }

  for (const { row, entityType } of allInternal) {
    const intGroup = normalizeStatusGroup(row.internalStatus, "internal");

    // Stuck pending — needs operational review.
    if (intGroup === "pending" && row.providerRef) {
      const ageH = (now.getTime() - Date.parse(row.createdAt)) / 3600_000;
      if (ageH > STUCK_PENDING_HOURS && !exceptions.some((e) => e.entityId === row.id)) {
        summary.stuckPending += 1;
        exceptions.push({
          kind: "stuck_pending",
          provider: "pawapay",
          providerRef: row.providerRef,
          entityType,
          entityId: row.id,
          country: row.country,
          currency: row.currency,
          providerAmount: null,
          internalAmount: row.amountLocal,
          difference: null,
          providerStatus: null,
          internalStatus: row.internalStatus,
          severity: "warning",
        });
      }
    }

    // Success with a provider ref but no provider record — only flag
    // rows created AFTER the provider store went live (historical rows
    // predate the store by design).
    if (intGroup === "success" && row.providerRef && !matchedInternalIds.has(row.id)) {
      if (Date.parse(row.createdAt) > storeLiveMs) {
        summary.missingProviderRecords += 1;
        exceptions.push({
          kind: "missing_provider_record",
          provider: "pawapay",
          providerRef: row.providerRef,
          entityType,
          entityId: row.id,
          country: row.country,
          currency: row.currency,
          providerAmount: null,
          internalAmount: row.amountLocal,
          difference: null,
          providerStatus: null,
          internalStatus: row.internalStatus,
          severity: "warning",
        });
      }
    }
  }

  return { summary, exceptions };
}

function rCurrency(row: ReconInternalRow, tx: ReconProviderRow): string | null {
  return row.currency ?? tx.currency;
}

/** Convert a raw exception draft + its meta into the wire shape of the exceptions API. */
export interface ReconExceptionRow {
  id: string;
  kind: ReconExceptionKind;
  provider: string | null;
  providerRef: string | null;
  entityType: string;
  entityId: string | null;
  country: string | null;
  currency: string | null;
  providerAmount: number | null;
  internalAmount: number | null;
  difference: number | null;
  providerStatus: string | null;
  internalStatus: string | null;
  severity: "critical" | "warning" | "info";
  detectedAt: string;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionAction: string | null;
  resolutionNote: string | null;
}

// ── Player wallet derivation ───────────────────────────────────────────

export interface WalletEntry {
  id: string;
  time: string;
  type: LedgerType;
  label: string;
  /** MWK-normalized signed amount (+ credit / − debit). */
  amountMwk: number;
  localAmount: number | null;
  localCurrency: string | null;
  status: FeedStatus;
  reference: string | null;
}

/**
 * Build a player's wallet history from raw deposits + withdrawals rows.
 * The wallet balance shown to admins is DERIVED from these entries —
 * the stored profiles.wallet_balance is displayed alongside as the
 * reconciliation cross-check, never as the only truth.
 *
 * Sign convention: credits positive, debits negative. deposits.amount
 * is MWK-normalized; ad_purchase / tournament_entry style wallet-debit
 * rows are stored NEGATIVE already (verified against production data).
 */
export function buildWalletHistory(
  deposits: Array<Record<string, any>>,
  withdrawals: Array<Record<string, any>>
): WalletEntry[] {
  const entries: WalletEntry[] = [];

  for (const d of deposits || []) {
    const amount = walletImpactAmount(d.method, Number(d.amount || 0));
    const type = ledgerTypeForMethod(d.method);
    entries.push({
      id: d.id,
      time: d.created_at,
      type,
      label: LEDGER_TYPE_LABELS[type],
      amountMwk: amount,
      localAmount: d.amount_local != null ? Math.abs(Number(d.amount_local)) : null,
      localCurrency: d.currency || null,
      status: depositStatusSafe(d.status),
      reference: d.reference || d.pawapay_ref || null,
    });
  }

  for (const w of withdrawals || []) {
    const gross = Math.abs(Number(w.amount || 0));
    entries.push({
      id: w.id,
      time: w.created_at,
      type: "withdrawal",
      label: LEDGER_TYPE_LABELS.withdrawal,
      amountMwk: -gross,
      localAmount: w.amount_local != null ? Number(w.amount_local) : null,
      localCurrency: w.currency || null,
      status: withdrawalStatusSafe(w.status),
      reference: w.pawapay_ref || w.reference || null,
    });
    const fee = Math.max(0, Number(w.fee || 0));
    if (fee > 0) {
      entries.push({
        id: `${w.id}:fee`,
        time: w.processed_at || w.created_at,
        type: "withdrawal_fee",
        label: LEDGER_TYPE_LABELS.withdrawal_fee,
        amountMwk: -fee,
        localAmount: fee,
        localCurrency: w.currency || null,
        status: withdrawalStatusSafe(w.status),
        reference: w.pawapay_ref || null,
      });
    }
  }

  return entries.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

function depositStatusSafe(s: string): FeedStatus {
  switch (s) {
    case "success": return "completed";
    case "pending": return "pending";
    case "failed": return "failed";
    default: return "cancelled";
  }
}

function withdrawalStatusSafe(s: string): FeedStatus {
  switch (s) {
    case "completed": return "completed";
    case "pending": case "approved": return "pending";
    case "failed": case "rejected": return "failed";
    default: return "cancelled";
  }
}
