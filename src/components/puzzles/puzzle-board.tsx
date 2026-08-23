"use client";

import { useState, useEffect, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { Check, X, RefreshCw, Lightbulb, ChevronRight, Trophy, Sparkles } from "lucide-react";
import { getStoredBoardTheme, type BoardTheme } from "@/lib/game/board-themes";
import type { ChessPuzzle } from "@/lib/puzzles/puzzle-data";

interface PuzzleBoardProps {
  puzzle: ChessPuzzle;
  onSolved: () => void;
  onFailed: () => void;
  onNext: () => void;
  hasNext: boolean;
  puzzleNumber: number;
  totalPuzzles: number;
}

type Status = "playing" | "correct" | "wrong" | "complete";

export default function PuzzleBoard({
  puzzle,
  onSolved,
  onFailed,
  onNext,
  hasNext,
  puzzleNumber,
  totalPuzzles,
}: PuzzleBoardProps) {
  const [game, setGame] = useState(() => new Chess(puzzle.fen));
  const [fen, setFen] = useState(puzzle.fen);
  const [status, setStatus] = useState<Status>("playing");
  const [moveIndex, setMoveIndex] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [boardTheme] = useState<BoardTheme>(getStoredBoardTheme());

  // Reset when puzzle changes
  useEffect(() => {
    const newGame = new Chess(puzzle.fen);
    setGame(newGame);
    setFen(puzzle.fen);
    setStatus("playing");
    setMoveIndex(0);
    setLastMove(null);
    setShowHint(false);
    setAttempts(0);
  }, [puzzle.id, puzzle.fen]);

  const playerColor = puzzle.turn === "white" ? "white" : "black";

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (status !== "playing") return false;

      const gameCopy = new Chess(game.fen());

      if (gameCopy.turn() !== (puzzle.turn === "white" ? "w" : "b")) return false;

      // Check for promotion
      const piece = gameCopy.get(sourceSquare as any);
      const isPromotion =
        piece?.type === "p" &&
        ((puzzle.turn === "white" && targetSquare[1] === "8") ||
          (puzzle.turn === "black" && targetSquare[1] === "1"));

      try {
        const move = gameCopy.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: isPromotion ? "q" : undefined,
        });

        if (!move) return false;

        const expectedMove = puzzle.solution[moveIndex];

        if (move.san === expectedMove || move.lan === expectedMove) {
          // Correct move!
          setFen(gameCopy.fen());
          setLastMove({ from: move.from, to: move.to });
          setGame(gameCopy);

          const nextIndex = moveIndex + 1;

          if (nextIndex >= puzzle.solution.length) {
            setStatus("correct");
            setTimeout(() => setStatus("complete"), 1200);
            onSolved();
            return true;
          }

          // Play opponent's response after delay
          setMoveIndex(nextIndex);
          setTimeout(() => {
            const gameWithOpp = new Chess(gameCopy.fen());
            const oppMove = puzzle.solution[nextIndex];
            try {
              const result = gameWithOpp.move(oppMove);
              if (result) {
                setFen(gameWithOpp.fen());
                setLastMove({ from: result.from, to: result.to });
                setGame(gameWithOpp);
                setMoveIndex(nextIndex + 1);
              }
            } catch {
              setMoveIndex(nextIndex + 1);
            }
          }, 600);

          return true;
        } else {
          setFen(game.fen());
          setStatus("wrong");
          setAttempts((a) => a + 1);
          onFailed();
          setTimeout(() => setStatus("playing"), 1500);
          return false;
        }
      } catch {
        return false;
      }
    },
    [game, status, puzzle, moveIndex, onSolved, onFailed]
  );

  const handleReset = () => {
    const newGame = new Chess(puzzle.fen);
    setGame(newGame);
    setFen(puzzle.fen);
    setStatus("playing");
    setMoveIndex(0);
    setLastMove(null);
    setShowHint(false);
  };

  const expectedMove = puzzle.solution[moveIndex];

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { background: "rgba(167,139,250,0.4)" };
    squareStyles[lastMove.to] = { background: "rgba(167,139,250,0.4)" };
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Status bar */}
      <div className="w-full max-w-[400px] flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ccb-muted">
            Puzzle {puzzleNumber}/{totalPuzzles}
          </span>
          <span className="text-xs font-semibold text-ccb-primary">
            {puzzle.rating}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {puzzle.themes.slice(0, 2).map((theme) => (
            <span
              key={theme}
              className="text-[10px] px-2 py-0.5 rounded-full bg-ccb-surface text-ccb-muted border border-ccb-border"
            >
              {theme}
            </span>
          ))}
        </div>
      </div>

      {/* Board */}
      <div className="relative w-full max-w-[400px]">
        <Chessboard options={{
          position: fen,
          boardOrientation: playerColor as "white" | "black",
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            return onDrop(sourceSquare, targetSquare);
          },
          allowDragging: status === "playing",
          squareStyles: squareStyles,
          showNotation: true,
          darkSquareNotationStyle: { color: boardTheme.light, fontSize: "10px", fontWeight: 600 },
          lightSquareNotationStyle: { color: boardTheme.dark, fontSize: "10px", fontWeight: 600 },
          darkSquareStyle: { backgroundColor: boardTheme.dark },
          lightSquareStyle: { backgroundColor: boardTheme.light },
          boardStyle: { borderRadius: "12px", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
        }} />

        {/* Feedback overlays */}
        {status === "correct" && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 backdrop-blur-sm rounded-xl pointer-events-none">
            <div className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-full font-bold shadow-lg">
              <Check className="w-5 h-5" />
              <span>Correct!</span>
            </div>
          </div>
        )}
        {status === "wrong" && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 backdrop-blur-sm rounded-xl pointer-events-none">
            <div className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-full font-bold shadow-lg">
              <X className="w-5 h-5" />
              <span>Try again</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="w-full max-w-[400px] flex items-center justify-between gap-2 px-2">
        <button
          onClick={() => setShowHint(true)}
          disabled={status !== "playing" || showHint}
          className="flex items-center gap-1.5 text-xs font-medium text-ccb-muted hover:text-ccb-accent disabled:opacity-40 transition-colors"
        >
          <Lightbulb className="w-4 h-4" />
          <span>Hint</span>
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs font-medium text-ccb-muted hover:text-ccb-text transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reset</span>
        </button>
        {hasNext && status === "complete" ? (
          <button
            onClick={onNext}
            className="flex items-center gap-1.5 text-xs font-bold text-ccb-primary hover:text-ccb-primary/80 transition-colors"
          >
            <span>Next Puzzle</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="text-xs text-ccb-muted">
            {status === "complete" ? "All done! 🎉" : `${puzzle.turn === "white" ? "White" : "Black"} to move`}
          </div>
        )}
      </div>

      {/* Hint */}
      {showHint && status === "playing" && (
        <div className="w-full max-w-[400px] px-3 py-2 rounded-lg bg-ccb-accent/10 border border-ccb-accent/20 text-xs text-ccb-accent text-center">
          Try: <span className="font-bold">{expectedMove}</span>
        </div>
      )}

      {/* Completion banner */}
      {status === "complete" && (
        <div className="w-full max-w-[400px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Trophy className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-emerald-400">Puzzle Solved!</span>
          {attempts === 0 && (
            <span className="text-xs text-ccb-muted flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-ccb-accent" />
              First try!
            </span>
          )}
        </div>
      )}
    </div>
  );
}
