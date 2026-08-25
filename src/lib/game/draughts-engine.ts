/**
 * Draughts Engine — International Checkers rules only.
 * Pure TypeScript, zero external dependencies.
 */

// ─── Types ────────────────────────────────────────────────

export type Piece = 'w' | 'W' | 'b' | 'B';
export type Board = Array<Array<Piece | null>>;
export type Color = 'w' | 'b';

export type Variant = 'international';

export type Position = {
  row: number;
  col: number;
};

export type DraughtsMove = {
  from: Position;
  to: Position;
  path: Position[];
  captures: Position[];
  isCapture: boolean;
  promoted?: boolean;
};

export type MoveResult = {
  valid: boolean;
  board: Board;
  nextTurn: Color;
  moveCount: number;
  halfMoveClock: number;
  isGameOver: boolean;
  winner: Color | 'draw' | null;
  mustContinueJump?: boolean;
  mustContinueFrom?: Position | null;
  capturedPositions?: Position[];
  error?: string;
  notation?: string;
};

// ─── Variant Config ───────────────────────────────────────

export interface VariantConfig {
  id: Variant;
  name: string;
  description: string;
  flyingKings: boolean;       // kings move/capture any distance diagonally
  menCaptureBackward: boolean; // men can capture in all 4 diagonal directions
  mustTakeMaximum: boolean;    // must take the sequence with the most captures
  promotionEndsTurn: boolean;  // promotion during a jump ends the turn (vs continuing as king)
}

export const VARIANTS: Record<Variant, VariantConfig> = {
  international: {
    id: 'international',
    name: 'International',
    description: 'Flying kings · Men capture backward · Must take maximum',
    flyingKings: true,
    menCaptureBackward: true,
    mustTakeMaximum: true,
    promotionEndsTurn: true,
  },
};


// ─── Board Setup & Serialization ───────────────────────────

/**
 * Creates and returns the standard initial 8x8 draughts board.
 * Dark squares are where (row + col) % 2 === 1.
 * Rows 0-2: Black pieces ('b') on dark squares.
 * Rows 3-4: Empty (null).
 * Rows 5-7: White pieces ('w') on dark squares.
 */
export function initialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        if (row < 3) {
          board[row][col] = 'b';
        } else if (row > 4) {
          board[row][col] = 'w';
        }
      }
    }
  }
  return board;
}

export function boardToString(board: Board): string {
  return board
    .map(row => row.map(cell => cell ?? '.').join(''))
    .join('\n');
}

export function stringToBoard(str: string): Board {
  const lines = str.trim().split(/\r?\n/).filter(line => line.length > 0);
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));

  if (lines.length === 8) {
    for (let r = 0; r < 8; r++) {
      const line = lines[r];
      for (let c = 0; c < 8; c++) {
        const char = line[c];
        if (char === 'w' || char === 'W' || char === 'b' || char === 'B') {
          board[r][c] = char as Piece;
        }
      }
    }
  } else {
    const cleanStr = str.replace(/\s+/g, '');
    for (let i = 0; i < 64 && i < cleanStr.length; i++) {
      const r = Math.floor(i / 8);
      const c = i % 8;
      const char = cleanStr[i];
      if (char === 'w' || char === 'W' || char === 'b' || char === 'B') {
        board[r][c] = char as Piece;
      }
    }
  }
  return board;
}

// ─── Notation ──────────────────────────────────────────────

export function posToAlgebraic(pos: Position): string {
  const colChar = String.fromCharCode(97 + pos.col);
  const rank = 8 - pos.row;
  return `${colChar}${rank}`;
}

export function algebraicToPos(str: string): Position {
  if (!str || str.length < 2) return { row: 0, col: 0 };
  const col = str.charCodeAt(0) - 97;
  const rank = parseInt(str.substring(1), 10);
  const row = 8 - rank;
  return { row, col };
}

export function getMoveNotation(move: DraughtsMove): string {
  if (move.isCapture && move.path && move.path.length > 1) {
    return move.path.map(posToAlgebraic).join('x');
  }
  return `${posToAlgebraic(move.from)}-${posToAlgebraic(move.to)}`;
}

// ─── Helpers ──────────────────────────────────────────────

