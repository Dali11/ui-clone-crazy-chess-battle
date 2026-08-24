/**
 * English/American Draughts (Checkers) Game Engine
 * Pure TypeScript, zero external dependencies.
 */

export type Piece = 'w' | 'W' | 'b' | 'B';
export type Board = Array<Array<Piece | null>>;
export type Color = 'w' | 'b';

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

/**
 * Converts a Board to an 8-line string representation ('.' for null).
 */
export function boardToString(board: Board): string {
  return board
    .map(row => row.map(cell => cell ?? '.').join(''))
    .join('\n');
}

/**
 * Parses a string representation back into an 8x8 Board.
 * Supports multi-line format (8 rows) or single 64-char string.
 */
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

/**
 * Converts position { row, col } to algebraic notation (e.g. {row: 7, col: 0} -> 'a1').
 */
export function posToAlgebraic(pos: Position): string {
  const colChar = String.fromCharCode(97 + pos.col); // 0 -> 'a'
  const rank = 8 - pos.row;                          // 7 -> 1, 0 -> 8
  return `${colChar}${rank}`;
}

/**
 * Converts algebraic notation (e.g. 'a1') to position { row, col }.
 */
export function algebraicToPos(str: string): Position {
  if (!str || str.length < 2) return { row: 0, col: 0 };
  const col = str.charCodeAt(0) - 97;
  const rank = parseInt(str.substring(1), 10);
  const row = 8 - rank;
  return { row, col };
}

/**
 * Returns algebraic notation for a move (e.g. 'e3-d4' for simple, 'c3xe5xg7' for captures).
 */
export function getMoveNotation(move: DraughtsMove): string {
  if (move.isCapture && move.path && move.path.length > 1) {
    return move.path.map(posToAlgebraic).join('x');
  }
  return `${posToAlgebraic(move.from)}-${posToAlgebraic(move.to)}`;
}

/**
 * Helper: gets color of a piece.
 */
function getPieceColor(piece: Piece): Color {
  return piece === 'w' || piece === 'W' ? 'w' : 'b';
}

/**
 * Helper: gets allowed step directions for a piece.
 * Men move forward diagonally (white moves up towards row 0, black moves down towards row 7).
 * Kings move in all 4 diagonal directions.
 */
function getDirections(piece: Piece): [number, number][] {
  if (piece === 'W' || piece === 'B') {
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  }
  if (piece === 'w') {
    return [[-1, -1], [-1, 1]];
  }
  // 'b'
  return [[1, -1], [1, 1]];
}

/**
 * Helper: checks if a piece is an opponent piece.
 */
function isOpponentPiece(piece: Piece | null, myColor: Color): boolean {
  if (!piece) return false;
  return getPieceColor(piece) !== myColor;
}

/**
 * Helper: checks if reaching a row promotes a man to a King.
 */
function doesPromote(piece: Piece, row: number): boolean {
  if (piece === 'w' && row === 0) return true;
  if (piece === 'b' && row === 7) return true;
  return false;
}

/**
 * Recursively searches for all jump paths for a piece starting at pos.
 */
function findJumpPathsForPiece(
  board: Board,
  startPos: Position,
  curPos: Position,
  currentPiece: Piece,
  color: Color,
  path: Position[],
  captures: Position[]
): DraughtsMove[] {
  const moves: DraughtsMove[] = [];
  const directions = getDirections(currentPiece);

  for (const [dr, dc] of directions) {
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

        // Under standard rules, promoting to King during a jump ends the turn immediately.
        if (promoted) {
          moves.push({
            from: startPos,
            to: { row: landRow, col: landCol },
            path: nextPath,
            captures: nextCaptures,
            isCapture: true,
            promoted: true
          });
        } else {
          // Temporarily simulate move on board copy to recurse
          const nextBoard = board.map(r => [...r]);
          nextBoard[curPos.row][curPos.col] = null;
          nextBoard[midRow][midCol] = null;
          nextBoard[landRow][landCol] = currentPiece;

          const subMoves = findJumpPathsForPiece(
            nextBoard,
            startPos,
            { row: landRow, col: landCol },
            currentPiece,
            color,
            nextPath,
            nextCaptures
          );

          if (subMoves.length > 0) {
            moves.push(...subMoves);
          } else {
            // End of jump path
            moves.push({
              from: startPos,
              to: { row: landRow, col: landCol },
              path: nextPath,
              captures: nextCaptures,
              isCapture: true,
              promoted: false
            });
          }
        }
      }
    }
  }

  return moves;
}

/**
 * Returns simple 1-square non-capture diagonal moves for a piece at pos.
 */
function getSimpleMovesForPiece(board: Board, pos: Position): DraughtsMove[] {
  const piece = board[pos.row]?.[pos.col];
  if (!piece) return [];
  const moves: DraughtsMove[] = [];
  const directions = getDirections(piece);

  for (const [dr, dc] of directions) {
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
        promoted
      });
    }
  }

  return moves;
}

/**
 * Checks if the specified color has any available capture moves on the board.
 */
export function hasAnyCaptures(board: Board, color: Color): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceColor(piece) === color) {
        const jumps = findJumpPathsForPiece(
          board,
          { row: r, col: c },
          { row: r, col: c },
          piece,
          color,
          [{ row: r, col: c }],
          []
        );
        if (jumps.length > 0) return true;
      }
    }
  }
  return false;
}

