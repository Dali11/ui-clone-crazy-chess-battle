"use client";

import CountryFlag from "./country-flag";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DraughtsBoard from "./draughts-board";
import { getStoredBoardTheme, type BoardTheme } from "@/lib/game/board-themes";
import { DRAUGHTS_NO_SHOW_SECONDS } from "@/lib/game/draughts-timeout";
import VictoryOverlay, { type GameOutcome } from "./victory-overlay";
import GameChat from "./game-chat";
import PlayerProfilePreview from "./player-profile-preview";
import {
  stringToBoard,
  getLegalMoves,
  getMovesForPiece,
  applyMove,
  checkGameOver,
  type Board,
  type Position,
  type DraughtsMove,
  type Color,
  type Variant,
} from "@/lib/game/draughts-engine";
import {
  Flag, Timer, ArrowLeft, X, MessageCircle, Handshake,
  ChevronLeft, ChevronRight, Swords, Disc3, Clock,
} from "lucide-react";

// Map DB turn ('white'/'black') to engine Color ('w'/'b')
function dbToEngine(s: string | null): Color {
  return s === "white" ? "w" : "b";
}

const STATUS_LABELS: Record<string, string> = {
  playing: "In Progress",
  white_wins: "White Wins",
  black_wins: "Black Wins",
  draw: "Draw",
  white_resigned: "White Resigned",
  black_resigned: "Black Resigned",
  timeout: "Timeout",
  aborted: "Aborted",
};

interface DraughtsGameClientProps {
  game: any;
  myId: string;
  whiteName?: string;
  blackName?: string;
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
  whiteCountry?: string | null;
  blackCountry?: string | null;
}

