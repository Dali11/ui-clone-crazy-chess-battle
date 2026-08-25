/**
 * Draughts (Checkers) AI — minimax with alpha-beta pruning.
 * Reuses the pure draughts-engine move generator so it automatically
 * respects mandatory captures, multi-jump chains, and variant rules.
 */
import { getLegalMoves, applyMove, type Board, type Color, type DraughtsMove, type Variant } from "./draughts-engine";

export type AIDifficulty = "easy" | "medium" | "hard";

const DIFFICULTY_DEPTH: Record<AIDifficulty, number> = { easy: 1, medium: 3, hard: 5 };
const RANDOM_MOVE_CHANCE: Record<AIDifficulty, number> = { easy: 0.45, medium: 0.08, hard: 0 };

const MAN_VALUE = 100;
const KING_VALUE = 175;
const WIN_SCORE = 100000;

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function evaluateBoard(board: Board): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const isWhite = p === "w" || p === "W";
      const isKing = p === "W" || p === "B";
      let value = isKing ? KING_VALUE : MAN_VALUE;

      // Advancement bonus for men — encourages pushing toward promotion row
      if (!isKing) {
        value += (isWhite ? 7 - r : r) * 2;
      }
      // Slight bonus for central files (more mobility, harder to trap)
      if (c >= 2 && c <= 5) value += 2;
      // Back-row bonus (defends against being crowned against)
      if (!isKing && ((isWhite && r === 7) || (!isWhite && r === 0))) value += 3;

      score += isWhite ? value : -value;
    }
  }
  return score;
}

function minimax(board: Board, color: Color, depth: number, alpha: number, beta: number, variant: Variant): number {
  const moves = getLegalMoves(board, color, variant);

  if (moves.length === 0) {
    return color === "w" ? -WIN_SCORE - depth : WIN_SCORE + depth;
  }
  if (depth === 0) {
    return evaluateBoard(board);
  }

  const ordered = [...moves].sort((a, b) => b.captures.length - a.captures.length);
  const next = opposite(color);
  const maximizing = color === "w";

  if (maximizing) {
    let best = -Infinity;
    for (const move of ordered) {
      const result = applyMove(board, move, color, 0, 0, variant);
      const val = minimax(result.board, next, depth - 1, alpha, beta, variant);
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of ordered) {
      const result = applyMove(board, move, color, 0, 0, variant);
      const val = minimax(result.board, next, depth - 1, alpha, beta, variant);
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/**
 * Picks the AI's move for `color` to play on `board` at the given difficulty.
 * Returns null if there are no legal moves (game already over for this side).
 */
export function getBestDraughtsMove(
  board: Board,
  color: Color,
  difficulty: AIDifficulty = "medium",
  variant: Variant = "international"
): DraughtsMove | null {
  const moves = getLegalMoves(board, color, variant);
  if (moves.length === 0) return null;

  if (Math.random() < RANDOM_MOVE_CHANCE[difficulty]) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const depth = DIFFICULTY_DEPTH[difficulty];
  const next = opposite(color);
  const maximizing = color === "w";

  let bestMove = moves[0];
  let bestScore = maximizing ? -Infinity : Infinity;

  const ordered = [...moves].sort((a, b) => b.captures.length - a.captures.length);
  for (const move of ordered) {
    const result = applyMove(board, move, color, 0, 0, variant);
    const score = minimax(result.board, next, depth - 1, -Infinity, Infinity, variant);
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}