/**
 * Returns all legal moves for color on board.
 * Captures are MANDATORY: if any captures are available, only capture moves are returned.
 */
export function getLegalMoves(board: Board, color: Color): DraughtsMove[] {
  const allJumps: DraughtsMove[] = [];
  const allSimple: DraughtsMove[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && getPieceColor(piece) === color) {
        const pos = { row: r, col: c };
        const jumps = findJumpPathsForPiece(board, pos, pos, piece, color, [pos], []);
        if (jumps.length > 0) {
          allJumps.push(...jumps);
        } else {
          allSimple.push(...getSimpleMovesForPiece(board, pos));
        }
      }
    }
  }

  if (allJumps.length > 0) {
    return allJumps;
  }
  return allSimple;
}

/**
 * Returns legal moves for the piece at pos on board.
 * Enforces mandatory capture rules across the board.
 */
export function getMovesForPiece(board: Board, pos: Position): DraughtsMove[] {
  const piece = board[pos.row]?.[pos.col];
  if (!piece) return [];
  const color = getPieceColor(piece);
  const legalMoves = getLegalMoves(board, color);

  return legalMoves.filter(
    m => m.from.row === pos.row && m.from.col === pos.col
  );
}

/**
 * Checks if the game is over and returns winner or draw status.
 * Conditions:
 * - Opponent has no pieces left -> Current color wins.
 * - Opponent has no legal moves -> Current color wins.
 * - 40 moves (80 half-moves) without capture -> Draw.
 */
export function checkGameOver(
  board: Board,
  turn: Color,
  halfMoveClock: number = 0
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

  // Draw after 40 moves without capture (80 half-moves or 40 full moves)
  if (halfMoveClock >= 80) {
    return { isGameOver: true, winner: 'draw', reason: 'Draw by 40 moves without capture.' };
  }

  const legalMoves = getLegalMoves(board, turn);
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

/**
 * Applies a move on board for turn, validating legality, removing captured pieces,
 * promoting kings, checking multi-jump continuation, switching turn, and checking game over.
 */
export function applyMove(
  board: Board,
  move: DraughtsMove,
  turn: Color,
  moveCount: number = 0,
  halfMoveClock: number = 0
): MoveResult {
  const piece = board[move.from.row]?.[move.from.col];
  if (!piece || getPieceColor(piece) !== turn) {
    return {
      valid: false,
      board,
      nextTurn: turn,
      moveCount,
      halfMoveClock,
      isGameOver: false,
      winner: null,
      error: `No ${turn === 'w' ? 'white' : 'black'} piece at position (${move.from.row}, ${move.from.col}).`
    };
  }

  const legalMoves = getLegalMoves(board, turn);

  // 1. Try finding exact full move match
  let matchedMove = legalMoves.find(m =>
    m.from.row === move.from.row &&
    m.from.col === move.from.col &&
    m.to.row === move.to.row &&
    m.to.col === move.to.col
  );

  // 2. If no direct full move match, check if this is a single jump step in a multi-jump path
  let isPartialStep = false;
  let partialStepCapture: Position | null = null;

  if (!matchedMove && move.isCapture) {
    const dr = move.to.row - move.from.row;
    const dc = move.to.col - move.from.col;
    if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
      const midRow = move.from.row + dr / 2;
      const midCol = move.from.col + dc / 2;
      const midPiece = board[midRow]?.[midCol];
      if (midPiece && isOpponentPiece(midPiece, turn) && board[move.to.row]?.[move.to.col] === null) {
        const parentMove = legalMoves.find(m =>
          m.from.row === move.from.row &&
          m.from.col === move.from.col &&
          m.captures.some(c => c.row === midRow && c.col === midCol)
        );
        if (parentMove) {
          isPartialStep = true;
          partialStepCapture = { row: midRow, col: midCol };
        }
      }
    }
  }

  if (!matchedMove && !isPartialStep) {
    return {
      valid: false,
      board,
      nextTurn: turn,
      moveCount,
      halfMoveClock,
      isGameOver: false,
      winner: null,
      error: 'Illegal move.'
    };
  }

  // Create new board copy
  const newBoard: Board = board.map(row => [...row]);

  // Remove original piece from source square
  newBoard[move.from.row][move.from.col] = null;

  // Remove captured pieces
  const capturesToRemove = matchedMove ? matchedMove.captures : (partialStepCapture ? [partialStepCapture] : []);
  for (const cap of capturesToRemove) {
    newBoard[cap.row][cap.col] = null;
  }

  // Check promotion
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

  // Check if player must continue jumping
  let mustContinueJump = false;
  let mustContinueFrom: Position | null = null;

  if (isPartialStep && !promoted) {
    const furtherJumps = findJumpPathsForPiece(
      newBoard,
      move.to,
      move.to,
      finalPiece,
      turn,
      [move.to],
      []
    );
    if (furtherJumps.length > 0) {
      mustContinueJump = true;
      mustContinueFrom = move.to;
    }
  }

  const nextTurn: Color = mustContinueJump ? turn : (turn === 'w' ? 'b' : 'w');
  const gameOver = checkGameOver(newBoard, nextTurn, newHalfMoveClock);

  const appliedMoveObject: DraughtsMove = matchedMove ?? {
    from: move.from,
    to: move.to,
    path: move.path || [move.from, move.to],
    captures: capturesToRemove,
    isCapture: capturesToRemove.length > 0,
    promoted
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
    notation: getMoveNotation(appliedMoveObject)
  };
}
