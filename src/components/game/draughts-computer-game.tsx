"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import DraughtsBoard from "./draughts-board";
import {
  initialBoard,
  getMovesForPiece,
  checkGameOver,
  applyMove,
  type Board,
  type Position,
  type DraughtsMove,
  type Color,
  type Variant,
} from "@/lib/game/draughts-engine";
import { getBestDraughtsMove, type AIDifficulty } from "@/lib/game/draughts-ai";
import { Flag, Timer, Bot } from "lucide-react";

interface DraughtsComputerGameProps {
  difficulty: AIDifficulty;
  playerColor: "white" | "black";
  initialMinutes: number;
  incrementSeconds: number;
  variant: Variant;
}

function toEngine(c: "white" | "black"): Color {
  return c === "white" ? "w" : "b";
}

export default function DraughtsComputerGame({
  difficulty,
  playerColor,
  initialMinutes,
  incrementSeconds,
  variant = "international",
}: DraughtsComputerGameProps) {
  const router = useRouter();
  const myColor: Color = toEngine(playerColor);
  const botColor: Color = myColor === "w" ? "b" : "w";

  const [board, setBoard] = useState<Board>(() => initialBoard());
  const [turn, setTurn] = useState<Color>("w");
  const [selected, setSelected] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<DraughtsMove[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Position; to: Position } | null>(null);
  const [halfMoveClock, setHalfMoveClock] = useState(0);
  const [status, setStatus] = useState<"playing" | "ended">("playing");
  const [winner, setWinner] = useState<Color | "draw" | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [error] = useState<string | null>(null);

  const [whiteClockMs, setWhiteClockMs] = useState(initialMinutes * 60 * 1000);
  const [blackClockMs, setBlackClockMs] = useState(initialMinutes * 60 * 1000);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef = useRef(false);

  const perspective: "white" | "black" = playerColor;
  const myTurn = turn === myColor && status === "playing";

  const endGame = useCallback((w: Color | "draw", reason: string) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus("ended");
    setWinner(w);
    setEndReason(reason);
  }, []);

  // Clock ticking
  useEffect(() => {
    if (status !== "playing") {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
      return;
    }
    clockIntervalRef.current = setInterval(() => {
      if (turn === "w") {
        setWhiteClockMs((ms) => {
          const next = ms - 1000;
          if (next <= 0) {
            endGame("b", "White ran out of time.");
            return 0;
          }
          return next;
        });
      } else {
        setBlackClockMs((ms) => {
          const next = ms - 1000;
          if (next <= 0) {
            endGame("w", "Black ran out of time.");
            return 0;
          }
          return next;
        });
      }
    }, 1000);
    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status, endGame]);

  const applyAndAdvance = useCallback(
    (move: DraughtsMove, mover: Color) => {
      setBoard((prevBoard) => {
        const result = applyMove(prevBoard, move, mover, 0, halfMoveClock, variant);
        if (!result.valid) return prevBoard;

        setLastMove({ from: move.from, to: move.to });
        setHalfMoveClock(result.halfMoveClock);
        setTurn(result.nextTurn);

        // Increment for whoever just moved
        if (incrementSeconds > 0) {
          if (mover === "w") setWhiteClockMs((ms) => ms + incrementSeconds * 1000);
          else setBlackClockMs((ms) => ms + incrementSeconds * 1000);
        }

        if (result.isGameOver) {
          endGame(result.winner as Color | "draw", "");
        } else {
          const check = checkGameOver(result.board, result.nextTurn, result.halfMoveClock, variant);
          if (check.isGameOver) {
            endGame(check.winner as Color | "draw", check.reason || "");
          }
        }

        return result.board;
      });
      setSelected(null);
      setLegalMoves([]);
    },
    [halfMoveClock, incrementSeconds, endGame]
  );

  // Bot's turn
  useEffect(() => {
    if (status !== "playing" || turn !== botColor) return;
    setBotThinking(true);
    const timer = setTimeout(() => {
      setBoard((currentBoard) => {
        const move = getBestDraughtsMove(currentBoard, botColor, difficulty, variant);
        if (move) {
          applyAndAdvance(move, botColor);
        } else {
          endGame(myColor, `${botColor === "w" ? "White" : "Black"} (bot) has no legal moves.`);
        }
        return currentBoard;
      });
      setBotThinking(false);
    }, 500 + Math.random() * 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status, botColor, difficulty]);

  const handleSquareClick = useCallback(
    (pos: Position) => {
      if (!myTurn || botThinking) return;

      const piece = board[pos.row][pos.col];
      if (piece) {
        const pieceColor: Color = piece === "w" || piece === "W" ? "w" : "b";
        if (pieceColor === myColor) {
          setSelected(pos);
          setLegalMoves(getMovesForPiece(board, pos, variant));
          return;
        }
      }

      if (selected) {
        const move = legalMoves.find((m) => m.to.row === pos.row && m.to.col === pos.col);
        if (move) {
          applyAndAdvance(move, myColor);
          return;
        }
      }

      setSelected(null);
      setLegalMoves([]);
    },
    [myTurn, botThinking, board, myColor, selected, legalMoves, applyAndAdvance]
  );

  const handleResign = () => {
    endGame(botColor, "You resigned.");
    setShowResignConfirm(false);
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  };

  const winnerLabel =
    winner === "draw" ? "Draw" : winner === myColor ? "You win!" : winner ? "Bot wins" : "";

  return (
    <div className="game-viewport -my-4 sm:-my-6 flex flex-col lg:items-center lg:justify-center">
      <div className="relative flex flex-col w-full lg:w-[600px] lg:max-w-[600px] lg:my-auto pb-20 sm:pb-0">
      {error && (
        <div className="w-full shrink-0 px-4 py-2 rounded-lg bg-red-500/15 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Bot info (top) */}
      <div className="w-full shrink-0 flex items-center justify-between px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-ccb-success/15 flex items-center justify-center">
            <Bot className="w-4 h-4 text-ccb-success" />
          </div>
          <span className="text-sm font-medium text-ccb-text capitalize">Bot ({difficulty})</span>
          {botThinking && <span className="text-xs text-ccb-muted animate-pulse">thinking…</span>}
        </div>
        <div
          className={`flex items-center gap-1.5 text-sm font-bold tabular-nums ${
            turn === botColor && status === "playing" ? "text-ccb-primary" : "text-ccb-muted"
          }`}
        >
          <Timer className="w-4 h-4" />
          {formatTime(botColor === "w" ? whiteClockMs : blackClockMs)}
        </div>
      </div>

      <DraughtsBoard
        board={board}
        perspective={perspective}
        selected={selected}
        legalMoves={legalMoves}
        mustContinueJump={null}
        onSquareClick={handleSquareClick}
        lastMove={lastMove}
        interactive={myTurn && !botThinking}
      />

      {/* Me (bottom) */}
      <div className="w-full shrink-0 flex items-center justify-between px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${myColor === "w" ? "bg-stone-100" : "bg-stone-900"}`} />
          <span className="text-sm font-medium text-ccb-text">You</span>
        </div>
        <div
          className={`flex items-center gap-1.5 text-sm font-bold tabular-nums ${
            turn === myColor && status === "playing" ? "text-ccb-primary" : "text-ccb-muted"
          }`}
        >
          <Timer className="w-4 h-4" />
          {formatTime(myColor === "w" ? whiteClockMs : blackClockMs)}
        </div>
      </div>

      {status === "playing" && (
        <div
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            myTurn ? "bg-ccb-primary/10 text-ccb-primary" : "bg-ccb-surface text-ccb-muted"
          }`}
        >
          {myTurn ? "Your turn" : "Bot's turn…"}
        </div>
      )}

      {status === "ended" ? (
        <div className="w-full flex flex-col items-center gap-3 py-4">
          <div className="text-xl font-bold text-ccb-text">{winnerLabel}</div>
          {endReason && <div className="text-sm text-ccb-muted text-center">{endReason}</div>}
          <div className="flex gap-3">
            <button onClick={() => router.push("/draughts")} className="btn-secondary px-6">
              Back to Lobby
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          {showResignConfirm ? (
            <>
              <span className="text-sm text-ccb-muted py-2">Resign?</span>
              <button onClick={handleResign} className="btn bg-ccb-danger text-white px-4 py-2 text-sm">
                Yes, resign
              </button>
              <button onClick={() => setShowResignConfirm(false)} className="btn-secondary text-sm px-4 py-2">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setShowResignConfirm(true)} className="btn-secondary text-sm">
              <Flag className="w-4 h-4 mr-1.5" /> Resign
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
