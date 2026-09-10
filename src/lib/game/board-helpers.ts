import type { CSSProperties } from "react";
import { Chess } from "chess.js";

const PIECE_SYMBOLS: Record<string, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛",
};

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

export function getCapturedPieces(fen: string): { white: string[]; black: string[]; advantage: number } {
  const startCounts: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const game = new Chess(fen);
  const board = game.board();
  const whiteCounts: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const blackCounts: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };

  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      if (piece.color === "w") whiteCounts[piece.type]++;
      else blackCounts[piece.type]++;
    }
  }

  const whiteCaptured: string[] = [];
  const blackCaptured: string[] = [];

  for (const type of ["q", "r", "b", "n", "p"]) {
    const missingBlack = startCounts[type] - blackCounts[type];
    for (let i = 0; i < missingBlack; i++) whiteCaptured.push(PIECE_SYMBOLS["b" + type]);
    const missingWhite = startCounts[type] - whiteCounts[type];
    for (let i = 0; i < missingWhite; i++) blackCaptured.push(PIECE_SYMBOLS["w" + type]);
  }

  let whiteMaterial = 0, blackMaterial = 0;
  for (const [type, count] of Object.entries(whiteCounts)) {
    whiteMaterial += (PIECE_VALUES[type] || 0) * count;
  }
  for (const [type, count] of Object.entries(blackCounts)) {
    blackMaterial += (PIECE_VALUES[type] || 0) * count;
  }

  return {
    white: whiteCaptured,
    black: blackCaptured,
    advantage: whiteMaterial - blackMaterial,
  };
}

export function getLastMoveSquares(history: { from: string; to: string }[] | string[]): { from: string; to: string } | null {
  if (Array.isArray(history) && history.length === 0) return null;
  if (typeof history[0] === "string") {
    try {
      const game = new Chess();
      for (const m of history as string[]) game.move(m);
      const verbose = game.history({ verbose: true });
      const last = verbose[verbose.length - 1];
      return last ? { from: last.from, to: last.to } : null;
    } catch { return null; }
  }
  const arr = history as { from: string; to: string }[];
  const last = arr[arr.length - 1];
  return last || null;
}

export function getCheckSquare(fen: string): string | null {
  try {
    const game = new Chess(fen);
    if (!game.inCheck()) return null;
    const turn = game.turn();
    const board = game.board();
    // chess.js board() returns rows top-to-bottom (row 0 = rank 8, row 7 = rank 1),
    // so read the piece's own .square property rather than deriving it from the
    // row index — deriving it manually inverted ranks and highlighted the wrong king.
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type === "k" && piece.color === turn) {
          return piece.square;
        }
      }
    }
  } catch {}
  return null;
}

interface SquareStyleInputs {
  lastMove?: { from: string; to: string } | null;
  checkSquare?: string | null;
  legalMoveSquares?: string[];
  selectedSquare?: string | null;
  premove?: { from: string; to: string } | null;
}

/**
 * Builds chessboard square highlight styles, chess.com-style: flat, subtle
 * square-tint overlays for last-move/selected/premove (no large radial
 * blobs), and small centered dots for legal-move hints so pieces stay
 * clearly visible underneath.
 */
export function buildSquareStyles({
  lastMove,
  checkSquare,
  legalMoveSquares = [],
  selectedSquare,
  premove,
}: SquareStyleInputs): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {};

  // Last move — flat, low-opacity square tint (no circle)
  if (lastMove) {
    styles[lastMove.from] = { backgroundColor: "rgba(139,92,246,0.22)" };
    styles[lastMove.to] = { backgroundColor: "rgba(139,92,246,0.22)" };
  }

  // King in check — subtle red tint, small inner glow
  if (checkSquare) {
    styles[checkSquare] = {
      backgroundColor: "rgba(239,68,68,0.35)",
      boxShadow: "inset 0 0 8px rgba(239,68,68,0.4)",
    };
  }

  // Legal move hints — small centered dot, doesn't obscure the square
  for (const sq of legalMoveSquares) {
    styles[sq] = {
      backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.28) 15%, transparent 16%)",
      backgroundSize: "100% 100%",
    };
  }

  // Selected square — flat tint, slightly stronger than last-move
  if (selectedSquare) {
    styles[selectedSquare] = {
      ...styles[selectedSquare],
      backgroundColor: "rgba(139,92,246,0.32)",
    };
  }

  // Premove — thin amber border, no fill blob
  if (premove) {
    styles[premove.from] = {
      ...styles[premove.from],
      boxShadow: "inset 0 0 0 2px rgba(251,191,36,0.7)",
    };
    styles[premove.to] = {
      ...styles[premove.to],
      boxShadow: "inset 0 0 0 2px rgba(251,191,36,0.6)",
    };
  }

  return styles;
}

/**
 * Chessboard square styling that is immune to sub-pixel rounding seams.
 *
 * react-chessboard lays out 64 independent square <div>s in a CSS grid
 * (8 equal '1fr' columns, each square sized via aspect-ratio). Even when
 * the board's CSS-pixel size is an exact multiple of 8, a device's
 * devicePixelRatio (2.625x, 3x, 3.5x — common on Android/Samsung phones)
 * can still map that CSS pixel to a non-integer number of physical
 * pixels. Each of the 64 boxes then gets its edges anti-aliased/rounded
 * independently, and the page's dark background bleeds through as thin
 * lines at rank boundaries — the "distracting black lines between rows"
 * reported on real devices even after the board size was snapped to a
 * multiple of 8.
 *
 * The fix: stop coloring squares individually. Paint the entire
 * checkerboard as ONE continuous conic-gradient on the board container,
 * and make every square transparent. A CSS gradient is computed
 * per-output-pixel by the compositor as a single paint operation — there
 * is no per-square box to round independently, so there is no seam,
 * regardless of devicePixelRatio. (An 8x8 checkerboard is symmetric
 * under 180° rotation, so this works unchanged for both board
 * orientations.)
 */
export function getSeamlessBoardStyles(
  darkColor: string,
  lightColor: string,
  boardSizePx: number
): {
  boardStyle: CSSProperties;
  darkSquareStyle: CSSProperties;
  lightSquareStyle: CSSProperties;
} {
  const squareSize = boardSizePx / 8;
  const tile = squareSize * 2;
  return {
    boardStyle: {
      backgroundImage: `conic-gradient(from 0deg, ${darkColor} 0turn 0.25turn, ${lightColor} 0.25turn 0.5turn, ${darkColor} 0.5turn 0.75turn, ${lightColor} 0.75turn 1turn)`,
      backgroundSize: `${tile}px ${tile}px`,
    },
    darkSquareStyle: { backgroundColor: "transparent" },
    lightSquareStyle: { backgroundColor: "transparent" },
  };
}
