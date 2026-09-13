import { describe, expect, it } from "vitest";
import { getPremoveGhosts } from "../premove-ghost";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("getPremoveGhosts", () => {
  it("returns nothing with no premoves", () => {
    expect(getPremoveGhosts(START, true, [])).toEqual({});
  });

  it("shows the piece at a single premove destination", () => {
    expect(getPremoveGhosts(START, true, [{ from: "e2", to: "e4" }])).toEqual({ e4: "wP" });
  });

  it("shows a ghost per hop when one piece is chained", () => {
    // knight chain g1->f3 then "from f3" -> g5
    const ghosts = getPremoveGhosts(START, true, [
      { from: "g1", to: "f3" },
      { from: "f3", to: "g5" },
    ]);
    expect(ghosts).toEqual({ f3: "wN", g5: "wN" });
  });

  it("shows each piece of a multi-piece chain at its own destination", () => {
    const ghosts = getPremoveGhosts(START, true, [
      { from: "e2", to: "e4" },
      { from: "g1", to: "f3" },
    ]);
    expect(ghosts).toEqual({ e4: "wP", f3: "wN" });
  });

  it("tracks black's pieces for black", () => {
    expect(getPremoveGhosts(START, false, [{ from: "e7", to: "e5" }])).toEqual({ e5: "bP" });
    // same chain as white would find nothing — wrong color pieces aren't origins
    expect(getPremoveGhosts(START, true, [{ from: "e7", to: "e5" }])).toEqual({});
  });

  it("skips hops with a broken origin (dangling chain), keeping earlier ghosts", () => {
    const ghosts = getPremoveGhosts(START, true, [
      { from: "e2", to: "e4" },
      { from: "h8", to: "h6" }, // no white piece there — broken hop
      { from: "e4", to: "e5" }, // valid continuation of the pawn chain
    ]);
    expect(ghosts).toEqual({ e4: "wP", e5: "wP" });
  });

  it("re-homing a piece from a projected square carries the right piece", () => {
    // pawn chain e2->e4->e5: the second hop "from e4" must ghost as the same pawn
    const ghosts = getPremoveGhosts(START, true, [
      { from: "e2", to: "e4" },
      { from: "e4", to: "e5" },
    ]);
    expect(ghosts).toEqual({ e4: "wP", e5: "wP" });
  });

  it("ghosts a capture destination with the moving piece, not the victim", () => {
    // after 1.e4 d5: white premove exd5 — d5 holds a black pawn; ghost is the white pawn
    const after = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2";
    expect(getPremoveGhosts(after, true, [{ from: "e4", to: "d5" }])).toEqual({ d5: "wP" });
  });

  it("promotion premove ghosts as the pawn until execution chooses the piece", () => {
    // white pawn on e7 premoving e8 — ghost stays a pawn (picker runs at execution)
    const e7Fen = "4k3/4P3/8/8/8/8/8/4K3 w - - 0 1";
    expect(getPremoveGhosts(e7Fen, true, [{ from: "e7", to: "e8" }])).toEqual({ e8: "wP" });
  });

  it("survives an invalid FEN", () => {
    expect(getPremoveGhosts("not a fen", true, [{ from: "e2", to: "e4" }])).toEqual({});
  });
});
