"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DraughtsBoard from "./draughts-board";
import {
  stringToBoard,
  getLegalMoves,
  getMovesForPiece,
  type Board,
  type Position,
  type DraughtsMove,
  type Color,
  type Variant,
} from "@/lib/game/draughts-engine";
import { Flag, Timer } from "lucide-react";

// Map DB turn ('white'/'black') to engine Color ('w'/'b')
function dbToEngine(s: string): Color {
  return s === "white" ? "w" : "b";
}

interface DraughtsGameClientProps {
  game: any;
  myId: string;
  whiteName?: string;
  blackName?: string;
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
}

export default function DraughtsGameClient({
  game: initialGame,
  myId,
  whiteName = "White",
  blackName = "Black",
  whiteAvatar,
  blackAvatar,
}: DraughtsGameClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [game, setGame] = useState(initialGame);
  const [board, setBoard] = useState<Board>(() => stringToBoard(initialGame.board_state));
  const [selected, setSelected] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<DraughtsMove[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Position; to: Position } | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Variant rules — default to international
  const variant: Variant = (game.variant as Variant) || "international";

  const isWhite = game.white_player_id === myId;
  const isBlack = game.black_player_id === myId;
  const isSpectator = !isWhite && !isBlack;

  // DB-format colors for display
  const myDbColor: string | null = isWhite ? "white" : isBlack ? "black" : null;
  const currentDbTurn: string = game.turn; // 'white' | 'black' from DB
  const gameEnded = game.status !== "playing";
  const mustContinueJump = game.must_continue_jump as Position | null;

  // Engine-format colors for engine calls
  const myEngineColor: Color | null = myDbColor ? dbToEngine(myDbColor) : null;
  const currentEngineTurn: Color = dbToEngine(currentDbTurn);
  const myTurn = myEngineColor === currentEngineTurn && game.status === "playing";

  // Display perspective
  const perspective = myDbColor === "black" ? "black" : "white";

  // Live clock calculation
  const whiteClockMs = (() => {
    if (gameEnded) return game.white_clock_ms;
    void clockTick;
    const elapsed = Date.now() - new Date(game.last_move_at || game.created_at).getTime();
    return currentDbTurn === "white" ? Math.max(0, game.white_clock_ms - elapsed) : game.white_clock_ms;
  })();

  const blackClockMs = (() => {
    if (gameEnded) return game.black_clock_ms;
    void clockTick;
    const elapsed = Date.now() - new Date(game.last_move_at || game.created_at).getTime();
    return currentDbTurn === "black" ? Math.max(0, game.black_clock_ms - elapsed) : game.black_clock_ms;
  })();

  // Clock tick
  useEffect(() => {
    if (gameEnded) return;
    const interval = setInterval(() => setClockTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [gameEnded]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`draughts_game:${game.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "draughts_games", filter: `id=eq.${game.id}` },
        (payload: any) => {
          setGame((prev: any) => {
            // Skip if this is our own move update we already applied locally
            if (payload.new.move_count === prev.move_count && payload.new.status === prev.status) {
              return prev;
            }
            setBoard(stringToBoard(payload.new.board_state));
            setSelected(null);
            setLegalMoves([]);
            setError(null);
            return payload.new;
          });
        }
      )
      .subscribe();
    channelRef.current = channel;

    // Polling fallback
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/draughts/state?gameId=${game.id}`);
        if (res.ok) {
          const data = await res.json();
          // Use functional update to avoid stale closure
          setGame((prev: any) => {
            if (data.move_count !== prev.move_count || data.status !== prev.status) {
              setBoard(stringToBoard(data.board_state));
              setSelected(null);
              setLegalMoves([]);
              setError(null);
              return data;
            }
            return prev;
          });
        }
      } catch {}
    }, 3000);

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  // Handle square click
  const handleSquareClick = useCallback((pos: Position) => {
    if (!myTurn || submitting) return;
    setError(null);

    // If we must continue jumping, only allow the locked piece
    if (mustContinueJump) {
      if (pos.row !== mustContinueJump.row || pos.col !== mustContinueJump.col) {
        setError("You must continue jumping with the selected piece");
        return;
      }
    }

    const piece = board[pos.row][pos.col];

    // If clicking on own piece, select it
    if (piece && myEngineColor) {
      const pieceColor = (piece === "w" || piece === "W") ? "w" : "b";
      if (pieceColor === myEngineColor) {
        setSelected(pos);
        const moves = getMovesForPiece(board, pos, variant);
        setLegalMoves(moves);
        return;
      }
    }

    // If clicking on a target square, make the move
    if (selected) {
      const move = legalMoves.find(m => m.to.row === pos.row && m.to.col === pos.col);
      if (move) {
        submitMove(selected, pos, move);
        return;
      }
    }

    // Deselect
    setSelected(null);
    setLegalMoves([]);
  }, [myTurn, submitting, mustContinueJump, board, myEngineColor, selected, legalMoves]);

  // Submit a move
  const submitMove = async (from: Position, to: Position, move: DraughtsMove) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/draughts/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: game.id,
          move: {
            from,
            to,
            path: move.path,
            captures: move.captures,
            isCapture: move.isCapture,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid move");
      } else {
        // Immediately update local state — don't wait for realtime/polling
        if (data.board) {
          setBoard(data.board);
        }
        setGame((prev: any) => ({
          ...prev,
          turn: data.turn,
          move_count: data.moveCount,
          status: data.status,
          winner: data.winner,
          must_continue_jump: data.mustContinueJump,
          white_clock_ms: data.whiteClockMs,
          black_clock_ms: data.blackClockMs,
          last_move_at: new Date().toISOString(),
        }));
        setLastMove({ from, to });
        setSelected(null);
        setLegalMoves([]);
      }
    } catch {
      setError("Move failed — check your connection");
    }
    setSubmitting(false);
  };

  // Resign
  const handleResign = async () => {
    try {
      await fetch("/api/draughts/resign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      });
      setShowResignConfirm(false);
    } catch {}
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  };

  // Determine winner label
  const winnerLabel = game.winner === "white" ? `${whiteName} wins!` : game.winner === "black" ? `${blackName} wins!` : "Draw";

  return (
    <div className="game-viewport -my-4 sm:-my-6 flex flex-col lg:items-center lg:justify-center">
      <div className="relative flex flex-col w-full lg:w-[600px] lg:max-w-[600px] lg:my-auto">
      {/* Error banner */}
      {error && (
        <div className="w-full shrink-0 px-4 py-2 rounded-lg bg-red-500/15 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Opponent info (top) */}
      <div className={`w-full shrink-0 flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
        currentDbTurn === (isWhite ? "black" : "white") && !gameEnded ? "bg-ccb-primary/8" : "bg-ccb-surface border border-ccb-border"
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 overflow-hidden transition-colors ${
            currentDbTurn === (isWhite ? "black" : "white") && !gameEnded ? "border-ccb-primary bg-ccb-primary/15" : "border-ccb-border bg-ccb-surface"
          }`}>
            {(isWhite ? blackAvatar : whiteAvatar) ? (
              <img src={(isWhite ? blackAvatar : whiteAvatar) as string} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className={`w-3 h-3 rounded-full ${perspective === "white" ? "bg-stone-900" : "bg-stone-100"}`} />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold leading-tight truncate">
              {isWhite ? blackName : whiteName}
            </span>
            <span className="text-xs text-ccb-muted">
              ({isWhite ? game.black_rating || "—" : game.white_rating || "—"})
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-bold tabular-nums shrink-0 ${
          currentDbTurn === (isWhite ? "black" : "white") && !gameEnded ? "text-ccb-primary" : "text-ccb-muted"
        }`}>
          <Timer className="w-4 h-4" />
          {formatTime(isWhite ? blackClockMs : whiteClockMs)}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 flex items-center justify-center w-full">
      <DraughtsBoard
        board={board}
        perspective={perspective}
        selected={selected}
        legalMoves={legalMoves}
        mustContinueJump={mustContinueJump}
        onSquareClick={handleSquareClick}
        lastMove={lastMove}
        interactive={myTurn && !submitting}
      />

      </div>

      {/* My info (bottom) */}
      <div className={`w-full shrink-0 flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
        currentDbTurn === myDbColor && !gameEnded ? "bg-ccb-primary/8" : "bg-ccb-surface border border-ccb-border"
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 overflow-hidden transition-colors ${
            currentDbTurn === myDbColor && !gameEnded ? "border-ccb-primary bg-ccb-primary/15" : "border-ccb-border bg-ccb-surface"
          }`}>
            {(isWhite ? whiteAvatar : blackAvatar) ? (
              <img src={(isWhite ? whiteAvatar : blackAvatar) as string} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className={`w-3 h-3 rounded-full ${perspective === "white" ? "bg-stone-100" : "bg-stone-900"}`} />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold leading-tight truncate">
              {isWhite ? whiteName : blackName} <span className="text-ccb-muted font-normal">(You)</span>
            </span>
            <span className="text-xs text-ccb-muted">
              ({isWhite ? game.white_rating || "—" : game.black_rating || "—"})
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-bold tabular-nums shrink-0 ${
          currentDbTurn === myDbColor && !gameEnded ? "text-ccb-primary" : "text-ccb-muted"
        }`}>
          <Timer className="w-4 h-4" />
          {formatTime(isWhite ? whiteClockMs : blackClockMs)}
        </div>
      </div>

      {/* Turn indicator / game over */}
      {!gameEnded && (
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
          myTurn ? "bg-ccb-primary/10 text-ccb-primary" : "bg-ccb-surface text-ccb-muted"
        }`}>
          {mustContinueJump
            ? "Continue jumping!"
            : myTurn
            ? "Your turn"
            : "Opponent's turn..."}
        </div>
      )}

      {/* Controls */}
      {gameEnded ? (
        <div className="w-full flex flex-col items-center gap-3 py-4">
          <div className="text-xl font-bold text-ccb-text">{winnerLabel}</div>
          <div className="text-sm text-ccb-muted capitalize">{game.status}</div>
          {game.white_rating_change != null && (
            <div className="text-xs text-ccb-muted">
              Rating: {isWhite ? game.white_rating_change : game.black_rating_change > 0 ? "+" : ""}
              {isWhite ? game.white_rating_change : game.black_rating_change}
            </div>
          )}
          <button
            onClick={() => router.push("/draughts")}
            className="btn-secondary px-6"
          >
            Back to Lobby
          </button>
        </div>
      ) : (
        !isSpectator && (
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
        )
      )}
      </div>
    </div>
  );
}