function getPieceColor(piece: Piece): Color {
  return piece === 'w' || piece === 'W' ? 'w' : 'b';
}

function isOpponentPiece(piece: Piece | null, myColor: Color): boolean {
  if (!piece) return false;
  return getPieceColor(piece) !== myColor;
}

function doesPromote(piece: Piece, row: number): boolean {
  if (piece === 'w' && row === 0) return true;
  if (piece === 'b' && row === 7) return true;
  return false;
}

/**
 * Gets move directions for a piece.
 * Kings always get all 4 diagonals.
 * Men get forward-only for simple moves.
 * For captures, men get all 4 directions if menCaptureBackward is true.
 */
function getMoveDirections(piece: Piece): [number, number][] {
  if (piece === 'W' || piece === 'B') {
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  }
  if (piece === 'w') {
    return [[-1, -1], [-1, 1]];
  }
  return [[1, -1], [1, 1]];
}

function getCaptureDirections(piece: Piece, config: VariantConfig): [number, number][] {
  if (piece === 'W' || piece === 'B') {
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  }
  // Men
  if (config.menCaptureBackward) {
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  }
  // Forward only
  if (piece === 'w') {
    return [[-1, -1], [-1, 1]];
  }
  return [[1, -1], [1, 1]];
}

// ─── Jump Path Finding ────────────────────────────────────

/**
 * Recursively searches for all jump paths for a piece.
 * Supports both short-range (1 square) and flying king (any distance) captures.
 */
function findJumpPathsForPiece(
  board: Board,
  startPos: Position,
  curPos: Position,
  currentPiece: Piece,
  color: Color,
  path: Position[],
  captures: Position[],
  config: VariantConfig
): DraughtsMove[] {
  const moves: DraughtsMove[] = [];
  const isKing = currentPiece === 'W' || currentPiece === 'B';
  const directions = getCaptureDirections(currentPiece, config);

  for (const [dr, dc] of directions) {
    if (isKing && config.flyingKings) {
      // Flying king: scan along diagonal until we find a piece
      let step = 1;
      let foundOpponent = false;
      let opponentPos: Position | null = null;

      while (true) {
        const scanRow = curPos.row + dr * step;
        const scanCol = curPos.col + dc * step;
        if (scanRow < 0 || scanRow > 7 || scanCol < 0 || scanCol > 7) break;

        const cell = board[scanRow][scanCol];

        if (!foundOpponent) {
          if (cell === null) {
            // Empty square — keep scanning
            step++;
            continue;
          }
          // Hit a piece
          if (isOpponentPiece(cell, color)) {
            const isAlreadyCaptured = captures.some(c => c.row === scanRow && c.col === scanCol);
            if (isAlreadyCaptured) break;
            foundOpponent = true;
            opponentPos = { row: scanRow, col: scanCol };
            step++;
            continue;
          } else {
            // Own piece — blocked
            break;
          }
        } else {
          // Found opponent — this is a potential landing square
          if (cell === null || (scanRow === startPos.row && scanCol === startPos.col && path.length > 1)) {
            // Valid landing square
            const landRow = scanRow;
            const landCol = scanCol;
            const nextCaptures = [...captures, opponentPos!];
            const nextPath = [...path, { row: landRow, col: landCol }];
            const promoted = doesPromote(currentPiece, landRow);

            if (promoted && config.promotionEndsTurn) {
              moves.push({
                from: startPos,
                to: { row: landRow, col: landCol },
                path: nextPath,
                captures: nextCaptures,
                isCapture: true,
                promoted: true,
              });
            } else {
              // Simulate and recurse
              const nextBoard = board.map(r => [...r]);
              nextBoard[curPos.row][curPos.col] = null;
              nextBoard[opponentPos!.row][opponentPos!.col] = null;
              nextBoard[landRow][landCol] = promoted ? (color === 'w' ? 'W' : 'B') : currentPiece;

              const subMoves = findJumpPathsForPiece(
                nextBoard, startPos, { row: landRow, col: landCol },
                promoted ? (color === 'w' ? 'W' : 'B') : currentPiece,
                color, nextPath, nextCaptures, config
              );

              if (subMoves.length > 0) {
                moves.push(...subMoves);
              } else {
                moves.push({
                  from: startPos,
                  to: { row: landRow, col: landCol },
                  path: nextPath,
                  captures: nextCaptures,
                  isCapture: true,
                  promoted,
                });
              }
            }
            // For flying kings, can land on ANY empty square beyond the captured piece
            step++;
            continue;
          } else {
            // Blocked — can't land here
            break;
          }
        }
      }
    } else {
      // Short-range capture (1 square jump, 2 squares landing)
      const midRow = curPos.row + dr;
      const midCol = curPos.col + dc;
      const landRow = curPos.row + 2 * dr;
      const landCol = curPos.col + 2 * dc;

      if (
        landRow >= 0 && landRow < 8 && landCol >= 0 && landCol < 8 &&
        midRow >= 0 && midRow < 8 && midCol >= 0 && midCol < 8
      ) {
        const midPiece = board[midRow][midCol];
        const landPiece = board[landRow][landCol];

        const isAlreadyCaptured = captures.some(c => c.row === midRow && c.col === midCol);
        const isLandEmpty = landPiece === null || (landRow === startPos.row && landCol === startPos.col && path.length > 1);

        if (midPiece && isOpponentPiece(midPiece, color) && !isAlreadyCaptured && isLandEmpty) {
          const nextCaptures = [...captures, { row: midRow, col: midCol }];
          const nextPath = [...path, { row: landRow, col: landCol }];
          const promoted = doesPromote(currentPiece, landRow);

          if (promoted && config.promotionEndsTurn) {
            moves.push({
              from: startPos,
              to: { row: landRow, col: landCol },
              path: nextPath,
              captures: nextCaptures,
              isCapture: true,
              promoted: true,
            });
          } else {
            const nextBoard = board.map(r => [...r]);
            nextBoard[curPos.row][curPos.col] = null;
            nextBoard[midRow][midCol] = null;
            nextBoard[landRow][landCol] = promoted ? (color === 'w' ? 'W' : 'B') : currentPiece;

            const subMoves = findJumpPathsForPiece(
              nextBoard, startPos, { row: landRow, col: landCol },
              promoted ? (color === 'w' ? 'W' : 'B') : currentPiece,
              color, nextPath, nextCaptures, config
            );

            if (subMoves.length > 0) {
              moves.push(...subMoves);
            } else {
              moves.push({
                from: startPos,
                to: { row: landRow, col: landCol },
                path: nextPath,
                captures: nextCaptures,
                isCapture: true,
                promoted,
              });
            }
          }
        }
      }
    }
  }

  return moves;
}

