import { describe, it, expect } from "vitest";
import {
  getLedgerMeta,
  ledgerDisplayAmount,
  LEDGER_METHOD_META,
  LEDGER_SIGNED_METHODS,
} from "@/lib/wallet-ledger";

/**
 * Zambian financials — audit + stress test.
 *
 * The production money math lives in Postgres (migration 080):
 *   - wallets store the player's LOCAL currency (ZMW for Zambia)
 *   - stakes / entry fees / prize pools / ledger rows store MWK
 *   - credit_wallet/debit_wallet convert: round(amount_mwk * mwk_rate(user))
 *   - request_withdrawal debits the LOCAL amount raw (withdrawals table is
 *     local-denominated, symmetric with refund_withdrawal / refund_failed_payout)
 *
 * These tests replicate those exact semantics (same rounding, same order)
 * and assert the invariants that make "every transaction add up":
 *
 *   I1  A refund at an UNCHANGED rate returns exactly what was charged
 *       (debit/credit symmetry).
 *   I2  A rejected/failed withdrawal returns exactly the debited amount
 *       (raw local units, no conversion, no fee leakage into the wallet).
 *   I3  The wallet balance always equals the ledger-derived balance, and
 *       MWK ledger rows sum to the net MWK movement.
 *   I4  Deposit round-trip local -> MWK -> local loses at most ~2 units to
 *       double rounding (PawaPay deposit path).
 *   I5  FX drift between charge and refund is bounded by amount*|drift|
 *       (documented exposure, not a silent error).
 *   I6  Every `method` string inserted by app code or SQL functions is
 *       classified — no unclassified OUTFLOW can render as green "+amount".
 */

// ─── Exact replicas of the production SQL semantics (migration 080) ────
const sqlCredit = (balanceLocal: number, amountMwk: number, rate: number): number =>
  balanceLocal + Math.round(amountMwk * rate);

const sqlDebit = (balanceLocal: number, amountMwk: number, rate: number): number => {
  const v = Math.round(amountMwk * rate);
  if (balanceLocal < v) throw new Error("Insufficient balance");
  return balanceLocal - v;
};

// request_withdrawal (migration 040) — debits the LOCAL amount raw.
const sqlWithdraw = (balanceLocal: number, amountLocal: number): number => {
  if (balanceLocal < amountLocal) throw new Error("Insufficient balance");
  return balanceLocal - amountLocal;
};

// refund_withdrawal / refund_failed_payout — credits back the raw amount.
const sqlRefundWithdrawal = (balanceLocal: number, amountLocal: number): number =>
  balanceLocal + amountLocal;

// PawaPay deposit creation (api/payments/pawapay/deposit) — local -> MWK.
const depositToMwk = (amountLocal: number, rate: number): number =>
  Math.round(amountLocal / rate);

// Plausible MWK->ZMW rate (~1 ZMW = 75 MWK).
const ZMW_RATE = 0.0133;

// ─── I1: debit/credit refund symmetry at unchanged rate ─────────────────
describe("Zambian financials — refund symmetry", () => {
  const rates = [1, 0.0133, 0.0058, 0.000037, 0.11]; // MWK, ZMW, KES-ish, MGA-ish, ZAR-ish
  const amounts = [0, 1, 7, 100, 999, 1000, 5000, 50000, 123456];

  for (const rate of rates) {
    it(`tournament join + cancel refund returns the exact balance (rate ${rate})`, () => {
      for (const fee of amounts) {
        for (const start of [0, 1_000_000]) {
          let afterDebit: number;
          try {
            afterDebit = sqlDebit(start, fee, rate); // insufficient balance: skip
          } catch {
            continue; // join route pre-checks balance, so this never occurs in prod
          }
          const afterRefund = sqlCredit(afterDebit, fee, rate);
          expect(afterRefund).toBe(start);
        }
      }
    });
  }

  it("battle escrow + refund is symmetric too (same primitive)", () => {
    for (const stake of [500, 5_000, 50_000]) {
      const b = 100_000;
      expect(sqlCredit(sqlDebit(b, stake, ZMW_RATE), stake, ZMW_RATE)).toBe(b);
    }
  });
});

