import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { queuePremove, resolvePremoveGrab } from "../premove-queue";

// White to move in the base position; premoves are made while it's
// black's turn, so use a FEN where black just moved.
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("resolvePremoveGrab", () => {
  it("accepts a grab of my own piece on its real square (fresh, no queue)", () => {
    const g = new Chess(START);
    const fen = swapTurn(g.fen());
    const grab = resolvePremoveGrab([], fen, true, "g1");
    expect(grab.ok).toBe(true);
    expect(grab.at).toBe(0);
    expect(grab.targets).toContain("f3");
    expect(grab.targets).toContain("h3");
  });

  it("rejects a grab of an empty or enemy square", () => {
    const g = new Chess(START);
    const fen = swapTurn(g.fen());
    expect(resolvePremoveGrab([], fen, true, "e4").ok).toBe(false); // empty
    expect(resolvePremoveGrab([], fen, true, "e7").ok).toBe(false); // enemy pawn
  });

  it("re-aims from the piece's first queued hop when grabbed on its real square", () => {
    const fen = swapTurn(START);
    const queue = [{ from: "g1", to: "f3" }];
    const grab = resolvePremoveGrab(queue, fen, true, "g1");
    expect(grab.ok).toBe(true);
    expect(grab.at).toBe(0); // replaces the g1->f3 hop
  });

  it("resolves a ghost grab mid-chain with candidates from the projected position", () => {
    const fen = swapTurn(START);
    const queue = [{ from: "g1", to: "f3" }];
    // Knight is projected at f3 — from there it can reach g5, e5, h4, d4...
    const grab = resolvePremoveGrab(queue, fen, true, "f3");
    expect(grab.ok).toBe(true);
    expect(grab.targets).toContain("g5");
    expect(grab.targets).toContain("e5");
    expect(grab.targets).toContain("h4");
    expect(grab.at).toBe(1); // appends after the g1->f3 hop
  });

  it("replaces the piece's next hop when re-grabbed mid-chain", () => {
    const fen = swapTurn(START);
    const queue = [
      { from: "g1", to: "f3" },
      { from: "f3", to: "g5" },
    ];
    const grab = resolvePremoveGrab(queue, fen, true, "f3");
    expect(grab.ok).toBe(true);
    expect(grab.at).toBe(1); // the f3->g5 hop is replaced
  });

  it("computes candidates on the projected board (own piece blocking clears mid-chain)", () => {
    // White bishop c1 blocked by d2 pawn. Queue d2->d4 first, then grab
    // c1 — candidates must be computed AFTER the pawn hop.
    const fen = swapTurn(START);
    const q1 = queuePremove([], fen, true, "d2", "d4");
    expect(q1.ok).toBe(true);
    const grab = resolvePremoveGrab(q1.queue, fen, true, "c1");
    expect(grab.ok).toBe(true);
    expect(grab.targets).toContain("g5"); // d4 vacated the diagonal
  });
});

