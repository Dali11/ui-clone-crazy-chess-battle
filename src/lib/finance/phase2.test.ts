/**
 * Unit tests for the Phase 2 Finance & Reconciliation domain logic
 * (src/lib/finance/phase2.ts). The reconciliation engine is the core
 * of Phase 2 — it must correctly answer: "Does the money recorded by
 * CrazyChess match the money processed by our payment provider?"
 */

import { describe, expect, it } from "vitest";
import {
  runReconciliation,
  amountMismatchTolerance,
  buildWalletHistory,
  walletImpactAmount,
  walletReconcileImpact,
  ledgerTypeForMethod,
  type ReconInternalRow,
  type ReconProviderRow,
} from "./phase2";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const STORE_LIVE = "2026-09-17T00:00:00.000Z";

function internal(overrides: Partial<ReconInternalRow>): ReconInternalRow {
  return {
    id: "d1",
    providerRef: "dep-1",
    fallbackRef: null,
    amountLocal: 1000,
    currency: "KES",
    country: "KE",
    internalStatus: "success",
    createdAt: "2026-09-18T10:00:00.000Z",
    ...overrides,
  };
}

function provider(overrides: Partial<ReconProviderRow>): ReconProviderRow {
  return {
    provider: "pawapay",
    providerRef: "dep-1",
    direction: "deposit",
    providerStatus: "COMPLETED",
    amountLocal: 1000,
    currency: "KES",
    country: "KE",
    receivedAt: "2026-09-18T10:05:00.000Z",
    ...overrides,
  };
}

// ── runReconciliation ──────────────────────────────────────────────────

