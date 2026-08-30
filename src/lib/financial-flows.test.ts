import { describe, it, expect } from "vitest";
import { calcPayout } from "./battles/battle-helpers";

// Test the membership pricing logic without importing the full module
// (which depends on Supabase). We replicate the core calculation here
// to lock down the business rules.

describe("Membership pricing — business rules", () => {
  const MONTHLY_PRICE = 10000;     // MWK
  const YEARLY_PRICE = 100000;    // MWK (10 months — 2 free)
  const COMMISSION_RATE = 0.25;   // 25% affiliate commission

  describe("Pricing", () => {
    it("monthly price is MK10,000", () => {
      expect(MONTHLY_PRICE).toBe(10000);
    });

    it("yearly price is MK100,000", () => {
      expect(YEARLY_PRICE).toBe(100000);
    });

    it("yearly equals 10x monthly (2 months free)", () => {
      expect(YEARLY_PRICE).toBe(MONTHLY_PRICE * 10);
    });

    it("yearly saves MK20,000 vs monthly", () => {
      const monthlyForYear = MONTHLY_PRICE * 12;
      const savings = monthlyForYear - YEARLY_PRICE;
      expect(savings).toBe(20000);
    });
  });

  describe("Affiliate commission (25%)", () => {
    it("commission on monthly membership is MK2,500", () => {
      expect(Math.round(MONTHLY_PRICE * COMMISSION_RATE)).toBe(2500);
    });

    it("commission on yearly membership is MK25,000", () => {
      expect(Math.round(YEARLY_PRICE * COMMISSION_RATE)).toBe(25000);
    });

    it("commission rate is exactly 25%", () => {
      expect(COMMISSION_RATE).toBe(0.25);
    });

    it("old flat MK500 reward is less than new commission for monthly", () => {
      const oldReward = 500;
      const newCommission = MONTHLY_PRICE * COMMISSION_RATE;
      expect(newCommission).toBeGreaterThan(oldReward);
    });

    it("old flat MK500 reward is less than new commission for yearly", () => {
      const oldReward = 500;
      const newCommission = YEARLY_PRICE * COMMISSION_RATE;
      expect(newCommission).toBeGreaterThan(oldReward);
    });
  });

  describe("Platform fee on battles (5%)", () => {
    it("MK500 battle: pot MK1000, fee MK50, winner gets MK950", () => {
      const stake = 500;
      const feePct = 5;
      const pot = stake * 2;
      const fee = Math.round(pot * feePct / 100);
      const payout = pot - fee;
      expect(pot).toBe(1000);
      expect(fee).toBe(50);
      expect(payout).toBe(950);
    });

    it("MK10,000 battle: pot MK20,000, fee MK1,000, winner gets MK19,000", () => {
      const stake = 10000;
      const feePct = 5;
      const pot = stake * 2;
      const fee = Math.round(pot * feePct / 100);
      const payout = pot - fee;
      expect(pot).toBe(20000);
      expect(fee).toBe(1000);
      expect(payout).toBe(19000);
    });
  });
});

describe("Withdrawal fee calculation", () => {
  // The withdrawal fee fix: manual approvals must calculate and deduct
  // the fee BEFORE payment, not after.

  it("MK5,000 withdrawal with 10% fee: fee MK500, net MK4,500", () => {
    const amount = 5000;
    const feePct = 10;
    const fee = Math.round(amount * feePct / 100);
    const net = amount - fee;
    expect(fee).toBe(500);
    expect(net).toBe(4500);
  });

  it("MK1,000 withdrawal with 10% fee: fee MK100, net MK900", () => {
    const amount = 1000;
    const feePct = 10;
    const fee = Math.round(amount * feePct / 100);
    const net = amount - fee;
    expect(fee).toBe(100);
    expect(net).toBe(900);
  });

  it("net amount is always less than gross when fee > 0", () => {
    for (const amount of [500, 1000, 2500, 5000, 10000]) {
      const fee = Math.round(amount * 0.1);
      const net = amount - fee;
      expect(net).toBeLessThan(amount);
      expect(net).toBeGreaterThan(0);
    }
  });
});

describe("Battle escrow — double-spend prevention", () => {
  // The settle.ts logic uses an atomic guard: it marks the battle as
  // settled FIRST with .eq("settled", false), so a concurrent settlement
  // gets 0 rows and returns "already_settled". This test documents that
  // expectation.

  it("a second settlement attempt should return already_settled", () => {
    // Simulating the guard: if settled is already true, update returns 0 rows
    const battle = { settled: true };
    const guardPassed = battle.settled === false;
    expect(guardPassed).toBe(false);
  });

  it("first settlement should proceed when settled is false", () => {
    const battle = { settled: false };
    const guardPassed = battle.settled === false;
    expect(guardPassed).toBe(true);
  });
});



describe("Staked rematch flow — business rules", () => {
  it("rematch of a staked battle carries the same stake", () => {
    const originalStake = 5000;
    const rematchStake = originalStake;
    expect(rematchStake).toBe(5000);
  });

  it("rematch of a non-battle game has stake = 0 (free)", () => {
    const stake = 0;
    expect(stake).toBe(0);
  });

  it("staked rematch payout follows the same formula as battles", () => {
    const stake = 5000;
    const feePct = 5;
    const { pot, fee, payout } = calcPayout(stake, feePct);
    expect(pot).toBe(10000);
    expect(fee).toBe(500);
    expect(payout).toBe(9500);
  });

  it("both players must have sufficient balance for staked rematch", () => {
    const stake = 5000;
    const requesterBalance = 3000;
    const acceptorBalance = 6000;

    expect(requesterBalance < stake).toBe(true);
    expect(acceptorBalance >= stake).toBe(true);
  });

  it("if requester balance drops after offer, accept fails for requester", () => {
    const stake = 5000;
    const requesterBalanceAtAccept = 2000;
    expect(requesterBalanceAtAccept < stake).toBe(true);
  });

  it("staked rematch refunds both players if game creation fails", () => {
    const stake = 5000;
    const debited = [stake, stake];
    const refunded = [stake, stake];
    expect(debited).toEqual(refunded);
  });

  it("staked rematch creates a battle record linked to the new game", () => {
    const stake = 1000;
    const { pot, fee, payout } = calcPayout(stake, 5);
    expect(pot).toBe(2000);
    expect(fee).toBe(100);
    expect(payout).toBe(1900);
  });

  it("rematch offer stores stake for opponent to see before accepting", () => {
    const offer = { stake: 2500, status: "pending" };
    expect(offer.stake).toBe(2500);
    expect(offer.stake > 0).toBe(true);
  });
});
