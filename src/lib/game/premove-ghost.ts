import { Chess, type Square } from "chess.js";

/**
 * Faded "ghost piece" destinations for a queued premove chain.
 *
 * chess.com-style affordance: while premoves are queued (opponent's turn),
 * every premove destination square shows a faded copy of the piece that
 * will land there if the chain plays out. Players can SEE the projected
 * piece — and know they can tap it to chain its next hop (tap-chaining
 * already worked via the ghostSquares projection layer; this adds the
 * missing visual).
 *
 * Mirrors ghostSquares' chain-replay exactly (square -> real origin),
 * but tracks the PIECE KEY at each origin so the board can render it:
 *   - hops of the same piece move the ghost along the chain
 *   - broken chains (missing origin) are skipped, same tolerance as the
 *     tap layer — visual and logic never disagree
 *   - promotion premoves ghost as the pawn (the promotion piece is only
 *     chosen at execution time, so we never show a piece that might not exist)
 *
 * Pure: no React, no state — fully unit-testable.
 */
export function getPremoveGhosts(
  fen: string,
  isWhite: boolean,
  premoves: { from: string; to: string }[]
): Record<string, string> {
  const ghosts: Record<string, string> = {};
  try {
    const g = new Chess(fen);
    // square -> piece key ("wN"/"bQ"...) for every one of my pieces; these
    // are the possible chain origins.
    const map: Record<string, string> = {};
    for (const f of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      for (const r of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
        const sq = f + r;
        try {
          const pc = g.get(sq as Square);
          if (pc && ((isWhite && pc.color === "w") || (!isWhite && pc.color === "b"))) {
            map[sq] = pc.color + pc.type.toUpperCase();
          }
        } catch {
          // off-board square string — ignore
        }
      }
    }
    for (const p of premoves) {
      const pieceKey = map[p.from];
      if (!pieceKey) continue; // broken chain — later hops dangle until execution cancels
      delete map[p.from];
      map[p.to] = pieceKey;
      ghosts[p.to] = pieceKey;
    }
  } catch {
    // invalid FEN etc — keep whatever was mapped so far
  }
  return ghosts;
}