describe("runReconciliation", () => {
  it("matches identical transactions without exceptions", () => {
    const res = runReconciliation({
      deposits: [internal({})],
      withdrawals: [],
      providerTxs: [provider({})],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.providerTransactions).toBe(1);
    expect(res.summary.matched).toBe(1);
    expect(res.summary.unmatched).toBe(0);
    expect(res.exceptions).toHaveLength(0);
  });

  it("flags unmatched provider transactions", () => {
    const res = runReconciliation({
      deposits: [],
      withdrawals: [],
      providerTxs: [provider({})],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.unmatched).toBe(1);
    expect(res.exceptions[0].kind).toBe("unmatched_provider");
    expect(res.exceptions[0].severity).toBe("critical");
  });

  it("flags amount mismatches beyond tolerance", () => {
    const res = runReconciliation({
      deposits: [internal({ amountLocal: 900 })],
      withdrawals: [],
      providerTxs: [provider({ amountLocal: 1000 })],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.amountMismatches).toBe(1);
    const ex = res.exceptions[0];
    expect(ex.kind).toBe("amount_mismatch");
    expect(ex.difference).toBe(-100);
  });

  it("ignores small rounding differences within tolerance", () => {
    const res = runReconciliation({
      deposits: [internal({ amountLocal: 1005 })],
      withdrawals: [],
      providerTxs: [provider({ amountLocal: 1000 })],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.amountMismatches).toBe(0);
  });

  it("flags terminal status mismatches", () => {
    const res = runReconciliation({
      deposits: [internal({ internalStatus: "success" })],
      withdrawals: [],
      providerTxs: [provider({ providerStatus: "FAILED" })],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.statusMismatches).toBe(1);
    expect(res.exceptions.find((e) => e.kind === "status_mismatch")).toBeTruthy();
  });

  it("does not flag in-flight provider transactions as mismatches", () => {
    const res = runReconciliation({
      deposits: [internal({ internalStatus: "pending" })],
      withdrawals: [],
      providerTxs: [provider({ providerStatus: "ACCEPTED" })],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.statusMismatches).toBe(0);
    expect(res.summary.pending).toBe(1);
  });

  it("flags duplicate internal rows sharing one provider ref", () => {
    const a = internal({ id: "d1" });
    const b = internal({ id: "d2" });
    const res = runReconciliation({
      deposits: [a, b],
      withdrawals: [],
      providerTxs: [provider({})],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.duplicates).toBe(1);
    expect(res.exceptions.filter((e) => e.kind === "duplicate_internal")).toHaveLength(2);
  });

  it("flags stuck pending rows older than 48 hours", () => {
    const res = runReconciliation({
      deposits: [internal({ internalStatus: "pending", createdAt: "2026-09-15T10:00:00.000Z" })],
      withdrawals: [],
      providerTxs: [provider({ providerStatus: "ACCEPTED" })],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.stuckPending).toBe(1);
    expect(res.exceptions.find((e) => e.kind === "stuck_pending")).toBeTruthy();
  });

  it("flags missing provider records only for rows created after the store went live", () => {
    const oldRow = internal({ id: "old", providerRef: "dep-old", createdAt: "2026-09-01T00:00:00.000Z" });
    const newRow = internal({ id: "new", providerRef: "dep-new", createdAt: "2026-09-19T00:00:00.000Z" });
    const res = runReconciliation({
      deposits: [oldRow, newRow],
      withdrawals: [],
      providerTxs: [],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.missingProviderRecords).toBe(1);
    expect(res.exceptions[0].entityId).toBe("new");
  });

  it("matches withdrawals by payout reference and counts failed provider payouts", () => {
    const res = runReconciliation({
      deposits: [],
      withdrawals: [internal({ id: "w1", providerRef: "pay-1", internalStatus: "completed", fallbackRef: null })],
      providerTxs: [provider({ providerRef: "pay-1", direction: "payout", providerStatus: "COMPLETED" })],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.matched).toBe(1);
    expect(res.summary.failed).toBe(0);
  });

  it("uses the latest provider event per transaction", () => {
    const res = runReconciliation({
      deposits: [internal({})],
      withdrawals: [],
      providerTxs: [
        provider({ providerStatus: "ACCEPTED", receivedAt: "2026-09-18T10:05:00.000Z" }),
        provider({ providerStatus: "COMPLETED", receivedAt: "2026-09-18T11:00:00.000Z" }),
      ],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.providerTransactions).toBe(1);
    expect(res.summary.matched).toBe(1);
    expect(res.summary.pending).toBe(0);
  });

  it("does not flag withdrawals without a provider ref as stuck", () => {
    const res = runReconciliation({
      deposits: [],
      withdrawals: [internal({ id: "w2", providerRef: null, internalStatus: "pending", createdAt: "2026-09-01T00:00:00.000Z" })],
      providerTxs: [],
      storeLiveAt: STORE_LIVE,
      now: NOW,
    });
    expect(res.summary.stuckPending).toBe(0);
  });
});

// ── amountMismatchTolerance ─────────────────────────────────────────────

describe("amountMismatchTolerance", () => {
  it("allows 1% or 1 unit, whichever is larger", () => {
    expect(amountMismatchTolerance(1000)).toBe(10);
    expect(amountMismatchTolerance(50)).toBe(1);
  });
});

// ── wallet ledger ──────────────────────────────────────────────────────

describe("buildWalletHistory", () => {
  it("derives wallet-impact signs: escrows negative, payouts positive", () => {
    const history = buildWalletHistory(
      [
        { id: "1", created_at: "2026-09-18T10:00:00Z", amount: 5000, method: "mobile_money", status: "success", currency: "MWK", amount_local: 5000 },
        { id: "2", created_at: "2026-09-18T11:00:00Z", amount: 10, method: "battle_escrow", status: "success", currency: "MWK", amount_local: 10 },
        { id: "3", created_at: "2026-09-18T12:00:00Z", amount: 18, method: "battle_payout", status: "success", currency: "MWK", amount_local: 18 },
        { id: "4", created_at: "2026-09-18T13:00:00Z", amount: -100, method: "ad_purchase", status: "success", currency: "MWK", amount_local: -100 },
      ],
      [
        { id: "w1", created_at: "2026-09-19T09:00:00Z", processed_at: null, amount: 25, fee: 2, currency: "MWK", amount_local: 25, status: "completed", pawapay_ref: "pay-9" },
      ]
    );
    const byId = new Map(history.map((h) => [h.id, h]));
    expect(byId.get("1")!.amountMwk).toBe(5000);           // deposit +
    expect(byId.get("2")!.amountMwk).toBe(-10);            // escrow stored + but wallet impact −
    expect(byId.get("2")!.type).toBe("battle_stake");
    expect(byId.get("3")!.amountMwk).toBe(18);             // payout +
    expect(byId.get("4")!.amountMwk).toBe(-100);           // wallet-debit stored −
    expect(byId.get("w1")!.amountMwk).toBe(-25);           // withdrawal −
    expect(byId.get("w1:fee")!.amountMwk).toBe(-2);        // fee −
    expect(history[0].id).toBe("w1");                       // newest first
  });

  it("flips only known escrow methods", () => {
    expect(walletImpactAmount("battle_escrow", 500)).toBe(-500);
    expect(walletImpactAmount("battle_challenge_escrow", 200)).toBe(-200);
    expect(walletImpactAmount("battle_refund", 500)).toBe(500);
    expect(walletImpactAmount("tournament_entry", -500)).toBe(-500);
    expect(walletImpactAmount("mobile_money", 500)).toBe(500);
  });

  describe("walletReconcileImpact (dossier derived-balance math)", () => {
    it("external payments never count toward the wallet-derived balance", () => {
      // Membership is paid directly via PawaPay/PayChangu mobile money —
      // the deposits row tracks platform revenue, the wallet never moves.
      expect(walletReconcileImpact("membership_purchase", 5_000)).toBe(0);
    });

    it("passes real wallet movements through unchanged", () => {
      expect(walletReconcileImpact("battle_escrow", 500)).toBe(-500);
      expect(walletReconcileImpact("battle_payout", 900)).toBe(900);
      expect(walletReconcileImpact("tournament_entry", -500)).toBe(-500);
      expect(walletReconcileImpact("admin_adjustment", -500)).toBe(-500);
      expect(walletReconcileImpact("withdrawal_refund", 500)).toBe(500);
    });
  });

  it("walletImpactAmount still shows real amounts for display (legacy)", () => {
    expect(walletImpactAmount("membership_purchase", 5_000)).toBe(5_000);
  });

  it("maps ledger types for all production methods", () => {
    expect(ledgerTypeForMethod("mobile_money")).toBe("deposit");
    expect(ledgerTypeForMethod("battle_payout")).toBe("battle_win");
    expect(ledgerTypeForMethod("platform_cut")).toBe("battle_fee");
    expect(ledgerTypeForMethod("tournament_entry")).toBe("tournament_payment");
    expect(ledgerTypeForMethod("membership_purchase")).toBe("membership_payment");
    expect(ledgerTypeForMethod("ad_purchase")).toBe("ad_payment");
    expect(ledgerTypeForMethod("battle_refund")).toBe("refund");
    expect(ledgerTypeForMethod("admin_adjustment")).toBe("adjustment");
    expect(ledgerTypeForMethod("unknown_future_method")).toBe("adjustment");
  });
});
