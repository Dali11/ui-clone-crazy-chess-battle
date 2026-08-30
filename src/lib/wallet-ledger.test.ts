import { describe, it, expect } from "vitest";
import {
  LEDGER_METHOD_META,
  getLedgerMeta,
  ledgerDisplayAmount,
  WITHDRAWAL_META,
  type LedgerDirection,
} from "@/lib/wallet-ledger";

describe("Wallet Ledger — classification", () => {
  it("classifies mobile money and card as inflow", () => {
    expect(LEDGER_METHOD_META.mobile_money.direction).toBe("in");
    expect(LEDGER_METHOD_META.card.direction).toBe("in");
  });

  it("classifies battle escrow and challenge escrow as outflow", () => {
    expect(LEDGER_METHOD_META.battle_escrow.direction).toBe("out");
    expect(LEDGER_METHOD_META.battle_challenge_escrow.direction).toBe("out");
  });

  it("classifies battle payouts and refunds as inflow", () => {
    expect(LEDGER_METHOD_META.battle_payout.direction).toBe("in");
    expect(LEDGER_METHOD_META.battle_refund.direction).toBe("in");
    expect(LEDGER_METHOD_META.battle_challenge_cancel.direction).toBe("in");
  });

  it("classifies tournament entry as outflow, prize as inflow", () => {
    expect(LEDGER_METHOD_META.tournament_entry.direction).toBe("out");
    expect(LEDGER_METHOD_META.tournament_payout.direction).toBe("in");
    expect(LEDGER_METHOD_META.tournament_creator_profit.direction).toBe("in");
  });

  it("classifies admin corrections as outflow", () => {
    expect(LEDGER_METHOD_META.clawback_duplicate_refund.direction).toBe("out");
    expect(LEDGER_METHOD_META.duplicate_payout_removal.direction).toBe("out");
  });

  it("returns safe defaults for unknown method", () => {
    const meta = getLedgerMeta("unknown_method_xyz");
    expect(meta.label).toBe("unknown_method_xyz");
    expect(meta.direction).toBe("in");
  });

  it("returns safe default for null/undefined", () => {
    expect(getLedgerMeta(null).label).toBe("Wallet Activity");
    expect(getLedgerMeta(undefined).label).toBe("Wallet Activity");
    expect(getLedgerMeta("").label).toBe("Wallet Activity");
  });
});

describe("Wallet Ledger — display amount", () => {
  it("returns positive for inflow", () => {
    expect(ledgerDisplayAmount(5000, "in")).toBe(5000);
    expect(ledgerDisplayAmount(10000, "in")).toBe(10000);
  });

  it("returns negative for outflow", () => {
    expect(ledgerDisplayAmount(5000, "out")).toBe(-5000);
    expect(ledgerDisplayAmount(10000, "out")).toBe(-10000);
  });

  it("handles negative stored amounts (sign normalization)", () => {
    // Some rows store negative amounts even for inflows — display normalizes
    expect(ledgerDisplayAmount(-5000, "in")).toBe(5000);
    expect(ledgerDisplayAmount(-5000, "out")).toBe(-5000);
  });

  it("handles zero and null safely", () => {
    expect(ledgerDisplayAmount(0, "in")).toBe(0);
    expect(ledgerDisplayAmount(0, "out")).toBe(0);
    expect(ledgerDisplayAmount(null as any, "in")).toBe(0);
    expect(ledgerDisplayAmount(undefined as any, "out")).toBe(0);
  });
});

describe("Wallet Ledger — withdrawal meta", () => {
  it("is always outflow", () => {
    expect(WITHDRAWAL_META.direction).toBe("out");
    expect(WITHDRAWAL_META.label).toBe("Withdrawal");
  });
});