// ─── Simple Moves ──────────────────────────────────────────

/**
 * Returns non-capture diagonal moves for a piece.
 * Flying kings can move any distance; men move 1 square forward only.
 */
function getSimpleMovesForPiece(board: Board, pos: Position, config: VariantConfig): DraughtsMove[] {
  const piece = board[pos.row]?.[pos.col];
  if (!piece) return [];
  const moves: DraughtsMove[] = [];
  const isKing = piece === 'W' || piece === 'B';
  const directions = getMoveDirections(piece);

  for (const [dr, dc] of directions) {
    if (isKing && config.flyingKings) {
      // Flying king: slide any distance
      let step = 1;
      while (true) {
        const r = pos.row + dr * step;
        const c = pos.col + dc * step;
        if (r < 0 || r > 7 || c < 0 || c > 7) break;
        if (board[r][c] !== null) break; // blocked
        moves.push({
          from: pos,
          to: { row: r, col: c },
          path: [pos, { row: r, col: c }],
          captures: [],
          isCapture: false,
          promoted: false,
        });
        step++;
      }
    } else {
      // Short move (1 square)
      const r = pos.row + dr;
      const c = pos.col + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === null) {
        const promoted = doesPromote(piece, r);
        moves.push({
          from: pos,
          to: { row: r, col: c },
          path: [pos, { row: r, col: c }],
          captures: [],
          isCapture: false,
          promoted,
        });
      }
    }
  }

  return moves;
}

// ─── Public API ────────────────────────────────────────────