describe("queuePremove — stacking", () => {
  it("stacks premoves of DIFFERENT pieces instead of replacing them", () => {
    const fen = swapTurn(START);
    const first = queuePremove([], fen, true, "g1", "f3");
    expect(first.ok).toBe(true);
    // Second premove: different piece — must STACK, not replace.
    const second = queuePremove(first.queue, fen, true, "e2", "e4");
    expect(second.ok).toBe(true);
    expect(second.queue).toEqual([
      { from: "g1", to: "f3" },
      { from: "e2", to: "e4" },
    ]);
  });

  it("re-aims the same piece when grabbed on its real square", () => {
    const fen = swapTurn(START);
    const first = queuePremove([], fen, true, "g1", "f3");
    const reaim = queuePremove(first.queue, fen, true, "g1", "h3");
    expect(reaim.ok).toBe(true);
    expect(reaim.queue).toEqual([{ from: "g1", to: "h3" }]);
  });

  it("chains the same piece through multiple squares (ghost grab)", () => {
    const fen = swapTurn(START);
    const first = queuePremove([], fen, true, "g1", "f3");
    // Grab the ghost at f3 and chain to g5 — the hop is f3->g5, NOT g1->g5.
    const second = queuePremove(first.queue, fen, true, "f3", "g5");
    expect(second.ok).toBe(true);
    expect(second.queue).toEqual([
      { from: "g1", to: "f3" },
      { from: "f3", to: "g5" },
    ]);
  });

  it("replaces a piece's LATER hop when re-grabbed mid-chain (earlier hops survive)", () => {
    const fen = swapTurn(START);
    const q1 = queuePremove([], fen, true, "g1", "f3");
    const q2 = queuePremove(q1.queue, fen, true, "f3", "g5");
    const q3 = queuePremove(q2.queue, fen, true, "g5", "e4");
    // Queue: g1f3, f3g5, g5e4. Re-grab the ghost at g5 — its next hop
    // (g5e4) must be REPLACED, the earlier hops kept:
    const reaim = queuePremove(q3.queue, fen, true, "g5", "h3");
    expect(reaim.ok).toBe(true);
    expect(reaim.queue).toEqual([
      { from: "g1", to: "f3" },
      { from: "f3", to: "g5" },
      { from: "g5", to: "h3" },
    ]);
  });

  it("appends when a piece is re-grabbed at the END of its own chain", () => {
    const fen = swapTurn(START);
    const q1 = queuePremove([], fen, true, "g1", "f3");
    const q2 = queuePremove(q1.queue, fen, true, "f3", "g5");
    const q3 = queuePremove(q2.queue, fen, true, "e2", "e4");
    // Knight chain currently ends at g5 (no later hop) — grabbing its
    // ghost there EXTENDS the chain instead of replacing anything:
    const ext = queuePremove(q3.queue, fen, true, "g5", "h3");
    expect(ext.ok).toBe(true);
    expect(ext.queue).toEqual([
      { from: "g1", to: "f3" },
      { from: "f3", to: "g5" },
      { from: "e2", to: "e4" },
      { from: "g5", to: "h3" },
    ]);
  });

  it("rejects impossible directions at queue time (the premove can never be legal)", () => {
    const fen = swapTurn(START);
    // Rook a1 to a3: blocked by a2 pawn now AND forever (own pawn doesn't move)
    const res = queuePremove([], fen, true, "a1", "a3");
    expect(res.ok).toBe(false);
    expect(res.queue).toEqual([]);
  });

  it("rejects hops to own-piece squares at queue time", () => {
    const fen = swapTurn(START);
    // Bishop c1 to d2 — own pawn there and not projected to move
    const res = queuePremove([], fen, true, "c1", "d2");
    expect(res.ok).toBe(false);
  });

  it("allows pawn-take diagonal premoves onto EMPTY squares", () => {
    const fen = swapTurn(START);
    const res = queuePremove([], fen, true, "e2", "d3");
    expect(res.ok).toBe(true);
    expect(res.queue).toEqual([{ from: "e2", to: "d3" }]);
  });

  it("rejects a ghost grab that no chain projects", () => {
    const fen = swapTurn(START);
    // Nothing is projected to e5 — no piece will be there
    const res = queuePremove([], fen, true, "e5", "e6");
    expect(res.ok).toBe(false);
  });

  it("works for black pieces too (correct pawn direction)", () => {
    const fen = swapTurn(START); // black to move (as premove creator, white just moved)
    const res = queuePremove([], fen, false, "e7", "e6");
    expect(res.ok).toBe(true);
    // Black pawn double-step works too (legal opening move)
    const dbl = queuePremove([], fen, false, "e7", "e5");
    expect(dbl.ok).toBe(true);
    // But three squares is impossible for a pawn — rejected at queue time
    const bad = queuePremove([], fen, false, "e7", "e4");
    expect(bad.ok).toBe(false);
  });
});

/** chess.js FEN turn swap, stripping en-passant (opponent's right). */
function swapTurn(fen: string): string {
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  return parts.join(" ");
}