// ─── I2: withdrawal lifecycle in raw local units ───────────────────────
describe("Zambian financials — withdrawal lifecycle", () => {
  it("rejected withdrawal refunds exactly what was debited (fees never touch the wallet)", () => {
    for (const amount of [500, 4_321, 20_000]) {
      const start = 100_000;
      const afterRequest = sqlWithdraw(start, amount);
      const afterReject = sqlRefundWithdrawal(afterRequest, amount);
      expect(afterReject).toBe(start);
    }
  });

  it("failed PawaPay payout (post-completed) refunds the full debited amount", () => {
    for (const amount of [1_000, 9_999]) {
      const afterRequest = sqlWithdraw(50_000, amount);
      const afterFailed = sqlRefundWithdrawal(afterRequest, amount);
      expect(afterFailed).toBe(50_000);
    }
  });
});

// ─── I4: deposit round-trip drift ──────────────────────────────────────
describe("Zambian financials — deposit round-trip", () => {
  it("local -> MWK -> back-to-wallet loses at most ~2 local units", () => {
    for (const local of [10, 100, 1_000, 4_500, 99_999]) {
      for (const rate of [0.0133, 0.0058, 0.000037]) {
        const mwkStored = depositToMwk(local, rate);
        const credited = Math.round(mwkStored * rate);
        expect(Math.abs(credited - local)).toBeLessThanOrEqual(2);
      }
    }
  });
});

// ─── I5: FX drift exposure is bounded ──────────────────────────────────
describe("Zambian financials — FX drift between charge and refund", () => {
  it("refund at a drifted rate differs from the charge by at most amount*|drift|+1", () => {
    const fee = 5_000; // MWK
    const r1 = 0.0133;
    const r2 = 0.0141; // rate moved against the player
    const charged = Math.round(fee * r1);
    const refunded = Math.round(fee * r2);
    const bound = Math.ceil(fee * Math.abs(r2 - r1)) + 1;
    expect(refunded - charged).toBeLessThanOrEqual(bound);
    expect(refunded - charged).toBeGreaterThanOrEqual(-bound);
  });
});

// ─── I3 + stress: randomized lifecycles reconcile against the ledger ───
describe("Zambian financials — randomized lifecycle stress", () => {
  // Deterministic PRNG (mulberry32) so failures reproduce.
  const rng = (seed: number) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  type LedgerRow = { method: string; amount: number };

  it("500 players x full lifecycle: wallet always equals ledger-derived balance", () => {
    const rand = rng(20260927);

    for (let p = 0; p < 500; p++) {
      const rate = 0.011 + rand() * 0.006; // ZMW rate drifts per player
      let balance = 0;
      let expected = 0; // expected balance from ledger rows
      const ledger: LedgerRow[] = [];

      const op = (mwkAmount: number, method: string) => {
        balance = sqlDebit(balance, mwkAmount, rate);
        expected -= Math.round(mwkAmount * rate);
        ledger.push({ method, amount: -mwkAmount }); // stored negative (join route)
      };
      const refund = (mwkAmount: number, method: string) => {
        balance = sqlCredit(balance, mwkAmount, rate);
        expected += Math.round(mwkAmount * rate);
        ledger.push({ method, amount: mwkAmount });
      };

      // seed the wallet with deposits
      for (let d = 0; d < 3; d++) {
        const local = Math.floor(100 + rand() * 90_000);
        const mwk = depositToMwk(local, rate);
        balance = sqlCredit(balance, mwk, rate);
        expected += Math.round(mwk * rate);
        ledger.push({ method: "pawapay", amount: mwk });
      }

      // random lifecycle: joins/cancels/battles/prizes/withdrawals
      for (let k = 0; k < 12; k++) {
        const choice = rand();
        if (choice < 0.35) {
          const fee = Math.floor(1 + rand() * 20_000);
          try { op(fee, "tournament_entry"); } catch { /* insufficient: skip */ }
        } else if (choice < 0.55) {
          const fee = Math.floor(1 + rand() * 20_000);
          refund(fee, "tournament_refund");
        } else if (choice < 0.7) {
          const prize = Math.floor(1 + rand() * 40_000);
          refund(prize, "tournament_payout");
        } else if (choice < 0.85) {
          // withdrawal request + reject (raw local units, like SQL)
          const amt = Math.floor(1 + rand() * Math.max(1, Math.floor(balance / 2)));
          balance = sqlWithdraw(balance, amt);
          expected -= amt;
          ledger.push({ method: "withdrawal_placeholder", amount: -amt });
          balance = sqlRefundWithdrawal(balance, amt);
          expected += amt;
          ledger.push({ method: "withdrawal_failed_refund", amount: amt });
        } else {
          // admin adjustment (signed MWK via credit/debit_wallet)
          const adj = Math.floor(1 + rand() * 5_000);
          if (rand() < 0.5) {
            balance = sqlCredit(balance, adj, rate);
            expected += Math.round(adj * rate);
            ledger.push({ method: "admin_adjustment", amount: adj });
          } else {
            try {
              balance = sqlDebit(balance, adj, rate);
              expected -= Math.round(adj * rate);
              ledger.push({ method: "admin_adjustment", amount: -adj });
            } catch { /* skip */ }
          }
        }
      }

      // INVARIANT: balance equals the ledger-derived expectation exactly.
      expect(balance).toBe(expected);

      // INVARIANT: MWK ledger rows sum to the net MWK movement (withdrawal
      // rows are local-denominated and excluded). Rounding tolerance: each
      // round(amount*rate) op can drift up to 0.5 local unit => <= n/2/rate MWK.
      const localDenominated = ledger.filter(
        (r) => r.method === "withdrawal_placeholder" || r.method === "withdrawal_failed_refund"
      );
      const mwkSum = ledger.reduce((s, r) => s + r.amount, 0) -
        localDenominated.reduce((s, r) => s + r.amount, 0);
      const walletMwkEquivalent = expected / rate;
      const tolerance = Math.ceil((ledger.length * 0.5) / rate);
      expect(Math.abs(mwkSum - walletMwkEquivalent)).toBeLessThanOrEqual(tolerance);
    }
  });
});

