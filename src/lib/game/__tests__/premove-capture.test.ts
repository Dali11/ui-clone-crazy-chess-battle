import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { queuePremove } from "../premove-queue";

/**
 * Capture-premove regressions — the "premove doesn't work when eating"
 * bug. Recapture premoves (a take queued onto MY OWN piece's square,
 * expecting the opponent to capture it first) were impossible to queue:
 * getPremoveDestinations excluded own-occupied squares and stopped
 * slider rays at them. These tests cover the full queue → opponent
 * reply → executor-probe path the components run.
 */

// Executor validation exactly as game-client/computer-game run it at
// turn arrival: probe the front premove against the REAL new position.
function executorProbe(fen: string, from: string, to: string) {
  try {
    const chess = new Chess(fen);
    const probe = chess.move({ from: from as never, to: to as never, promotion: "q" });
    return probe !== null ? probe.san : null;
  } catch {
    return null;
  }
}

describe("capture premoves", () => {
  it("queues and plays the RECAPTURE premove (drag path)", () => {
    // White Pb2, white Nc3; black Nb5 attacks c3. White premoves bxc3
    // onto their OWN knight's square while black is to move; black
    // captures the knight (Nxc3); the premove executes as the recapture.
    const fen = "4k3/8/8/1n6/8/2N5/1P6/4K3 b - - 0 1";
    const res = queuePremove([], fen, true, "b2", "c3");
    expect(res.ok).toBe(true);

    const g = new Chess(fen);
    g.move("Nxc3"); // black captures white's knight on c3
    expect(executorProbe(g.fen(), "b2", "c3")).toBe("bxc3"); // recapture plays
  });

  it("cancels the recapture premove when my piece survives", () => {
    const fen = "4k3/8/8/1n6/8/2N5/1P6/4K3 b - - 0 1";
    const res = queuePremove([], fen, true, "b2", "c3");
    expect(res.ok).toBe(true);

    const g = new Chess(fen);
    g.move("Nc7"); // black leaves the knight alone
    expect(executorProbe(g.fen(), "b2", "c3")).toBeNull(); // bxc3 illegal — queue cancels
  });

  it("queues a slider ray THROUGH my own piece for a stacked chain", () => {
    // White Ra1, own Na3 in the way. Premove 1: knight hops OFF the
    // a-file (Na3-b5). Premove 2: rook a1-a6 THROUGH the vacated
    // square. The knight vacates first, so the rook ray must be
    // queueable through its current square.
    const fen = "4k3/8/8/8/8/N7/8/R3K3 b - - 0 1";
    const r1 = queuePremove([], fen, true, "a3", "b5");
    expect(r1.ok).toBe(true);
    const r2 = queuePremove(r1.queue, fen, true, "a1", "a6");
    expect(r2.ok).toBe(true);
    expect(r2.queue).toEqual([
      { from: "a3", to: "b5" },
      { from: "a1", to: "a6" },
    ]);

    // Play it out — hops alternate with the opponent's replies:
    // reply → hop1 (knight vacates) → reply → hop2 (rook slides through).
    const g = new Chess(fen);
    g.move("Kd7"); // black's reply
    expect(executorProbe(g.fen(), "a3", "b5")).toBe("Nb5");
    g.move("Nb5");
    g.move("Ke7"); // black's second reply
    expect(executorProbe(g.fen(), "a1", "a6")).toBe("Ra6");
  });

  it("queues a pawn take of a victim that ARRIVES with the reply", () => {
    // White Pe5; black knight on f7 will land on d6 with its reply. White
    // premoves exd6 while the square is still EMPTY.
    const fen = "4k3/5n2/8/4P3/8/8/8/4K3 b - - 0 1";
    const res = queuePremove([], fen, true, "e5", "d6");
    expect(res.ok).toBe(true);

    const g = new Chess(fen);
    g.move("Nd6"); // victim ARRIVES on d6
    expect(executorProbe(g.fen(), "e5", "d6")).toBe("exd6");

    const g2 = new Chess(fen);
    g2.move("Ng5"); // no victim arrives — d6 stays empty
    expect(executorProbe(g2.fen(), "e5", "d6")).toBeNull(); // queue cancels
  });

  it("queues a knight capture of an enemy piece already on the target", () => {
    // White Ne3, black pawn d5, black to move. White premoves Nxd5 with
    // the victim already sitting on the target square.
    const fen = "4k3/8/8/3p4/8/4N3/8/4K3 b - - 0 1";
    const res = queuePremove([], fen, true, "e3", "d5");
    expect(res.ok).toBe(true);
    const g = new Chess(fen);
    g.move("Kd7"); // pawn stays on d5
    expect(executorProbe(g.fen(), "e3", "d5")).toBe("Nxd5");
  });
});