export function hasAnyCaptures(board: Board, color: Color, variant: Variant = 'international'): boolean {
  const config = VARIANTS[variant];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceColor(piece) === color) {
        const jumps = findJumpPathsForPiece(
          board, { row: r, col: c }, { row: r, col: c },
          piece, color, [{ row: r, col: c }], [], config
        );
        if (jumps.length > 0) return true;
      }
    }
  }
  return false;
}

/**
 * Returns all legal moves for color on board.
 * Captures are MANDATORY. If mustTakeMaximum, only the longest capture sequences are returned.
 */
export function getLegalMoves(board: Board, color: Color, variant: Variant = 'international'): DraughtsMove[] {
  const config = VARIANTS[variant];
  const allJumps: DraughtsMove[] = [];
  const allSimple: DraughtsMove[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceColor(piece) === color) {
        const pos = { row: r, col: c };
        const jumps = findJumpPathsForPiece(board, pos, pos, piece, color, [pos], [], config);
        if (jumps.length > 0) {
          allJumps.push(...jumps);
        } else {
          allSimple.push(...getSimpleMovesForPiece(board, pos, config));
        }
      }
    }
  }

  if (allJumps.length > 0) {
    if (config.mustTakeMaximum) {
      const maxCaptures = Math.max(...allJumps.map(m => m.captures.length));
      return allJumps.filter(m => m.captures.length === maxCaptures);
    }
    return allJumps;
  }
  return allSimple;
}

export function getMovesForPiece(board: Board, pos: Position, variant: Variant = 'international'): DraughtsMove[] {
  const piece = board[pos.row]?.[pos.col];
  if (!piece) return [];
  const color = getPieceColor(piece);
  const legalMoves = getLegalMoves(board, color, variant);

  return legalMoves.filter(
    m => m.from.row === pos.row && m.from.col === pos.col
  );
}

export function checkGameOver(
  board: Board,
  turn: Color,
  halfMoveClock: number = 0,
  variant: Variant = 'international'
): { isGameOver: boolean; winner: Color | 'draw' | null; reason?: string } {
  let whiteCount = 0;
  let blackCount = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === 'w' || p === 'W') whiteCount++;
      if (p === 'b' || p === 'B') blackCount++;
    }
  }

  if (whiteCount === 0) {
    return { isGameOver: true, winner: 'b', reason: 'White has no pieces remaining.' };
  }
  if (blackCount === 0) {
    return { isGameOver: true, winner: 'w', reason: 'Black has no pieces remaining.' };
  }

  if (halfMoveClock >= 80) {
    return { isGameOver: true, winner: 'draw', reason: 'Draw by 40 moves without capture.' };
  }

  const legalMoves = getLegalMoves(board, turn, variant);
  if (legalMoves.length === 0) {
    const winner: Color = turn === 'w' ? 'b' : 'w';
    return {
      isGameOver: true,
      winner,
      reason: `${turn === 'w' ? 'White' : 'Black'} has no legal moves.`
    };
  }

  return { isGameOver: false, winner: null };
}

