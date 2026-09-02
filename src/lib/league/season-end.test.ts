import { describe, it, expect } from "vitest";
import {
  getPromotedPlayers,
  getRelegatedPlayers,
  calculatePayouts,
  type LeagueStandingItem,
} from "@/lib/league/season-end";

describe("Season-End Logic — Pure Helpers", () => {
  const standings: LeagueStandingItem[] = [
    { player_id: "p1", position: 1 },
    { player_id: "p2", position: 2 },
    { player_id: "p3", position: 3 },
    { player_id: "p4", position: 4 },
  ];

  describe("Promotion", () => {
    it("identifies top N players for promotion correctly", () => {
      const promoted = getPromotedPlayers(standings, 2);
      expect(promoted).toEqual(["p1", "p2"]);
    });

    it("handles promotesCount = 0", () => {
      const promoted = getPromotedPlayers(standings, 0);
      expect(promoted).toEqual([]);
    });

    it("handles promotesCount greater than total players", () => {
      const promoted = getPromotedPlayers(standings, 10);
      expect(promoted).toEqual(["p1", "p2", "p3", "p4"]);
    });

    it("handles empty standings array", () => {
      const promoted = getPromotedPlayers([], 2);
      expect(promoted).toEqual([]);
    });
  });

  describe("Relegation", () => {
    it("identifies bottom N players for relegation correctly", () => {
      const relegated = getRelegatedPlayers(standings, 2);
      expect(relegated).toEqual(["p3", "p4"]);
    });

    it("handles relegatesCount = 0", () => {
      const relegated = getRelegatedPlayers(standings, 0);
      expect(relegated).toEqual([]);
    });

    it("handles relegatesCount greater than total players", () => {
      const relegated = getRelegatedPlayers(standings, 10);
      expect(relegated).toEqual(["p1", "p2", "p3", "p4"]);
    });

    it("handles empty standings array", () => {
      const relegated = getRelegatedPlayers([], 2);
      expect(relegated).toEqual([]);
    });
  });

  describe("Prize Distribution (calculatePayouts)", () => {
    it("calculates correct amounts from decimal payout_config", () => {
      const payoutConfig = { "1": 0.5, "2": 0.3, "3": 0.2 };
      const prizePool = 10000;
      const payouts = calculatePayouts(prizePool, payoutConfig, standings);
      expect(payouts).toEqual([
        { playerId: "p1", position: 1, amount: 5000 },
        { playerId: "p2", position: 2, amount: 3000 },
        { playerId: "p3", position: 3, amount: 2000 },
      ]);
    });

    it("calculates correct amounts from percentage payout_config (e.g. 50, 30, 20)", () => {
      const payoutConfig = { "1": 50, "2": 30, "3": 20 };
      const prizePool = 20000;
      const payouts = calculatePayouts(prizePool, payoutConfig, standings);
      expect(payouts).toEqual([
        { playerId: "p1", position: 1, amount: 10000 },
        { playerId: "p2", position: 2, amount: 6000 },
        { playerId: "p3", position: 3, amount: 4000 },
      ]);
    });

    it("handles no prize pool (prizePool = 0)", () => {
      const payoutConfig = { "1": 0.5, "2": 0.3 };
      const payouts = calculatePayouts(0, payoutConfig, standings);
      expect(payouts).toEqual([]);
    });

    it("handles null or empty payout_config", () => {
      const payouts1 = calculatePayouts(10000, null, standings);
      expect(payouts1).toEqual([]);
      const payouts2 = calculatePayouts(10000, {}, standings);
      expect(payouts2).toEqual([]);
    });

    it("handles empty standings", () => {
      const payoutConfig = { "1": 0.5 };
      const payouts = calculatePayouts(10000, payoutConfig, []);
      expect(payouts).toEqual([]);
    });

    it("skips positions that don't exist in standings", () => {
      const payoutConfig = { "1": 0.5, "5": 0.5 };
      const payouts = calculatePayouts(10000, payoutConfig, standings);
      expect(payouts).toEqual([
        { playerId: "p1", position: 1, amount: 5000 },
      ]);
    });
  });
});
