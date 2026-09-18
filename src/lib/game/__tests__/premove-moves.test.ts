import { describe, expect, it } from "vitest";
import { getPremoveDestinations, filterTapTargets } from "../premove-moves";

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

  it("offers a forward pawn push onto an OCCUPIED square — the blocker may vacate", () => {
    // White d4 pawn facing black d5 pawn: d5 is a candidate (black's
    // pawn may be traded away or the square opened by the reply), even
    // though a push onto it is illegal right now. Execution-time
    // re-validation cancels the hop if the square is still blocked.
    const fen = "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3";
    expect(getPremoveDestinations(fen, true, "d4")).toContain("d5");
  });

  it("includes the RECAPTURE target — a take onto my OWN piece's square", () => {
    // White pawn b2, white knight c3, black knight b5 (attacking c3).
    // The classic recapture premove: queue bxc3 onto MY OWN knight's
    // square, expecting black to capture it first. It MUST queue.
    const fen = "4k3/8/8/8/1n6/2N5/1P6/4K3 b - - 0 1";
    const d = getPremoveDestinations(fen, true, "b2");
    expect(d).toContain("c3");
    expect(d).toContain("a3");
    expect(d).toContain("b3");
    expect(d).toContain("b4");
  });

  it("knight can premove a capture onto an enemy piece", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4N3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
    expect(getPremoveDestinations(fen, true, "e4")).toContain("d6");
  });

  it("knight can premove onto my own piece's square (recapture / vacate)", () => {
    // White knight d5, white pawn f6 (own). f6 is a geometric knight
    // target — the pawn may die to the opponent's reply, or vacate in a
    // stacked chain — so f6 must be a candidate.
    const fen = "4k3/8/5N2/3N4/8/8/8/4K3 w - - 0 1";
    expect(getPremoveDestinations(fen, true, "d5")).toContain("f6");
  });

  it("sliders ray THROUGH everything — own pieces included — to the board edge", () => {
    // Rook a1; enemy rook e1; own king h1.
    // b1-d1 open, e1 = capture, f1/g1 through the enemy (it may vacate),
    // h1 through MY OWN king (it may vacate earlier in a stacked chain).
    const fen = "4k3/8/8/8/8/8/8/R3r1K1 w - - 0 1";
    const d = getPremoveDestinations(fen, true, "a1");
    expect(d).toContain("b1");
    expect(d).toContain("d1");
    expect(d).toContain("e1"); // capture if it stays
    expect(d).toContain("f1"); // through the enemy rook
    expect(d).toContain("h1"); // through my own king
  });

  it("king pre-moves to all geometric neighbor squares", () => {
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
    expect(d).toContain("e4"); // forward (may open with the reply)
    expect(d).not.toContain("e6"); // behind — black never moves backward
  });
});

describe("filterTapTargets — tap path keeps selecting own pieces", () => {
  const fen = "4k3/8/8/8/1n6/2N5/1P6/4K3 b - - 0 1"; // own Nc3, own Pb2

  it("drops own-occupied squares so a tap re-selects instead of queueing", () => {
    const tap = filterTapTargets(fen, true, ["c3", "a3", "b3", "b4", "c1"]);
    expect(tap).not.toContain("c3"); // own knight — tap must re-select it
    expect(tap).toContain("a3");
    expect(tap).toContain("b4");
  });

  it("keeps enemy-occupied and empty squares (capture targets stay tappable)", () => {
    const tap = filterTapTargets(fen, true, ["b4"]); // enemy knight square
    expect(tap).toContain("b4");
  });

  it("passes the list through on an invalid fen", () => {
    expect(filterTapTargets("not a fen", true, ["a1", "b2"])).toEqual(["a1", "b2"]);
  });
});