// ─── I6: classification coverage — no unclassified flows ───────────────
describe("Zambian financials — ledger classification coverage", () => {
  // Every method string inserted into `deposits` by app code (src/) or by
  // SQL functions (supabase/migrations). Verified by grep against the repo;
  // if you add a new one, add it here AND to LEDGER_METHOD_META / LEDGER_SIGNED_METHODS.
  const allMethods = [
    "ad_purchase", "ad_refund", "affiliate_commission", "battle_challenge_cancel",
    "battle_challenge_escrow", "battle_escrow", "battle_payout", "battle_refund",
    "card", "clawback_duplicate_refund", "duplicate_payout_removal", "league_reward",
    "membership_purchase", "mobile_money", "pawapay", "platform_revenue_sweep",
    "tournament_clawback", "tournament_creator_profit", "tournament_entry",
    "tournament_escrow", "tournament_escrow_refund", "tournament_payout",
    "tournament_payout_reversal", "tournament_refund", "withdrawal_failed_refund",
    "admin_adjustment",
  ];

  it("every deposit method in the codebase is classified", () => {
    for (const m of allMethods) {
      const classified = !!LEDGER_METHOD_META[m] || !!LEDGER_SIGNED_METHODS[m];
      expect(classified, `method '${m}' is not classified in wallet-ledger.ts`).toBe(true);
    }
  });

  it("money-out methods classify as outflow (never green +)", () => {
    const outMethods = [
      "battle_escrow", "battle_challenge_escrow", "tournament_entry", "tournament_escrow",
      "tournament_clawback", "tournament_payout_reversal", "membership_purchase",
      "ad_purchase", "clawback_duplicate_refund", "duplicate_payout_removal",
    ];
    for (const m of outMethods) {
      expect(LEDGER_METHOD_META[m].direction, `${m} must be "out"`).toBe("out");
    }
  });

  it("refund methods classify as inflow with friendly labels", () => {
    expect(getLedgerMeta("tournament_refund")).toEqual({
      label: "Tournament Entry Refund",
      direction: "in",
    });
    expect(getLedgerMeta("withdrawal_failed_refund").direction).toBe("in");
    expect(getLedgerMeta("battle_refund").direction).toBe("in");
  });

  it("signed methods derive direction from the stored amount sign", () => {
    expect(getLedgerMeta("admin_adjustment", -5000)).toEqual({
      label: "Admin Adjustment",
      direction: "out",
    });
    expect(getLedgerMeta("admin_adjustment", 5000).direction).toBe("in");
    // negative affiliate reversal (migration 085) must not render as inflow
    expect(getLedgerMeta("affiliate_commission", -250).direction).toBe("out");
    expect(getLedgerMeta("affiliate_commission", 250).direction).toBe("in");
  });

  it("a negative admin adjustment displays as a negative amount", () => {
    const meta = getLedgerMeta("admin_adjustment", -5000);
    expect(ledgerDisplayAmount(-5000, meta.direction)).toBe(-5000);
  });
});
