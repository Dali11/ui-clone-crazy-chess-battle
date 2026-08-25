"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DraughtsBoard from "./draughts-board";
import VictoryOverlay, { type GameOutcome } from "./victory-overlay";
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
import {
  Flag, Clock, ArrowLeft, Bot, Disc3, ChevronLeft, ChevronRight,
} from "lucide-react";

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
  const [moveHistory, setMoveHistory] = useState<DraughtsMove[]>([]);
  const [viewPly, setViewPly] = useState(0);
  const [halfMoveClock, setHalfMoveClock] = useState(0);
  const [status, setStatus] = useState<"playing" | "ended">("playing");
  const [winner, setWinner] = useState<Color | "draw" | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [error] = useState<string | null>(null);
  const [victoryDismissed, setVictoryDismissed] = useState(false);

  const [whiteClockMs, setWhiteClockMs] = useState(initialMinutes * 60 * 1000);
  const [blackClockMs, setBlackClockMs] = useState(initialMinutes * 60 * 1000);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef = useRef(false);

  const perspective: "white" | "black" = playerColor;
  const myTurn = turn === myColor && status === "playing";
  const isLiveView = viewPly >= moveHistory.length;

  const endGame = useCallback((w: Color | "draw", reason: string) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus("ended");
    setWinner(w);
    setEndReason(reason);
  }, []);

  // Keep viewPly at live position
  useEffect(() => {
    if (viewPly === 0 || viewPly >= moveHistory.length) {
      setViewPly(moveHistory.length);
    }
  }, [moveHistory.length]);

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
        setMoveHistory((prev) => [...prev, move]);

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
      if (!myTurn || botThinking || !isLiveView) return;

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
    [myTurn, botThinking, isLiveView, board, myColor, selected, legalMoves, applyAndAdvance]
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

  // Victory overlay outcome
  const outcome: GameOutcome =
    winner === "draw" ? "draw"
    : winner === myColor ? "win"
    : "loss";

  return (
    <>
      <div className="game-viewport -my-4 sm:-my-6 flex flex-col lg:items-center lg:justify-center">
        <div className="relative flex flex-col h-full w-full lg:w-[600px] lg:max-w-[600px] lg:h-auto lg:my-auto">
          {/* Mobile top bar */}
          <div className="lg:hidden shrink-0 flex items-center justify-between px-3 h-11 border-b border-ccb-border">
            <Link href="/draughts" className="p-1.5 -ml-1.5 text-ccb-muted hover:text-ccb-primary">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-1.5">
              <Disc3 className="w-3.5 h-3.5 text-ccb-primary" />
              <span className="text-sm font-bold text-ccb-text">Crazy Draughts Battles ⚔️</span>
            </div>
            <div className="w-7" />
          </div>

          {/* Error banner */}
          {error && (
            <div className="w-full shrink-0 max-w-[600px] mx-auto px-3 py-1.5">
              <div className="px-4 py-2 rounded-lg bg-red-500/15 text-red-400 text-sm text-center">
                {error}
              </div>
            </div>
          )}

          {/* Bot info (top) */}
          <div className={`w-full shrink-0 flex items-center justify-between max-w-[600px] mx-auto px-3 py-2 rounded-lg transition-colors ${
            turn === botColor && status === "playing" ? "bg-ccb-primary/8" : ""
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 overflow-hidden transition-colors ${
                turn === botColor && status === "playing" ? "border-ccb-primary bg-ccb-primary/15" : "border-ccb-border bg-ccb-success/15"
              }`}>
                <Bot className="w-5 h-5 text-ccb-success" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold leading-tight truncate capitalize">Bot ({difficulty})</span>
                {botThinking && <span className="text-xs text-ccb-muted animate-pulse">thinking…</span>}
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-lg font-bold transition-all shrink-0 ${
              turn === botColor && status === "playing"
                ? "bg-ccb-surface text-ccb-text shadow-md ring-1 ring-ccb-primary/30"
                : "bg-ccb-surface/60 text-ccb-muted"
            }`}>
              <Clock className={`w-4 h-4 ${turn === botColor && status === "playing" ? "text-ccb-primary" : "text-ccb-muted"}`} />
              {formatTime(botColor === "w" ? whiteClockMs : blackClockMs)}
            </div>
          </div>

          {/* Board */}
          <div className="flex-1 min-h-0 flex items-center justify-center px-2 py-1">
            <DraughtsBoard
              board={board}
              perspective={perspective}
              selected={selected}
              legalMoves={legalMoves}
              mustContinueJump={null}
              onSquareClick={handleSquareClick}
              lastMove={lastMove}
              interactive={myTurn && !botThinking && isLiveView}
            />
          </div>

          {/* My info (bottom) */}
          <div className={`w-full shrink-0 flex items-center justify-between max-w-[600px] mx-auto px-3 py-2 rounded-lg transition-colors ${
            turn === myColor && status === "playing" ? "bg-ccb-primary/8" : ""
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${
                turn === myColor && status === "playing" ? "border-ccb-primary bg-ccb-primary/15" : "border-ccb-border bg-ccb-surface"
              }`}>
                <div className={`w-3 h-3 rounded-full ${myColor === "w" ? "bg-stone-100" : "bg-stone-900"}`} />
              </div>
              <span className="text-sm font-semibold text-ccb-text">You</span>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-lg font-bold transition-all shrink-0 ${
              turn === myColor && status === "playing"
                ? "bg-ccb-surface text-ccb-text shadow-md ring-1 ring-ccb-primary/30"
                : "bg-ccb-surface/60 text-ccb-muted"
            }`}>
              <Clock className={`w-4 h-4 ${turn === myColor && status === "playing" ? "text-ccb-primary" : "text-ccb-muted"}`} />
              {formatTime(myColor === "w" ? whiteClockMs : blackClockMs)}
            </div>
          </div>

          {/* Turn indicator */}
          {status === "playing" && (
            <div className="max-w-[600px] mx-auto w-full px-3 py-1">
              <div className={`px-4 py-1.5 rounded-lg text-sm font-medium text-center ${
                myTurn ? "bg-ccb-primary/10 text-ccb-primary" : "bg-ccb-surface text-ccb-muted"
              }`}>
                {myTurn ? "Your turn" : "Bot's turn…"}
              </div>
            </div>
          )}

          {/* Live position indicator when reviewing past moves */}
          {!isLiveView && moveHistory.length > 0 && (
            <div className="max-w-[600px] mx-auto w-full px-3">
              <button
                onClick={() => setViewPly(moveHistory.length)}
                className="w-full text-center text-xs text-ccb-primary hover:underline py-1"
              >
                ← Return to live position
              </button>
            </div>
          )}

          {/* Desktop controls */}
          {status === "playing" && (
            <div className="hidden lg:flex items-center justify-center gap-3 max-w-[600px] mx-auto mt-2 shrink-0">
              {showResignConfirm ? (
                <>
                  <span className="text-sm text-ccb-muted">Resign?</span>
                  <button onClick={handleResign} className="btn bg-ccb-danger text-white px-4 py-2 text-sm">Yes, resign</button>
                  <button onClick={() => setShowResignConfirm(false)} className="btn-secondary text-sm">Cancel</button>
                </>
              ) : (
                <button onClick={() => setShowResignConfirm(true)} className="btn-secondary text-sm">
                  <Flag className="w-4 h-4 mr-1" /> Resign
                </button>
              )}
            </div>
          )}

          {/* Mobile bottom toolbar */}
          <div className="lg:hidden shrink-0 border-t border-ccb-border" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            {showResignConfirm ? (
              <div className="flex items-center justify-center gap-3 h-14">
                <span className="text-sm text-ccb-muted">Resign?</span>
                <button onClick={handleResign} className="btn bg-ccb-danger text-white px-4 py-1.5 text-sm">Yes</button>
                <button onClick={() => setShowResignConfirm(false)} className="btn-secondary text-sm px-4 py-1.5">Cancel</button>
              </div>
            ) : status === "ended" ? (
              <div className="flex items-center justify-around h-14">
                <button
                  onClick={() => router.push("/draughts")}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-muted hover:text-ccb-primary"
                >
                  <ArrowLeft className="w-5 h-5" /><span className="text-[10px]">Lobby</span>
                </button>
                <button
                  onClick={() => setViewPly(Math.max(0, viewPly - 1))}
                  disabled={viewPly <= 0}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-muted hover:text-ccb-primary disabled:opacity-30"
                >
                  <ChevronLeft className="w-5 h-5" /><span className="text-[10px]">Back</span>
                </button>
                <button
                  onClick={() => setViewPly(Math.min(moveHistory.length, viewPly + 1))}
                  disabled={viewPly >= moveHistory.length}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-muted hover:text-ccb-primary disabled:opacity-30"
                >
                  <ChevronRight className="w-5 h-5" /><span className="text-[10px]">Forward</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-around h-14">
                <button
                  onClick={() => setShowResignConfirm(true)}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-danger"
                >
                  <Flag className="w-5 h-5" /><span className="text-[10px]">Resign</span>
                </button>
                <button
                  onClick={() => setViewPly(Math.max(0, viewPly - 1))}
                  disabled={viewPly <= 0}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-muted hover:text-ccb-primary disabled:opacity-30"
                >
                  <ChevronLeft className="w-5 h-5" /><span className="text-[10px]">Back</span>
                </button>
                <button
                  onClick={() => setViewPly(Math.min(moveHistory.length, viewPly + 1))}
                  disabled={viewPly >= moveHistory.length}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-muted hover:text-ccb-primary disabled:opacity-30"
                >
                  <ChevronRight className="w-5 h-5" /><span className="text-[10px]">Forward</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Victory / Defeat overlay */}
      <VictoryOverlay
        visible={status === "ended" && !victoryDismissed}
        outcome={outcome}
        reasonLabel={endReason || (winner === "draw" ? "Draw" : winner === myColor ? "You won" : "Bot won")}
        moveCount={moveHistory.length}
        subtitle={`Bot ${difficulty} · ${initialMinutes}+${incrementSeconds} · ${variant}`}
        lobbyHref="/draughts"
        onReview={() => setVictoryDismissed(true)}
        onDismiss={() => setVictoryDismissed(true)}
      />
    </>
  );
}