export default function DraughtsGameClient({
  game: initialGame,
  myId,
  whiteName = "White",
  blackName = "Black",
  whiteAvatar,
  blackAvatar,
  whiteCountry,
  blackCountry,
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
  const [victoryDismissed, setVictoryDismissed] = useState(false);
  // League XP earned from this game (shown on the end-of-game screen).
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [activeSheet, setActiveSheet] = useState<"chat" | "menu" | null>(null);
  const [drawOffer, setDrawOffer] = useState<null | "pending" | "offer">(null); // null = no offer, "pending" = we sent, "offer" = opponent sent
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [viewPly, setViewPly] = useState(0); // for move review navigation
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(getStoredBoardTheme());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Variant rules
  const variant: Variant = (game.variant as Variant) || "international";

  const isWhite = game.white_player_id === myId;
  const isBlack = game.black_player_id === myId;
  const isSpectator = !isWhite && !isBlack;

  const myDbColor: string | null = isWhite ? "white" : isBlack ? "black" : null;
  const currentDbTurn: string = game.turn;
  const gameEnded = game.status !== "playing";
  const mustContinueJump = game.must_continue_jump as Position | null;

  const myEngineColor: Color | null = myDbColor ? dbToEngine(myDbColor) : null;
  const currentEngineTurn: Color = dbToEngine(currentDbTurn);
  const myTurn = myEngineColor === currentEngineTurn && game.status === "playing";

  const perspective = myDbColor === "black" ? "black" : "white";

  // Move history for review
  const moveHistory: any[] = useMemo(() => {
    const raw = Array.isArray(game.move_history) ? game.move_history : [];
    return raw;
  }, [game.move_history]);

  // Keep viewPly at live position when new moves arrive
  useEffect(() => {
    if (viewPly === 0 || viewPly >= moveHistory.length) {
      setViewPly(moveHistory.length);
    }
  }, [moveHistory.length]);

  const isLiveView = viewPly >= moveHistory.length;

  // Live clock calculation
  // Clock doesn't start until the first move is made — show full time before that
  const clockStarted = game.move_count > 0 || game.status !== "playing";

  const whiteClockMs = (() => {
    if (gameEnded) return game.white_clock_ms;
    if (!clockStarted) return game.white_clock_ms;
    void clockTick;
    const elapsed = Date.now() - new Date(game.last_move_at || game.created_at).getTime();
    return currentDbTurn === "white" ? Math.max(0, game.white_clock_ms - elapsed) : game.white_clock_ms;
  })();

  const blackClockMs = (() => {
    if (gameEnded) return game.black_clock_ms;
    if (!clockStarted) return game.black_clock_ms;
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

  // League XP: fetch what this game earned once it ends (3 win / 1 draw /
  // 0 loss). The server award is fire-and-forget, so retry briefly until
  // the event row lands. Losses stay 0 → nothing is shown.
  useEffect(() => {
    if (!gameEnded) return;
    let cancelled = false;
    const attempt = async () => {
      try {
        const res = await fetch(`/api/league/xp/game-earned?gameId=${game.id}&kind=draughts`);
        if (!res.ok) return false;
        const data = await res.json();
        if (cancelled) return false;
        if (typeof data.amount === "number" && data.amount > 0) {
          setXpEarned(data.amount);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };
    const run = async () => {
      if (await attempt()) return;
      await new Promise((r) => setTimeout(r, 1200));
      if (cancelled) return;
      if (await attempt()) return;
      await new Promise((r) => setTimeout(r, 2000));
      if (cancelled) return;
      await attempt();
    };
    run();
    return () => { cancelled = true; };
  }, [gameEnded, game.id]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`draughts_game:${game.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "draughts_games", filter: `id=eq.${game.id}` },
        (payload: any) => {
          setGame((prev: any) => {
            if (payload.new.move_count === prev.move_count && payload.new.status === prev.status) {
              return prev;
            }
            setBoard(stringToBoard(payload.new.board_state));
            setSelected(null);
            setLegalMoves([]);
            setError(null);
            // Update last move for highlight
            const mh = payload.new.move_history;
            if (Array.isArray(mh) && mh.length > 0) {
              const last = mh[mh.length - 1];
              if (last?.from && last?.to) {
                setLastMove({ from: last.from, to: last.to });
              }
            }
            return payload.new;
          });
        }
      )
      .subscribe();
    channelRef.current = channel;

    // Listen for draw offer broadcasts
    channel.on("broadcast", { event: "draw_offer" }, (payload: any) => {
      if (payload.payload?.from !== myId) {
        setDrawOffer("offer");
      }
    });
    channel.on("broadcast", { event: "draw_declined" }, (payload: any) => {
      if (payload.payload?.from !== myId) {
        setDrawOffer(null);
      }
    });
    channel.on("broadcast", { event: "draw_accepted" }, (payload: any) => {
      if (payload.payload?.from !== myId) {
        setDrawOffer(null);
        // Game will end via DB update
      }
    });

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/draughts/state?gameId=${game.id}`);
        if (res.ok) {
          const data = await res.json();
          setGame((prev: any) => {
            if (data.move_count !== prev.move_count || data.status !== prev.status) {
              setBoard(stringToBoard(data.board_state));
              setSelected(null);
              setLegalMoves([]);
              setError(null);
              const mh = data.move_history;
              if (Array.isArray(mh) && mh.length > 0) {
                const last = mh[mh.length - 1];
                if (last?.from && last?.to) {
                  setLastMove({ from: last.from, to: last.to });
                }
              }
              return data;
            }
            return prev;
          });
        }
      } catch {}
    }, 1500);

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  // Toggle bottom sheet
  const toggleSheet = (sheet: "chat" | "menu") => {
    setActiveSheet((prev) => (prev === sheet ? null : sheet));
  };

  // Material count — pieces on board for each side
  const materialCount = useMemo(() => {
    let white = 0, black = 0;
    for (const row of board) {
      for (const piece of row) {
        if (!piece) continue;
        if (piece === "w" || piece === "W") white++;
        if (piece === "b" || piece === "B") black++;
      }
    }
    return { white, black, advantage: white - black };
  }, [board]);

  // Handle square click
  const handleSquareClick = useCallback((pos: Position) => {
    if (!myTurn || submitting || !isLiveView) return;
    setError(null);

    if (mustContinueJump) {
      if (pos.row !== mustContinueJump.row || pos.col !== mustContinueJump.col) {
        setError("You must continue jumping with the selected piece");
        return;
      }
    }

    const piece = board[pos.row][pos.col];

    if (piece && myEngineColor) {
      const pieceColor = (piece === "w" || piece === "W") ? "w" : "b";
      if (pieceColor === myEngineColor) {
        setSelected(pos);
        const moves = getMovesForPiece(board, pos, variant);
        setLegalMoves(moves);
        return;
      }
    }

    if (selected) {
      const move = legalMoves.find(m => m.to.row === pos.row && m.to.col === pos.col);
      if (move) {
        submitMove(selected, pos, move);
        return;
      }
    }

    setSelected(null);
    setLegalMoves([]);
  }, [myTurn, submitting, isLiveView, mustContinueJump, board, myEngineColor, selected, legalMoves]);

  // Submit a move — optimistic: apply locally first, then sync with server
  const submitMove = async (from: Position, to: Position, move: DraughtsMove) => {
    setSubmitting(true);
    setError(null);

    // Optimistic update — apply the move locally for instant feedback
    const myColor: Color = myDbColor === "white" ? "w" : "b";
    const result = applyMove(board, move, myColor, game.move_count || 0, 0, variant);

    if (result.valid) {
      setBoard(result.board);
      setLastMove({ from, to });
      setSelected(null);
      setLegalMoves([]);

      // Update game state locally
      const dbTurn = result.mustContinueJump ? myDbColor : (myDbColor === "white" ? "black" : "white");
      let endStatus = "playing";
      let winner = null;
      if (result.isGameOver) {
        const check = checkGameOver(result.board, dbToEngine(dbTurn), result.halfMoveClock, variant);
        if (check.isGameOver) {
          if (check.winner === "draw") {
            endStatus = "draw";
            winner = null;
          } else {
            endStatus = check.winner === "w" ? "white_wins" : "black_wins";
            winner = check.winner === "w" ? "white" : "black";
          }
        }
      }

      setGame((prev: any) => ({
        ...prev,
        turn: dbTurn,
        move_count: (prev.move_count || 0) + 1,
        status: endStatus,
        winner,
        must_continue_jump: result.mustContinueJump ? result.mustContinueFrom : null,
        last_move_at: new Date().toISOString(),
      }));
    }

    // Send to server in background
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
        // Revert optimistic update on error — refetch actual state
        try {
          const stateRes = await fetch(`/api/draughts/state?gameId=${game.id}`);
          if (stateRes.ok) {
            const stateData = await stateRes.json();
            setGame(stateData);
            setBoard(stringToBoard(stateData.board_state));
          }
        } catch {}
      } else {
        // Sync clocks from server response (authoritative)
        setGame((prev: any) => ({
          ...prev,
          white_clock_ms: data.whiteClockMs,
          black_clock_ms: data.blackClockMs,
        }));
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

  const offerDraw = async () => {
    try {
      setDrawOffer("pending");
      await fetch("/api/draughts/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, action: "offer" }),
      });
    } catch {
      setDrawOffer(null);
    }
  };

  const acceptDraw = async () => {
    try {
      await fetch("/api/draughts/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, action: "accept" }),
      });
      setDrawOffer(null);
    } catch {}
  };

  const declineDraw = async () => {
    try {
      await fetch("/api/draughts/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, action: "decline" }),
      });
      setDrawOffer(null);
    } catch {}
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  };

  // Victory overlay outcome
  const outcome: GameOutcome = game.status === "abort" || game.status === "aborted"
    ? "abort"
    : game.winner === null || game.status === "draw"
    ? "draw"
    : game.winner === (isWhite ? "white" : "black")
    ? "win"
    : "loss";

  // Rating change
  const myRatingChange = isWhite ? game.white_rating_change : isBlack ? game.black_rating_change : null;

  // No-show countdown: mirrors the server's timeout sweep — draughts games
  // abort if moves 0-1 aren't made within DRAUGHTS_NO_SHOW_SECONDS. Surface
  // a visible countdown (like the chess board) so both players see the
  // timer instead of the game silently aborting. Turns red and pulses in
  // the final 30 seconds.
  const noShowInfo = useMemo(() => {
    if (gameEnded || game.status !== "playing") return null;
    if (game.move_count !== 0 && game.move_count !== 1) return null;
    const timerStartRaw = game.last_move_at || game.created_at;
    if (!timerStartRaw) return null;
    void clockTick; // re-run every second
    const thresholdMs = DRAUGHTS_NO_SHOW_SECONDS * 1000;
    const elapsed = Date.now() - new Date(timerStartRaw).getTime();
    const remainingMs = thresholdMs - elapsed;
    return {
      remainingSec: Math.max(0, Math.ceil(remainingMs / 1000)),
      noShowPlayer: currentDbTurn as "white" | "black",
    };
  }, [game.move_count, game.last_move_at, game.created_at, currentDbTurn, game.status, gameEnded, clockTick]);

  // Memoized board element — stable identity across the 1s clock tick so
  // React skips reconciling the 100-cell board subtree. Prevents stutter
  // on low-end phones (same fix as the chess board).
  const draughtsBoardElement = useMemo(() => (
    <DraughtsBoard
      boardTheme={boardTheme}
      board={board}
      perspective={perspective}
      selected={selected}
      legalMoves={legalMoves}
      mustContinueJump={mustContinueJump}
      onSquareClick={handleSquareClick}
      lastMove={lastMove}
      interactive={myTurn && !submitting && isLiveView}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [boardTheme, board, perspective, selected, legalMoves, mustContinueJump, handleSquareClick, lastMove, myTurn, submitting, isLiveView]);

  // Player bar renderer — chess.com style with avatar, name, rating, clock
  const renderPlayerBar = (data: {
    userId?: string;
    name: string;
    avatar?: string | null;
    country?: string | null;
    rating?: number | string | null;
    ratingChange?: number | null;
    clock: number;
    isActive: boolean;
    isMe?: boolean;
    materialAdvantage?: number;
    pieceCount?: number;
  }) => (
    <div className={`flex items-center justify-between max-w-[600px] mx-auto w-full px-3 py-2 rounded-lg transition-colors ${data.isActive ? "bg-ccb-primary/8" : ""}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 overflow-hidden transition-colors ${data.isActive ? "border-ccb-primary bg-ccb-primary/15" : "border-ccb-border bg-ccb-surface"}`}>
          {data.avatar ? (
            <img src={data.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className={`w-3 h-3 rounded-full ${(data.name === whiteName) ? "bg-stone-100" : "bg-stone-900"}`} />
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <button onClick={() => data.userId && setPreviewUserId(data.userId)} className="text-sm font-semibold leading-tight truncate hover:text-ccb-primary transition-colors cursor-pointer bg-transparent border-0 p-0 m-0 text-inherit text-left">{data.name}</button>
            {data.isMe && <span className="text-ccb-muted font-normal text-xs">(You)</span>}
          </div>
          <div className="flex items-center gap-1">
            {data.rating != null && (
              <span className="text-xs text-ccb-muted/80 font-medium">
                ({data.rating}
                {gameEnded && typeof data.ratingChange === "number" && data.ratingChange !== 0 && (
                  <span className={data.ratingChange > 0 ? "text-emerald-500 font-semibold" : "text-ccb-danger font-semibold"}>
                    {" "}{data.ratingChange > 0 ? `+${data.ratingChange}` : data.ratingChange}
                  </span>
                )}
                )
              </span>
            )}
            {/* Country flag — after the rating, sized to this small text row so it stays inline */}
            <CountryFlag code={data.country} className="w-3.5 h-[9px] shrink-0" />
          </div>
        </div>
      </div>
      {/* Piece count + Material advantage + Clock pill */}
      <div className="flex items-center gap-2 shrink-0">
        {data.pieceCount != null && (
          <span className="text-xs font-semibold tabular-nums px-2 py-1 rounded bg-ccb-surface text-ccb-text/70 border border-ccb-border">
            {data.pieceCount}
          </span>
        )}
        {(data.materialAdvantage ?? 0) !== 0 && (
          <span className={`text-xs font-bold tabular-nums px-2 py-1 rounded ${
            (data.materialAdvantage ?? 0) > 0 ? "text-emerald-500 bg-emerald-500/10" : "text-ccb-danger bg-red-500/10"
          }`}>
            {(data.materialAdvantage ?? 0) > 0 ? `+${data.materialAdvantage}` : data.materialAdvantage}
          </span>
        )}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-lg font-bold transition-all ${
          data.isActive
            ? "bg-ccb-surface text-ccb-text shadow-md ring-1 ring-ccb-primary/30"
            : "bg-ccb-surface/60 text-ccb-muted"
        }`}>
          <Clock className={`w-4 h-4 ${data.isActive ? "text-ccb-primary" : "text-ccb-muted"}`} />
          {formatTime(data.clock)}
        </div>
      </div>
    </div>
  );

  // Determine player data for top/bottom bars
  const opponentData = isWhite
    ? { name: blackName, userId: game.black_player_id, avatar: blackAvatar, country: blackCountry, rating: game.black_rating, ratingChange: game.black_rating_change, clock: blackClockMs, isActive: currentDbTurn === "black" && !gameEnded, materialAdvantage: -materialCount.advantage, pieceCount: materialCount.black }
    : { name: whiteName, userId: game.white_player_id, avatar: whiteAvatar, country: whiteCountry, rating: game.white_rating, ratingChange: game.white_rating_change, clock: whiteClockMs, isActive: currentDbTurn === "white" && !gameEnded, materialAdvantage: materialCount.advantage, pieceCount: materialCount.white };

  const myData = isWhite
    ? { name: whiteName, userId: game.white_player_id, avatar: whiteAvatar, country: whiteCountry, rating: game.white_rating, ratingChange: game.white_rating_change, clock: whiteClockMs, isActive: currentDbTurn === "white" && !gameEnded, isMe: true, materialAdvantage: materialCount.advantage, pieceCount: materialCount.white }
    : { name: blackName, userId: game.black_player_id, avatar: blackAvatar, country: blackCountry, rating: game.black_rating, ratingChange: game.black_rating_change, clock: blackClockMs, isActive: currentDbTurn === "black" && !gameEnded, isMe: true, materialAdvantage: -materialCount.advantage, pieceCount: materialCount.black };

  // For spectators: white at bottom, black at top
  const topPlayer = isSpectator
    ? { name: blackName, userId: game.black_player_id, avatar: blackAvatar, country: blackCountry, rating: game.black_rating, ratingChange: game.black_rating_change, clock: blackClockMs, isActive: currentDbTurn === "black" && !gameEnded, materialAdvantage: -materialCount.advantage, pieceCount: materialCount.black }
    : opponentData;

  const bottomPlayer = isSpectator
    ? { name: whiteName, userId: game.white_player_id, avatar: whiteAvatar, country: whiteCountry, rating: game.white_rating, ratingChange: game.white_rating_change, clock: whiteClockMs, isActive: currentDbTurn === "white" && !gameEnded, materialAdvantage: materialCount.advantage, pieceCount: materialCount.white }
    : myData;

  return (
    <>
      <div className="game-viewport -my-4 sm:-my-6 -mx-4 sm:-mx-6 flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-4">
        {/* Board column */}
        <div className="relative flex flex-col h-full w-full lg:w-[600px] lg:max-w-[600px] lg:h-auto lg:shrink-0 lg:my-auto">
          {/* Mobile top bar */}
          <div className="lg:hidden shrink-0 flex items-center justify-between px-3 pt-[max(0.875rem,env(safe-area-inset-top))] pb-2 h-auto min-h-12 border-b border-ccb-border">
            <Link href="/draughts" className="p-1.5 -ml-1.5 text-ccb-muted hover:text-ccb-primary">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-1.5">
              <Disc3 className="w-3.5 h-3.5 text-ccb-primary" />
              <span className="text-sm font-bold text-ccb-text">Crazy Draughts Battles ⚔️</span>
            </div>
            <div className="w-7" />
          </div>

          {/* Connecting indicator */}
          {!channelRef.current && (
            <div className="shrink-0 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted px-4 py-1.5 text-xs text-center max-w-[600px] mx-auto w-full mt-1">
              Connecting...
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="w-full shrink-0 max-w-[600px] mx-auto px-3 py-1.5">
              <div className="px-4 py-2 rounded-lg bg-red-500/15 text-red-400 text-sm text-center">
                {error}
              </div>
            </div>
          )}

          {/* Opponent bar (top) */}
          {renderPlayerBar(topPlayer)}

          {/* Board */}
          <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 py-1">
            {/* No-show countdown — visible while the game waits on the
                opening moves, matching the server's abort rule */}
            {noShowInfo && (
              <div
                className={`absolute top-0.5 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] shadow-md ${
                  noShowInfo.remainingSec <= 30
                    ? "bg-red-500/95 border-red-500 text-white animate-pulse"
                    : "bg-amber-500/95 border-amber-500 text-black"
                }`}
              >
                <span className="font-medium">
                  {noShowInfo.noShowPlayer === "white" ? "White" : "Black"} must move
                  {" · "}
                  {Math.floor(noShowInfo.remainingSec / 60)}:{String(noShowInfo.remainingSec % 60).padStart(2, "0")}
                </span>
              </div>
            )}
            {draughtsBoardElement}
          </div>

          {/* My bar (bottom) */}
          {renderPlayerBar(bottomPlayer)}

          {/* Draw offer banner — received from opponent */}
          {drawOffer === "offer" && !isSpectator && !gameEnded && (
            <div className="max-w-[600px] mx-auto w-full px-3 py-2">
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-ccb-primary/10 border border-ccb-primary/30">
                <span className="text-sm flex items-center gap-1.5">
                  <Handshake className="w-4 h-4 text-ccb-primary" /> Opponent offers a draw
                </span>
                <div className="flex gap-2">
                  <button onClick={acceptDraw} className="btn-primary text-sm px-4 py-1.5">Accept</button>
                  <button onClick={declineDraw} className="btn-secondary text-sm px-4 py-1.5">Decline</button>
                </div>
              </div>
            </div>
          )}

          {/* Draw offer banner — we sent it, waiting for opponent */}
          {drawOffer === "pending" && !isSpectator && !gameEnded && (
            <div className="max-w-[600px] mx-auto w-full px-3 py-2">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-ccb-muted/10 border border-ccb-border">
                <div className="w-4 h-4 border-2 border-ccb-muted border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-ccb-muted">Waiting for opponent to respond…</span>
                <button onClick={declineDraw} className="ml-auto text-sm text-ccb-muted hover:text-ccb-danger underline">Cancel</button>
              </div>
            </div>
          )}

          {/* Turn indicator */}
          {!gameEnded && (
            <div className="max-w-[600px] mx-auto w-full px-3 py-1">
              <div className={`px-4 py-1.5 rounded-lg text-sm font-medium text-center ${
                myTurn ? "bg-ccb-primary/10 text-ccb-primary" : "bg-ccb-surface text-ccb-muted"
              }`}>
                {mustContinueJump
                  ? "Continue jumping!"
                  : myTurn
                  ? "Your turn"
                  : "Opponent's turn..."}
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

          {/* Desktop resign controls */}
          {!isSpectator && !gameEnded && (
            <div className="hidden lg:flex items-center justify-center gap-3 max-w-[600px] mx-auto mt-2 shrink-0">
              {showResignConfirm ? (
                <>
                  <span className="text-sm text-ccb-muted">Resign?</span>
                  <button onClick={handleResign} className="btn bg-ccb-danger text-white px-4 py-2 text-sm">Yes, resign</button>
                  <button onClick={() => setShowResignConfirm(false)} className="btn-secondary text-sm">Cancel</button>
                </>
              ) : (
                <>
                  <button onClick={() => setShowResignConfirm(true)} className="btn-secondary text-sm">
                    <Flag className="w-4 h-4 mr-1" /> Resign
                  </button>
                  <button onClick={offerDraw} disabled={drawOffer !== null} className="btn-secondary text-sm disabled:opacity-40">
                    <Handshake className="w-4 h-4 mr-1" /> Offer Draw
                  </button>
                </>
              )}
            </div>
          )}

          {/* Mobile bottom toolbar — chess.com style */}
          <div className="lg:hidden shrink-0 border-t border-ccb-border" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}>
            {showResignConfirm ? (
              <div className="flex items-center justify-center gap-3 h-14">
                <span className="text-sm text-ccb-muted">Resign?</span>
                <button onClick={handleResign} className="btn bg-ccb-danger text-white px-4 py-1.5 text-sm">Yes</button>
                <button onClick={() => setShowResignConfirm(false)} className="btn-secondary text-sm px-4 py-1.5">Cancel</button>
              </div>
            ) : gameEnded ? (
              <div className="flex items-center justify-around h-14">
                <button
                  onClick={() => router.push("/draughts")}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-muted hover:text-ccb-primary"
                >
                  <ArrowLeft className="w-5 h-5" /><span className="text-[10px]">Lobby</span>
                </button>
                <button
                  onClick={() => toggleSheet("chat")}
                  className="relative flex flex-col items-center justify-center w-11 h-11 rounded-full bg-ccb-primary text-white shadow-md -mt-1"
                >
                  <MessageCircle className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
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
                  onClick={offerDraw}
                  disabled={isSpectator || drawOffer !== null}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-muted disabled:opacity-40"
                >
                  <Handshake className="w-5 h-5" /><span className="text-[10px]">Draw</span>
                </button>
                <button
                  onClick={() => setShowResignConfirm(true)}
                  disabled={isSpectator}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-danger disabled:opacity-40"
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
                <button
                  onClick={() => toggleSheet("chat")}
                  className={`relative flex flex-col items-center gap-0.5 flex-1 py-1 ${activeSheet === "chat" ? "text-ccb-primary" : "text-ccb-muted"}`}
                >
                  <MessageCircle className="w-5 h-5" />{unreadCount > 0 && (
                    <span className="absolute top-0.5 right-1/4 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1 leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}<span className="text-[10px]">Chat</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile bottom sheet (Chat) */}
          <div className={`lg:hidden absolute inset-x-2 bottom-16 z-20 max-h-[45%] rounded-xl border border-ccb-border bg-ccb-card shadow-2xl flex flex-col overflow-hidden ${activeSheet === "chat" ? "animate-sheet-up" : "hidden"}`}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-ccb-border shrink-0">
              <span className="text-sm font-medium">Chat</span>
              <button onClick={() => setActiveSheet(null)} className="text-ccb-muted hover:text-ccb-primary p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
              <GameChat
                gameId={game.id}
                currentUserId={myId}
                currentUserName={isWhite ? whiteName : blackName}
                opponentName={isWhite ? blackName : whiteName}
                isSpectator={isSpectator}
                isVisible={activeSheet === "chat"}
                onUnreadChange={setUnreadCount}
              />
            </div>
          </div>
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:flex flex-col w-80 h-full max-h-[calc(100dvh-4rem)] shrink-0 gap-3">
          {/* Moves panel */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar rounded-lg bg-ccb-card border border-ccb-border p-2">
            <div className="space-y-0.5">
              {moveHistory.length === 0 && <p className="text-xs text-ccb-muted text-center py-4">No moves yet</p>}
              {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => (
                <div key={i} className="flex items-center gap-1 text-sm rounded-md hover:bg-ccb-surface/50 px-1 py-0.5 transition-colors">
                  <span className="text-ccb-muted text-xs font-mono w-7 text-right shrink-0">{i + 1}.</span>
                  <button
                    onClick={() => setViewPly(i * 2 + 1)}
                    className={`font-mono flex-1 text-left rounded px-2 py-0.5 transition-colors ${viewPly === i * 2 + 1 ? "bg-ccb-primary text-white" : "text-ccb-text hover:bg-ccb-surface"}`}
                  >
                    {moveHistory[i * 2] ? `${moveHistory[i * 2].from ? `${String.fromCharCode(97 + moveHistory[i * 2].from.col)}${8 - moveHistory[i * 2].from.row}` : ""}→${moveHistory[i * 2].to ? `${String.fromCharCode(97 + moveHistory[i * 2].to.col)}${8 - moveHistory[i * 2].to.row}` : ""}` : ""}
                  </button>
                  {moveHistory[i * 2 + 1] && (
                    <button
                      onClick={() => setViewPly(i * 2 + 2)}
                      className={`font-mono flex-1 text-left rounded px-2 py-0.5 transition-colors ${viewPly === i * 2 + 2 ? "bg-ccb-primary text-white" : "text-ccb-text hover:bg-ccb-surface"}`}
                    >
                      {`${String.fromCharCode(97 + moveHistory[i * 2 + 1].from.col)}${8 - moveHistory[i * 2 + 1].from.row}→${String.fromCharCode(97 + moveHistory[i * 2 + 1].to.col)}${8 - moveHistory[i * 2 + 1].to.row}`}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-ccb-border overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-ccb-border shrink-0">
              <MessageCircle className="w-4 h-4 text-ccb-muted" />
              <span className="text-sm font-medium">Chat</span>
              {unreadCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <GameChat
              gameId={game.id}
              currentUserId={myId}
              currentUserName={isWhite ? whiteName : blackName}
              opponentName={isWhite ? blackName : whiteName}
              isSpectator={isSpectator}
              isVisible
              onUnreadChange={setUnreadCount}
            />
          </div>
        </div>
      </div>

      {/* Victory / Defeat overlay */}
      <VictoryOverlay
        visible={gameEnded && !victoryDismissed}
        outcome={outcome}
        reasonLabel={STATUS_LABELS[game.status] || game.status}
        ratingChange={myRatingChange}
        moveCount={game.move_count || 0}
        xpEarned={xpEarned}
        adPlacement="draughts_results"
        subtitle={`${game.time_control || "10+0"} · ${game.rated ? "Ranked" : "Casual"} · ${variant}`}
        playerNames={{ white: whiteName, black: blackName }}
        winnerSide={game.winner as "white" | "black" | null}
        lobbyHref="/draughts"
        onReview={() => setVictoryDismissed(true)}
        onDismiss={() => setVictoryDismissed(true)}
      />

      {previewUserId && (
        <PlayerProfilePreview userId={previewUserId} onClose={() => setPreviewUserId(null)} />
      )}
    </>
  );
}
