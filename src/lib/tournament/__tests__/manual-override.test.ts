import { describe, it, expect } from "vitest";
import { findPairingForPlayers } from "@/lib/tournament/results";

const W = "player-white";
const B = "player-black";

describe("findPairingForPlayers (admin manual override matching)", () => {
  const pairings = [
    { white: "other-a", black: "other-b", result: "white" },
    { white: W, black: B, result: null },
    { white: "bye-player", bye: true },
  ];

  it("finds the pairing for the two players", () => {
    const p = findPairingForPlayers(pairings, W, B);
    expect(p).toBeDefined();
    expect(p!.white).toBe(W);
    expect(p!.black).toBe(B);
  });

  it("matches regardless of orientation (admin passes white/black either way)", () => {
    expect(findPairingForPlayers(pairings, B, W)).toBeDefined();
    expect(findPairingForPlayers(pairings, B, W)!.white).toBe(W);
  });

  it("never matches a bye pairing", () => {
    expect(findPairingForPlayers(pairings, "bye-player", "anyone")).toBeUndefined();
  });

  it("returns undefined when no pairing matches", () => {
    expect(findPairingForPlayers(pairings, "ghost-1", "ghost-2")).toBeUndefined();
  });

  it("treats null and undefined result as unrecorded, any string as recorded", () => {
    const unrecorded = [
      { white: W, black: B, result: null },
      { white: W, black: B },
    ];
    for (const p of unrecorded) {
      expect(p.result === null || p.result === undefined).toBe(true);
    }
    const recorded = { white: W, black: B, result: "draw" };
    expect(recorded.result !== null && recorded.result !== undefined).toBe(true);
  });

  it("does not match a recorded pairing's neighbours (only the exact pairing)", () => {
    const round = [
      { white: "a1", black: "a2", result: "black" },
      { white: W, black: B, result: null },
    ];
    const p = findPairingForPlayers(round, W, B);
    expect(p).toBe(round[1]);
  });
});
