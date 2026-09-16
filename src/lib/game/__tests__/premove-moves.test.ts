import { describe, expect, it } from "vitest";
import { getPremoveDestinations } from "../premove-moves";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("getPremoveDestinations", () => {
  it("includes EMPTY diagonal pawn takes — the classic premove exd5", () => {
    // After 1.e4 white wants to premove exd5 BEFORE black plays d5.
    // d5 and f5 are empty — chess.js would report neither.
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const d = getPremoveDestinations(afterE4, true, "e4");
    expect(d).toContain("d5");
    expect(d).toContain("f5");
    expect(d).toContain("e5");
  });

  it("includes a pawn diagonal that already holds an enemy piece", () => {
    // after 1.e4 d5: premove exd5 with the victim already there
    const after = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2";
    expect(getPremoveDestinations(after, true, "e4")).toContain("d5");
  });

  it("never offers a forward pawn move onto an occupied square", () => {
    // White d4 pawn facing black d5 pawn: forward is blocked,
    // but the diagonal takes (c5/e5) remain available.
    const fen = "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3";
    const d = getPremoveDestinations(fen, true, "d4");
    expect(d).not.toContain("d5");
    expect(d).toContain("c5");
    expect(d).toContain("e5");
  });

  it("never includes squares occupied by my own pieces", () => {
    // knight g1 in the start position: f3/h3 only — e2/g2 are own pawns
    const d = getPremoveDestinations(START, true, "g1");
    expect(d.sort()).toEqual(["f3", "h3"]);
  });

  it("knight can premove a capture onto an enemy piece", () => {
    // black knight on d4 can jump to capture on e2? — use simple:
    // white knight e4, black pawn on d6 → d6 is a candidate (knight capture)
    const fen = "rnbqkbnr/pppppppp/8/8/4N3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
    expect(getPremoveDestinations(fen, true, "e4")).toContain("d6");
  });

  it("sliders stop at own pieces, capture AND ray through enemy pieces", () => {
    // Rook a1; enemy rook e1; own king h1.
    // b1-d1 open, e1 = capture, f1/g1 reachable THROUGH the enemy (it may
    // vacate) — but never h1 (own piece).
    const fen = "4k3/8/8/8/8/8/8/R3r1RK w - - 0 1";
    const d = getPremoveDestinations(fen, true, "a1");
    expect(d).toContain("b1");
    expect(d).toContain("d1");
    expect(d).toContain("e1"); // capture
    expect(d).toContain("f1"); // through the enemy rook
    expect(d).not.toContain("h1"); // own rook blocks
  });

  it("king pre-moves to all free neighbor squares", () => {
    const fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
    const d = getPremoveDestinations(fen, true, "e1").sort();
    expect(d).toEqual(["d1", "d2", "e2", "f1", "f2"]);
  });

  it("returns nothing for the opponent's pieces or empty squares", () => {
    expect(getPremoveDestinations(START, true, "e7")).toEqual([]);
    expect(getPremoveDestinations(START, true, "e4")).toEqual([]);
  });

  it("black pawn takes use the correct direction", () => {
    // black pawn e5 (black to move) — takes on d4/f4 even when empty
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 2";
    const d = getPremoveDestinations(fen, false, "e5");
    expect(d).toContain("d4");
    expect(d).toContain("f4");
    expect(d).toContain("e4"); // forward (empty)
    expect(d).not.toContain("e6"); // behind — black never moves backward
  });
});
