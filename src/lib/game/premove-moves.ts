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
 * So candidates are PATTERN-based, like chess.com/lichess:
 *   pawn  — forward 1/2 only through currently-empty squares, but BOTH
 *           diagonals always (that's the take: empty or occupied)
 *   knight— all 8 jumps that don't land on my own piece
 *   king  — all 8 neighbors that aren't my own piece
 *   slider— rays that stop at my own pieces; enemy pieces are INCLUDED
 *           (capture if they stay) and RAY-THROUGH (they may vacate)
 *
 * Every premove is re-validated against the real position at execution
 * time, so over-eager candidates can never produce an illegal move —
 * they just cancel, exactly like chess.com.
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

    const ownAt = (s: string | null): boolean => {
      if (!s) return false;
      const p = g.get(s as Square);
      return !!p && p.color === myColor;
    };

    const dests: string[] = [];
    const push = (s: string | null) => {
      if (s && !ownAt(s) && !dests.includes(s)) dests.push(s);
    };

    const fi = FILES.indexOf(square[0]);
    const ri = Number(square[1]);
    if (fi < 0 || !ri || ri < 1 || ri > 8) return [];

    if (piece.type === "p") {
      const dir = isWhite ? 1 : -1;
      const startRank = isWhite ? 2 : 7;
      // Forward moves must be empty in the current position
      const one = sq(fi, ri + dir);
      if (one && !g.get(one as Square)) {
        push(one);
        const two = sq(fi, ri + 2 * dir);
        if (ri === startRank && two && !g.get(two as Square)) push(two);
      }
      // BOTH diagonals — the premove take. Included even when the square
      // is empty (the victim may arrive with the opponent's reply); also
      // included when an enemy piece is already there.
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
      for (const [df, dr] of dirs) {
        let f = fi + df;
        let r = ri + dr;
        for (;;) {
          const s = sq(f, r);
          if (!s) break;
          const p = g.get(s as Square);
          if (!p) {
            dests.push(s); // open square — keep sliding
          } else if (p.color === myColor) {
            break; // own piece blocks, never a destination
          } else {
            dests.push(s); // capture if it stays…
            f += df; // …and keep going: it may vacate
            r += dr;
            continue;
          }
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
