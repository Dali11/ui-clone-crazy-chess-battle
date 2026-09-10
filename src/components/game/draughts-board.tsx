"use client";

import { useMemo } from "react";
import type { Board, Position, DraughtsMove } from "@/lib/game/draughts-engine";
import { getStoredBoardTheme, type BoardTheme } from "@/lib/game/board-themes";

interface DraughtsBoardProps {
  board: Board;
  boardTheme?: BoardTheme;
  perspective: "white" | "black";
  selected: Position | null;
  legalMoves: DraughtsMove[];
  mustContinueJump: Position | null;
  onSquareClick: (pos: Position) => void;
  lastMove?: { from: Position; to: Position } | null;
  interactive: boolean;
}

export default function DraughtsBoard({
  board,
  perspective,
  selected,
  legalMoves,
  mustContinueJump,
  onSquareClick,
  lastMove,
  interactive,
  boardTheme,
}: DraughtsBoardProps) {
  const theme = boardTheme || getStoredBoardTheme();

   // Build the display rows based on perspective
  const displayRows = useMemo(() => {
    const rows = board.map((row, i) => row.map((piece, j) => ({ piece, row: i, col: j })));
    if (perspective === "black") {
      return rows.slice().reverse().map(r => r.slice().reverse());
    }
    return rows;
  }, [board, perspective]);

  const targetSquares = useMemo(() => {
    const map = new Map<string, DraughtsMove>();
    for (const m of legalMoves) {
      map.set(`${m.to.row},${m.to.col}`, m);
    }
    return map;
  }, [legalMoves]);

  return (
    <div className="relative aspect-square w-full max-w-[min(92vw,552px)] max-h-full mx-auto select-none">
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden border-2 border-ccb-border shadow-lg">
        {displayRows.map((row, displayRowIdx) =>
          row.map((cell, displayColIdx) => {
            const isDark = (cell.row + cell.col) % 2 === 1;
            const isSelected = selected?.row === cell.row && selected?.col === cell.col;
            const isTarget = targetSquares.has(`${cell.row},${cell.col}`);
            const isLastMoveFrom = lastMove && lastMove.from.row === cell.row && lastMove.from.col === cell.col;
            const isLastMoveTo = lastMove && lastMove.to.row === cell.row && lastMove.to.col === cell.col;
            const isMustJump = mustContinueJump?.row === cell.row && mustContinueJump?.col === cell.col;

            return (
              <div
                key={`${displayRowIdx}-${displayColIdx}`}
                onClick={() => interactive && isDark && onSquareClick({ row: cell.row, col: cell.col })}
                className={`
                  relative flex items-center justify-center

                  ${interactive && isDark ? "cursor-pointer" : ""}
                  transition-colors
                `}
                style={{
                  backgroundColor: isDark
                    ? isSelected || isMustJump
                      ? theme.dark + "cc"
                      : isLastMoveFrom || isLastMoveTo
                      ? theme.dark + "aa"
                      : theme.dark
                    : theme.light,
                }}
              >
                {/* Target square indicator */}
                {isTarget && !cell.piece && (
                  <div className="absolute w-1/3 h-1/3 rounded-full bg-emerald-500/50 animate-pulse" />
                )}

                {/* Target square indicator (capture — show on occupied square) */}
                {isTarget && cell.piece && (
                  <div className="absolute inset-1 rounded-full border-2 border-red-500/70 animate-pulse" />
                )}

                {/* Piece */}
                {cell.piece && (
                  <div
                    className={`
                      relative w-[78%] h-[78%] rounded-full
                      flex items-center justify-center
                      shadow-md
                      ${cell.piece === "w" || cell.piece === "W"
                        ? "bg-gradient-to-br from-stone-100 to-stone-300 border-2 border-stone-400"
                        : "bg-gradient-to-br from-stone-800 to-stone-950 border-2 border-stone-700"
                      }
                      ${isSelected ? "scale-95 ring-2 ring-emerald-400" : ""}
                      ${isMustJump ? "ring-2 ring-red-500" : ""}
                    `}
                  >
                    {/* King crown indicator */}
                    {(cell.piece === "W" || cell.piece === "B") && (
                      <span
                        className={`text-lg font-bold ${
                          cell.piece === "W" ? "text-amber-600" : "text-amber-400"
                        }`}
                      >
                        ♛
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