export function applyMove(
  board: Board,
  move: DraughtsMove,
  turn: Color,
  moveCount: number = 0,
  halfMoveClock: number = 0,
  variant: Variant = 'international'
): MoveResult {
  const config = VARIANTS[variant];
  const piece = board[move.from.row]?.[move.from.col];
  if (!piece || getPieceColor(piece) !== turn) {
    return {
      valid: false, board, nextTurn: turn, moveCount, halfMoveClock,
      isGameOver: false, winner: null,
      error: `No ${turn === 'w' ? 'white' : 'black'} piece at position (${move.from.row}, ${move.from.col}).`
    };
  }

  const legalMoves = getLegalMoves(board, turn, variant);

  // 1. Try exact full move match
  let matchedMove = legalMoves.find(m =>
    m.from.row === move.from.row && m.from.col === move.from.col &&
    m.to.row === move.to.row && m.to.col === move.to.col
  );

  // 2. Partial step for multi-jump
  let isPartialStep = false;
  let partialStepCapture: Position | null = null;

  if (!matchedMove && move.isCapture) {
    const dr = move.to.row - move.from.row;
    const dc = move.to.col - move.from.col;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);

    // For short-range: must be exactly 2 squares
    // For flying kings: can be any distance (dr and dc must be equal magnitude)
    if (absDr === absDc && absDr >= 2) {
      const stepDr = dr / absDr;
      const stepDc = dc / absDc;

      if (config.flyingKings && (piece === 'W' || piece === 'B')) {
        // Flying king partial step: scan for the captured piece along the diagonal
        for (let s = 1; s < absDr; s++) {
          const midRow = move.from.row + stepDr * s;
          const midCol = move.from.col + stepDc * s;
          const midPiece = board[midRow]?.[midCol];
          if (midPiece && isOpponentPiece(midPiece, turn)) {
            const isAlreadyCaptured = (move.captures || []).some(c => c.row === midRow && c.col === midCol);
            if (!isAlreadyCaptured) {
              const parentMove = legalMoves.find(m =>
                m.from.row === move.from.row && m.from.col === move.from.col &&
                m.captures.some(c => c.row === midRow && c.col === midCol)
              );
              if (parentMove) {
                isPartialStep = true;
                partialStepCapture = { row: midRow, col: midCol };
                break;
              }
            }
          }
        }
      } else if (absDr === 2 && absDc === 2) {
        // Short-range partial step
        const midRow = move.from.row + dr / 2;
        const midCol = move.from.col + dc / 2;
        const midPiece = board[midRow]?.[midCol];
        if (midPiece && isOpponentPiece(midPiece, turn) && board[move.to.row]?.[move.to.col] === null) {
          const parentMove = legalMoves.find(m =>
            m.from.row === move.from.row && m.from.col === move.from.col &&
            m.captures.some(c => c.row === midRow && c.col === midCol)
          );
          if (parentMove) {
            isPartialStep = true;
            partialStepCapture = { row: midRow, col: midCol };
          }
        }
      }
    }
  }

  if (!matchedMove && !isPartialStep) {
    return {
      valid: false, board, nextTurn: turn, moveCount, halfMoveClock,
      isGameOver: false, winner: null,
      error: 'Illegal move.'
    };
  }

  // Apply move on new board
  const newBoard: Board = board.map(row => [...row]);
  newBoard[move.from.row][move.from.col] = null;

  const capturesToRemove = matchedMove ? matchedMove.captures : (partialStepCapture ? [partialStepCapture] : []);
  for (const cap of capturesToRemove) {
    newBoard[cap.row][cap.col] = null;
  }

  let finalPiece = piece;
  let promoted = false;
  if (piece === 'w' && move.to.row === 0) {
    finalPiece = 'W';
    promoted = true;
  } else if (piece === 'b' && move.to.row === 7) {
    finalPiece = 'B';
    promoted = true;
  }

  newBoard[move.to.row][move.to.col] = finalPiece;

  const newHalfMoveClock = (matchedMove?.isCapture || isPartialStep) ? 0 : halfMoveClock + 1;
  const newMoveCount = moveCount + 1;

  // Check multi-jump continuation
  let mustContinueJump = false;
  let mustContinueFrom: Position | null = null;

  if (isPartialStep && !(promoted && config.promotionEndsTurn)) {
    const furtherJumps = findJumpPathsForPiece(
      newBoard, move.to, move.to, finalPiece, turn, [move.to], [], config
    );
    if (furtherJumps.length > 0) {
      mustContinueJump = true;
      mustContinueFrom = move.to;
    }
  }

  const nextTurn: Color = mustContinueJump ? turn : (turn === 'w' ? 'b' : 'w');
  const gameOver = checkGameOver(newBoard, nextTurn, newHalfMoveClock, variant);

  const appliedMoveObject: DraughtsMove = matchedMove ?? {
    from: move.from,
    to: move.to,
    path: move.path || [move.from, move.to],
    captures: capturesToRemove,
    isCapture: capturesToRemove.length > 0,
    promoted,
  };

  return {
    valid: true,
    board: newBoard,
    nextTurn,
    moveCount: newMoveCount,
    halfMoveClock: newHalfMoveClock,
    isGameOver: gameOver.isGameOver,
    winner: gameOver.winner,
    mustContinueJump,
    mustContinueFrom,
    capturedPositions: capturesToRemove,
    notation: getMoveNotation(appliedMoveObject),
  };
}
