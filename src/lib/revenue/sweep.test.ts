import { describe, it, expect } from "vitest";
import { battleFee, computeRevenueFromRows, decideSweep } from "./sweep";

describe("battleFee", () => {
  it("fee = pot minus winner payout", () => {
    // 1000 stake each -> pot 2000, 10% fee -> payout 1800
    expect(battleFee(1000, 1800)).toBe(200);
  });

  it("handles fee-free battles", () => {
    expect(battleFee(500, 1000)).toBe(0);
  });

  it("null stake or payout maps to safe values", () => {
    expect(battleFee(null, 1800)).toBe(0); // pot 0
    expect(battleFee(1000, null)).toBe(2000); // nothing paid out
    expect(battleFee(0, 0)).toBe(0);
  });

  it("never negative (defensive against bad data)", () => {
    expect(battleFee(100, 5000)).toBe(0);
  });
});

describe("computeRevenueFromRows", () => {
  it("sums battle fees + withdrawal fees", () => {
    const battles = [
      { stake: 1000, winner_payout: 1800 }, // 200
      { stake: 500, winner_payout: 900 },   // 100
    ];
    const withdrawals = [{ fee: 50 }, { fee: 25 }, { fee: null }];
    const r = computeRevenueFromRows(battles, withdrawals);
    expect(r.battleFees).toBe(300);
    expect(r.withdrawalFees).toBe(75);
    expect(r.total).toBe(375);
  });

  it("empty rows = zero revenue", () => {
    const r = computeRevenueFromRows([], []);
    expect(r).toEqual({ battleFees: 0, withdrawalFees: 0, total: 0 });
  });
});

describe("decideSweep", () => {
  it("disabled wins over everything", () => {
    expect(decideSweep(false, 50000, 1000).action).toBe("disabled");
  });

  it("below minimum carries over", () => {
    expect(decideSweep(true, 500, 1000).action).toBe("below_min");
    expect(decideSweep(true, 0, 0).action).toBe("below_min");
  });

  it("meets minimum -> sweep", () => {
    expect(decideSweep(true, 1000, 1000).action).toBe("sweep");
    expect(decideSweep(true, 30969, 1000).action).toBe("sweep");
  });
});
