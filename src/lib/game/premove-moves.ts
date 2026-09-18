import { Chess, type Square } from "chess.js";

/**
 * chess.com-style PREMOVE candidate squares for one of my pieces while
 * it's the opponent's turn.
 *
 * chess.js `moves()` is useless for premoves: it returns only moves legal
 * in the CURRENT position, which is exactly what a premove is not. The
 * classic casualty was the pawn take: "premove exd5" means my pawn takes
 * whatever lands on d5 — d5 is EMPTY right now, so chess.js reports no
 * diagonal move and the premove could never be queued.
 *
 * Candidates are PATTERN-based and deliberately MAXIMALLY PERMISSIVE —
 * every square the piece can geometrically reach is a candidate,
 * regardless of what stands on it right now:
 *
 *   - enemy piece on the target: capture if it stays (it may also vacate)
 *   - EMPTY target: the victim may arrive with the opponent's reply
 *   - MY OWN piece on the target: the RECAPTURE premove — queue a take
 *     onto your own piece's square, expecting the opponent to capture
 *     it first (the single most common capture premove)
 *   - MY OWN piece on the path: it may vacate earlier in a stacked
 *     premove chain (sliders ray THROUGH everything, to the board edge)
 *
 * Over-eager candidates can never produce an illegal move: every premove
 * is re-validated against the real position at execution time and simply
 * cancels when reality disagrees — exactly like chess.com.
 *
 * Tap and drag behave IDENTICALLY here (product spec): if a piece is
 * selected and the tapped square is a reachable candidate, the premove
 * queues — including onto squares holding your own pieces (the
 * recapture). Tapping an own piece on a NON-reachable square still
 * re-selects it in the click handler, so piece switching keeps working.
 */

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function sq(file: number, rank: number): string | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return FILES[file] + rank;
}

export function getPremoveDestinations(fen: string, isWhite: boolean, square: string): string[] {
  try {
    const g = new Chess(fen);
    const piece = g.get(square as Square);
    if (!piece) return [];
    const myColor = isWhite ? "w" : "b";
    if (piece.color !== myColor) return [];

    const dests: string[] = [];
    const push = (s: string | null) => {
      if (s && !dests.includes(s)) dests.push(s);
    };

    const fi = FILES.indexOf(square[0]);
    const ri = Number(square[1]);
    if (fi < 0 || !ri || ri < 1 || ri > 8) return [];

    if (piece.type === "p") {
      const dir = isWhite ? 1 : -1;
      const startRank = isWhite ? 2 : 7;
      // Forward 1/2 and BOTH diagonals, regardless of occupancy: the
      // blocker on a forward square (or a double-push intermediate) may
      // vacate with the opponent's reply; the diagonals are the take.
      push(sq(fi, ri + dir));
      if (ri === startRank) push(sq(fi, ri + 2 * dir));
      push(sq(fi - 1, ri + dir));
      push(sq(fi + 1, ri + dir));
    } else if (piece.type === "n") {
      for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
        push(sq(fi + df, ri + dr));
      }
    } else if (piece.type === "k") {
      for (const [df, dr] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
        push(sq(fi + df, ri + dr));
      }
    } else {
      const dirs =
        piece.type === "b"
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : piece.type === "r"
            ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
            : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
      // Full geometric ray to the board edge. Pieces on the ray do NOT
      // stop it: an enemy piece may vacate (capture if it stays), and my
      // own piece may vacate earlier in a stacked chain — or die, opening
      // the recapture line.
      for (const [df, dr] of dirs) {
        let f = fi + df;
        let r = ri + dr;
        for (;;) {
          const s = sq(f, r);
          if (!s) break;
          dests.push(s);
          f += df;
          r += dr;
        }
      }
    }
    return dests;
  } catch {
    return [];
  }
}

