"use client";
import { getAbortSeconds } from "@/lib/game/abort-config";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useRealtimeGame, type GameState } from "@/hooks/use-realtime-game";
import { Clock, Flag, Eye, ArrowLeft, Volume2, VolumeX, Palette, X, MessageCircle, MoreVertical, Handshake, ChevronLeft, ChevronRight, Timer, Swords } from "lucide-react";
import Link from "next/link";
import { getCapturedPieces, getCheckSquare } from "@/lib/game/board-helpers";
import { playSound, detectMoveSound, setSoundEnabled } from "@/lib/game/sound";
import { getStoredBoardTheme, type BoardTheme } from "@/lib/game/board-themes";
import { useBoardSize } from "@/hooks/use-board-size";
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll";
import MoveScroller from "./move-scroller";
import CapturedPieces from "./captured-pieces";
import VictoryOverlay, { type GameOutcome, type RematchState } from "./victory-overlay";
import PromotionDialog from "./promotion-dialog";
import BoardThemePicker from "./board-theme-picker";
import OpeningBadge from "./opening-badge";
import GameChat from "./game-chat";

interface BattleInfo {
  isBattle: boolean;
  stakeCents: number;
  winnerPayoutCents: number;
  winnerId: string | null;
}

interface GameClientProps {
  gameId: string;
  initialGame: GameState;
  currentUserId: string;
  isSpectator?: boolean;
  whiteName?: string;
  blackName?: string;
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
  battleInfo?: BattleInfo | null;
}

const STATUS_LABELS: Record<string, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  draw: "Draw",
  resign: "Resignation",
  timeout: "Time out",
  abort: "Game Aborted — first move not made",
};

type SheetType = "chat" | "theme" | "menu" | null;

function formatClock(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  return `0:${seconds.toString().padStart(2, "0")}`;
}

export default function GameClient({ gameId, initialGame, currentUserId, isSpectator = false, whiteName = "White", blackName = "Black", whiteAvatar, blackAvatar, battleInfo }: GameClientProps) {
  const { game, connected, drawOffer, makeMove, resign, checkTimeout, offerDraw, acceptDraw, declineDraw } = useRealtimeGame(gameId, initialGame, currentUserId);
  const router = useRouter();
  const [fen, setFen] = useState(game.fen);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [viewPly, setViewPly] = useState(0);
  const [victoryDismissed, setVictoryDismissed] = useState(false);
  const [rematchState, setRematchState] = useState<RematchState>({ status: "idle" });
  const [incomingRematch, setIncomingRematch] = useState<{ offerId: string; fromGameId: string } | null>(null);
  // If the player dismissed the overlay to review the board but an incoming rematch offer
  // arrives, bring the overlay back so they can see Accept/Decline.
  useEffect(() => {
    if (incomingRematch) setVictoryDismissed(false);
  }, [incomingRematch]);
  const rematchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const incomingRematchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [reviewFen, setReviewFen] = useState<string | null>(null);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(getStoredBoardTheme());
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [premovePromotion, setPremovePromotion] = useState<{ from: string; to: string } | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<string[]>([]);
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [clockTick, setClockTick] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [desktopTab, setDesktopTab] = useState<"moves" | "chat">("moves");
  const chatVisibleMobile = activeSheet === "chat";
  const chatVisibleDesktop = desktopTab === "chat";
  const lastFenRef = useRef(game.fen);
  const soundPlayedForEnd = useRef(false);
  const prevFenRef = useRef(game.fen);
  const { containerRef: boardContainerRef, size: boardSize } = useBoardSize(600, 220);

  useLockBodyScroll();

  useEffect(() => {
    if (drawOffer === "offer") {
      // opponentDrawOffer handled in UI
    }
  }, [drawOffer]);

  const isWhite = game.white_player_id === currentUserId;
  const isBlack = game.black_player_id === currentUserId;
  const myTurn = (isWhite && game.turn === "white") || (isBlack && game.turn === "black");
  const gameEnded = game.status !== "playing";

  const isLiveView = moveHistory.length === 0 || viewPly >= moveHistory.length;
  const displayFen = reviewFen ?? fen;

  // ── First-move abort countdown ──────────────────────────────────────────
  // When no moves have been made, show a countdown until the game is auto-aborted.
  // The abort threshold depends on the game mode (bullet=10s, blitz=15s, rapid=20s, classical=30s).
  const isFirstMovePending = game.move_count === 0 && game.status === "playing";
  const abortSeconds = getAbortSeconds(game.time_control);
  const abortRemainingMs = (() => {
    if (!isFirstMovePending) return 0;
    void clockTick; // recompute every tick
    const createdAt = game.created_at || game.last_move_at || new Date(0).toISOString();
    const elapsed = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, abortSeconds * 1000 - elapsed);
  })();
  const abortRemainingSec = Math.ceil(abortRemainingMs / 1000);

  useEffect(() => {
    if (gameEnded) return;
    const interval = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [gameEnded]);

  useEffect(() => {
    if (gameEnded || isSpectator) return;
    const interval = setInterval(() => {
      checkTimeout();
    }, 4000);
    return () => clearInterval(interval);
  }, [gameEnded, isSpectator, checkTimeout]);

  const myRatingChange = isWhite ? game.white_rating_change : game.black_rating_change;

  // Calculate earnings for victory overlay
  const didIWin = game.winner === (isWhite ? "white" : "black");
  const isBattleGame = battleInfo?.isBattle === true;
  const moneyEarned = isBattleGame && didIWin ? (battleInfo?.winnerPayoutCents ?? 0) / 100 : undefined;
  // For battles, berries are not awarded (they have their own reward system)
  // For non-battle games, berries are awarded as before
  const berriesEarned = !isBattleGame && didIWin ? (game.rated ? 10 : 15) : 0;

  const captured = useMemo(() => getCapturedPieces(displayFen), [displayFen]);
  const checkSquare = useMemo(() => getCheckSquare(displayFen), [displayFen]);

  useEffect(() => {
    if (prevFenRef.current !== game.fen && !pendingPromotion) {
      try {
        const tempGame = new Chess(prevFenRef.current);
        const nextGame = new Chess(game.fen);
        const history = nextGame.history({ verbose: true });
        const last = history[history.length - 1];
        if (last) {
          const soundType = detectMoveSound(last);
          playSound(soundType);
          if (nextGame.inCheck() && !nextGame.isCheckmate()) {
            setTimeout(() => playSound("check"), 100);
          }
        }
      } catch {}
    }
    prevFenRef.current = game.fen;
  }, [game.fen, pendingPromotion]);

  useEffect(() => {
    if (gameEnded && !soundPlayedForEnd.current) {
      soundPlayedForEnd.current = true;
      playSound("gameEnd");
    }
  }, [gameEnded]);

  useEffect(() => {
    setFen(game.fen);
    lastFenRef.current = game.fen;
    try {
      if (game.pgn) {
        const pgnGame = new Chess();
        pgnGame.loadPgn(game.pgn);
        const moves = pgnGame.history();
        setMoveHistory(moves);
        setViewPly(moves.length);
        const verbose = pgnGame.history({ verbose: true });
        const last = verbose[verbose.length - 1];
        setLastMove(last ? { from: last.from, to: last.to } : null);
      } else {
        setMoveHistory([]);
        setViewPly(0);
        setLastMove(null);
      }
    } catch {
      setMoveHistory([]);
      setViewPly(0);
      setLastMove(null);
    }
  }, [game.fen, game.pgn]);

  // Show past position when reviewing moves (same pattern as computer game)
  useEffect(() => {
    if (viewPly === 0 || moveHistory.length === 0) {
      setReviewFen(null);
      return;
    }
    if (viewPly >= moveHistory.length) {
      setReviewFen(null);
      return;
    }
    try {
      const tempGame = new Chess();
      for (let i = 0; i < viewPly; i++) {
        tempGame.move(moveHistory[i]);
      }
      setReviewFen(tempGame.fen());
      const verbose = tempGame.history({ verbose: true });
      const last = verbose[verbose.length - 1];
      setLastMove(last ? { from: last.from, to: last.to } : null);
    } catch {
      setReviewFen(null);
    }
  }, [viewPly, moveHistory]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { background: "radial-gradient(circle, rgba(139,92,246,0.35) 70%, transparent 72%)" };
      styles[lastMove.to] = { background: "radial-gradient(circle, rgba(139,92,246,0.35) 70%, transparent 72%)" };
    }
    if (checkSquare && isLiveView) {
      styles[checkSquare] = {
        background: "radial-gradient(circle, rgba(239,68,68,0.6) 60%, transparent 62%)",
        boxShadow: "inset 0 0 12px rgba(239,68,68,0.5)",
      };
    }
    for (const sq of legalMoveSquares) {
      styles[sq] = {
        background: "radial-gradient(circle, rgba(139,92,246,0.25) 22%, transparent 24%)",
      };
    }
    if (selectedSquare) {
      styles[selectedSquare] = {
        ...styles[selectedSquare],
        background: "radial-gradient(circle, rgba(139,92,246,0.4) 70%, transparent 72%)",
      };
    }
    const activePremove = premove || premovePromotion;
    if (activePremove) {
      styles[activePremove.from] = {
        ...styles[activePremove.from],
        background: "radial-gradient(circle, rgba(251,191,36,0.4) 70%, transparent 72%)",
        boxShadow: "inset 0 0 0 3px rgba(251,191,36,0.6)",
      };
      styles[activePremove.to] = {
        ...styles[activePremove.to],
        background: "radial-gradient(circle, rgba(251,191,36,0.35) 70%, transparent 72%)",
        boxShadow: "inset 0 0 0 3px rgba(251,191,36,0.5)",
      };
    }
    return styles;
  }, [lastMove, checkSquare, legalMoveSquares, selectedSquare, premove, premovePromotion, isLiveView]);

  const getLiveClock = (player: "white" | "black") => {
    if (!game.last_move_at || !game.white_clock_ms || !game.black_clock_ms) return "—";
    if (gameEnded || game.turn !== player) {
      return formatClock(player === "white" ? game.white_clock_ms : game.black_clock_ms);
    }
    const elapsed = Date.now() - new Date(game.last_move_at).getTime();
    void clockTick;
    const baseMs = player === "white" ? game.white_clock_ms : game.black_clock_ms;
    return formatClock(Math.max(0, baseMs - elapsed));
  };

  const isPromotionMove = useCallback((from: string, to: string): boolean => {
    const game2 = new Chess(fen);
    const piece = game2.get(from as any);
    if (!piece || piece.type !== "p") return false;
    const rank = to[1];
    return (piece.color === "w" && rank === "8") || (piece.color === "b" && rank === "1");
  }, [fen]);

  const handlePieceClick = useCallback(({ square, piece }: { square: string | null; piece: { pieceType: string } | null }) => {
    if (isSpectator || gameEnded || !isLiveView) return;

    // Cancel premove by clicking anywhere (chess.com behavior)
    if (premove && !square) {
      setPremove(null);
      setPremovePromotion(null);
      return;
    }

    if (!piece || !square) {
      // Clicked empty board — cancel premove if set
      if (premove) {
        setPremove(null);
        setPremovePromotion(null);
      }
      return;
    }

    // If we have a piece selected and click on a legal move target (capture), make the move
    if (selectedSquare && square !== selectedSquare && legalMoveSquares.includes(square)) {
      if (isPromotionMove(selectedSquare, square)) {
        setPendingPromotion({ from: selectedSquare, to: square });
      } else {
        try {
          const tempGame = new Chess(fen);
          const move = tempGame.move({ from: selectedSquare, to: square, promotion: "q" });
          if (move !== null) {
            setFen(tempGame.fen());
            setMoveHistory((prev) => [...prev, move.san]);
            setViewPly((prev) => prev + 1);
            setLastMove({ from: selectedSquare, to: square });
            playSound(detectMoveSound(move));
            if (tempGame.inCheck() && !tempGame.isCheckmate()) {
              setTimeout(() => playSound("check"), 100);
            }
            makeMove(selectedSquare, square);
          }
        } catch {}
      }
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return;
    }

    // Premove via tap-to-move (when it's not our turn)
    if (!myTurn) {
      const game = new Chess(fen);
      const squarePiece = game.get(square as any);
      if (!squarePiece) return;
      const isMyPiece = (isWhite && squarePiece.color === "w") || (isBlack && squarePiece.color === "b");
      if (!isMyPiece) {
        // Clicked opponent piece — cancel any existing premove
        if (premove) {
          setPremove(null);
          setPremovePromotion(null);
        }
        return;
      }
      // If we already have a premove set, and we click one of our pieces, start setting a new premove
      // If we click the same piece that's part of premove, cancel the premove
      if (premove && premove.from === square) {
        setPremove(null);
        setPremovePromotion(null);
        return;
      }
      // Select piece for premove (tap-to-move)
      setSelectedSquare(square);
      const moves = game.moves({ square: square as any, verbose: true });
      setLegalMoveSquares(moves.map((m: any) => m.to));
      return;
    }

    // Not a legal move target — select the piece if it's ours
    if (!myTurn) return;
    const game = new Chess(fen);
    const squarePiece = game.get(square as any);
    if (!squarePiece) return;
    const isMyPiece = (isWhite && squarePiece.color === "w") || (isBlack && squarePiece.color === "b");
    if (!isMyPiece) {
      // Clicked opponent piece without it being a legal capture — clear selection
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return;
    }
    // Toggle: if clicking the same piece, deselect; otherwise select new piece
    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return;
    }
    setSelectedSquare(square);
    const moves = game.moves({ square: square as any, verbose: true });
    setLegalMoveSquares(moves.map((m: any) => m.to));
  }, [isSpectator, myTurn, gameEnded, fen, isWhite, isBlack, isLiveView, selectedSquare, legalMoveSquares, isPromotionMove, makeMove, premove]);

  const handleSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (selectedSquare && square !== selectedSquare) {
      if (legalMoveSquares.includes(square)) {
        // If it's our turn, make the move; if not, set as premove
        if (myTurn) {
          if (isPromotionMove(selectedSquare, square)) {
            setPendingPromotion({ from: selectedSquare, to: square });
          } else {
            try {
              const tempGame = new Chess(fen);
              const move = tempGame.move({ from: selectedSquare, to: square, promotion: "q" });
              if (move !== null) {
                setFen(tempGame.fen());
                setMoveHistory((prev) => [...prev, move.san]);
                setViewPly((prev) => prev + 1);
                setLastMove({ from: selectedSquare, to: square });
                playSound(detectMoveSound(move));
                if (tempGame.inCheck() && !tempGame.isCheckmate()) {
                  setTimeout(() => playSound("check"), 100);
                }
                makeMove(selectedSquare, square);
              }
            } catch {}
          }
        } else {
          // Set premove via tap-to-move
          if (isPromotionMove(selectedSquare, square)) {
            setPremovePromotion({ from: selectedSquare, to: square });
          } else {
            setPremove({ from: selectedSquare, to: square });
          }
        }
      }
      setSelectedSquare(null);
      setLegalMoveSquares([]);
    } else {
      handlePieceClick({ square, piece });
    }
  }, [selectedSquare, legalMoveSquares, isPromotionMove, fen, makeMove, handlePieceClick, myTurn]);

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (isSpectator || gameEnded) return false;
      if (!isLiveView) return false;
      if (myTurn) {
        if (isPromotionMove(sourceSquare, targetSquare)) {
          setPendingPromotion({ from: sourceSquare, to: targetSquare });
          return false;
        }
        try {
          const tempGame = new Chess(fen);
          const move = tempGame.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
          if (move === null) return false;
          setFen(tempGame.fen());
          setMoveHistory((prev) => [...prev, move.san]);
          setViewPly((prev) => prev + 1);
          setLastMove({ from: sourceSquare, to: targetSquare });
          playSound(detectMoveSound(move));
          if (tempGame.inCheck() && !tempGame.isCheckmate()) {
            setTimeout(() => playSound("check"), 100);
          }
        } catch {
          return false;
        }
        makeMove(sourceSquare, targetSquare);
        return true;
      }
      if (!targetSquare) return false;
      // Cancel existing premove if dragging the same piece back to its origin
      if (premove && premove.from === sourceSquare && premove.to === targetSquare) {
        setPremove(null);
        setPremovePromotion(null);
        return false;
      }
      const game = new Chess(fen);
      const piece = game.get(sourceSquare as any);
      if (!piece) return false;
      const isMyPiece = (isWhite && piece.color === "w") || (isBlack && piece.color === "b");
      if (!isMyPiece) return false;
      if (isPromotionMove(sourceSquare, targetSquare)) {
        setPremovePromotion({ from: sourceSquare, to: targetSquare });
      } else {
        setPremove({ from: sourceSquare, to: targetSquare });
      }
      return true;
    },
    [isSpectator, myTurn, gameEnded, fen, makeMove, isPromotionMove, isWhite, isBlack, isLiveView, premove]
  );

  const handlePromotionSelect = useCallback((piece: "q" | "r" | "b" | "n") => {
    if (pendingPromotion) {
      try {
        const tempGame = new Chess(fen);
        const move = tempGame.move({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
        if (move) {
          setFen(tempGame.fen());
          setMoveHistory((prev) => [...prev, move.san]);
          setViewPly((prev) => prev + 1);
          setLastMove({ from: pendingPromotion.from, to: pendingPromotion.to });
          playSound(detectMoveSound(move));
        }
      } catch {}
      makeMove(pendingPromotion.from, pendingPromotion.to);
    }
    setPendingPromotion(null);
  }, [pendingPromotion, fen, makeMove]);

  const handleResign = async () => {
    await resign();
    setShowResignConfirm(false);
  };

  const toggleSound = () => {
    const newVal = !soundOn;
    setSoundOn(newVal);
    setSoundEnabled(newVal);
  };

  // Auto-execute premove when it becomes our turn
  useEffect(() => {
    if (myTurn && premove && !gameEnded) {
      try {
        const game = new Chess(fen);
        const move = game.move({ from: premove.from, to: premove.to, promotion: "q" });
        if (move !== null) {
          setFen(game.fen());
          setMoveHistory((prev) => [...prev, move.san]);
          setViewPly((prev) => prev + 1);
          setLastMove({ from: premove.from, to: premove.to });
          playSound(detectMoveSound(move));
          if (game.inCheck() && !game.isCheckmate()) {
            setTimeout(() => playSound("check"), 100);
          }
          makeMove(premove.from, premove.to);
        }
      } catch {}
      setPremove(null);
    }
    if (myTurn && premovePromotion && !gameEnded) {
      // Premove was a promotion — show the promotion dialog now that it's our turn
      setPendingPromotion({ from: premovePromotion.from, to: premovePromotion.to });
      setPremovePromotion(null);
    }
  }, [myTurn, premove, premovePromotion, fen, gameEnded, isPromotionMove, makeMove]);

  useEffect(() => {
    playSound("gameStart");
  }, []);

  const toggleSheet = (sheet: SheetType) => setActiveSheet((prev) => (prev === sheet ? null : sheet));

  // ============ REMATCH FLOW ============
  // Reverse-map initial_minutes + increment to extended time control ID
  const tcIdFromGame = (() => {
    const m = game.initial_minutes;
    const i = game.increment_seconds;
    if (m === 1 && i === 0) return "bullet";
    if (m === 3 && i === 2) return "blitz3";
    if (m === 5 && i === 0) return "blitz";
    if (m === 10 && i === 0) return "rapid";
    if (m === 15 && i === 10) return "rapid15";
    if (m === 30 && i === 0) return "classical";
    return "blitz"; // fallback
  })();

  const handlePlayAgain = async () => {
    try {
      const res = await fetch("/api/matchmaking/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: tcIdFromGame, rated: game.rated }),
      });
      const data = await res.json();
      if (data.status === "matched" && data.gameId) {
        router.push(`/game/${data.gameId}`);
      } else {
        // No immediate match — go to play page with auto-search params
        router.push(`/play?tc=${tcIdFromGame}&rated=${game.rated ? "1" : "0"}&search=1`);
      }
    } catch {
      router.push(`/play?tc=${tcIdFromGame}&rated=${game.rated ? "1" : "0"}&search=1`);
    }
  };

  const handleRematch = async () => {
    if (rematchState.status === "sending" || rematchState.status === "waiting") return;
    setRematchState({ status: "sending" });
    try {
      const res = await fetch("/api/game/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.offerId) {
          setRematchState({ status: "waiting", offerId: data.offerId });
          // Poll for offer status
          rematchPollRef.current = setInterval(async () => {
            try {
              const pollRes = await fetch(`/api/game/rematch?offerId=${data.offerId}`);
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData.status === "accepted" && pollData.new_game_id) {
                  if (rematchPollRef.current) clearInterval(rematchPollRef.current);
                  setRematchState({ status: "accepted", offerId: data.offerId, gameId: pollData.new_game_id });
                  setTimeout(() => { window.location.href = `/game/${pollData.new_game_id}`; }, 1500);
                } else if (pollData.status === "declined") {
                  if (rematchPollRef.current) clearInterval(rematchPollRef.current);
                  setRematchState({ status: "declined", offerId: data.offerId });
                } else if (pollData.status === "cancelled" || pollData.status === "expired") {
                  if (rematchPollRef.current) clearInterval(rematchPollRef.current);
                  setRematchState({ status: pollData.status === "expired" ? "expired" : "cancelled", offerId: data.offerId });
                }
              }
            } catch {}
          }, 2000);
        }
      } else {
        setRematchState({ status: "idle" });
      }
    } catch {
      setRematchState({ status: "idle" });
    }
  };

  const handleCancelRematch = async () => {
    if (!rematchState.offerId) return;
    try {
      await fetch("/api/game/rematch/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: rematchState.offerId }),
      });
    } catch {}
    if (rematchPollRef.current) clearInterval(rematchPollRef.current);
    setRematchState({ status: "cancelled" });
  };

  // Cleanup polling on unmount — also cancel/expire any pending rematch offers
  // so they don't linger for the other player.
  useEffect(() => {
    return () => {
      if (rematchPollRef.current) clearInterval(rematchPollRef.current);
      if (incomingRematchRef.current) clearInterval(incomingRematchRef.current);

      // Cancel any rematch offer WE sent (requester leaving)
      if (rematchState.status === "waiting" && rematchState.offerId) {
        fetch("/api/game/rematch/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offerId: rematchState.offerId }),
        }).catch(() => {});
      }

      // Decline any incoming rematch offer (opponent leaving)
      if (incomingRematch) {
        fetch("/api/game/rematch/decline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offerId: incomingRematch.offerId }),
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for incoming rematch offers when game ends (and we haven't sent one ourselves)
  useEffect(() => {
    if (!gameEnded || isSpectator || rematchState.status === "waiting" || rematchState.status === "sending") {
      if (incomingRematchRef.current) {
        clearInterval(incomingRematchRef.current);
        incomingRematchRef.current = null;
      }
      return;
    }

    const checkIncoming = async () => {
      try {
        const res = await fetch(`/api/game/rematch/incoming?gameId=${game.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.offer && data.offer.status === "pending") {
            setIncomingRematch({ offerId: data.offer.id, fromGameId: data.offer.from_game_id });
          } else if (data.offer && data.offer.status !== "pending") {
            // Offer was resolved (accepted/declined/expired)
            setIncomingRematch(null);
            if (incomingRematchRef.current) {
              clearInterval(incomingRematchRef.current);
              incomingRematchRef.current = null;
            }
            // If accepted by us elsewhere, redirect
            if (data.offer.status === "accepted" && data.offer.new_game_id) {
              window.location.href = `/game/${data.offer.new_game_id}`;
            }
          }
        }
      } catch {}
    };

    checkIncoming();
    incomingRematchRef.current = setInterval(checkIncoming, 3000);
    return () => {
      if (incomingRematchRef.current) clearInterval(incomingRematchRef.current);
      incomingRematchRef.current = null;
    };
  }, [gameEnded, isSpectator, game.id, rematchState.status]);

  // Handle accepting an incoming rematch
  const handleAcceptIncomingRematch = async () => {
    if (!incomingRematch) return;
    try {
      const res = await fetch("/api/game/rematch/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: incomingRematch.offerId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.gameId) {
          if (incomingRematchRef.current) clearInterval(incomingRematchRef.current);
          setIncomingRematch(null);
          window.location.href = `/game/${data.gameId}`;
        }
      }
    } catch {}
  };

  // Handle declining an incoming rematch
  const handleDeclineIncomingRematch = async () => {
    if (!incomingRematch) return;
    try {
      await fetch("/api/game/rematch/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: incomingRematch.offerId }),
      });
    } catch {}
    if (incomingRematchRef.current) clearInterval(incomingRematchRef.current);
    setIncomingRematch(null);
  };

  const renderPlayerBar = (data: { name: string; avatar?: string | null; rating?: number | string | null; ratingChange?: number | null; captured: string[]; advantage: number; clock: string; isActive: boolean; symbol: string }) => (
    <div className={`flex items-center justify-between max-w-[600px] mx-auto w-full px-2 py-2 rounded-lg transition-colors ${data.isActive ? "bg-ccb-primary/8" : ""}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Avatar circle — chess.com style */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${data.isActive ? "border-ccb-primary bg-ccb-primary/15" : "border-ccb-border bg-ccb-surface"}`}>
          {data.avatar ? (
            <img src={data.avatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-lg">{data.symbol}</span>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold leading-tight truncate">{data.name}</span>
            {data.rating != null && (
              <span className="text-sm text-ccb-muted/80 shrink-0 flex items-center gap-0.5 font-medium">
                ({data.rating}
                {gameEnded && typeof data.ratingChange === "number" && data.ratingChange !== 0 && (
                  <span className={data.ratingChange > 0 ? "text-emerald-500 font-semibold" : "text-ccb-danger font-semibold"}>
                    {data.ratingChange > 0 ? `+${data.ratingChange}` : data.ratingChange}
                  </span>
                )}
                )
              </span>
            )}
          </div>
          <CapturedPieces pieces={data.captured} advantage={data.advantage} perspective="top" />
        </div>
      </div>
      {/* Clock pill — chess.com style */}
      <div className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-mono text-xl font-bold transition-all shrink-0 ${
        data.isActive
          ? "bg-ccb-surface text-ccb-text shadow-md ring-1 ring-ccb-primary/30"
          : "bg-ccb-surface/60 text-ccb-muted"
      }`}>
        <Clock className={`w-4 h-4 ${data.isActive ? "text-ccb-primary" : "text-ccb-muted"}`} />
        {data.clock}
      </div>
    </div>
  );

  // ============ SHARED BOARD COLUMN ============
  const boardColumn = (topPlayer: any, bottomPlayer: any, showControls: boolean) => (
    <div className="relative flex flex-col h-full w-full lg:w-[600px] lg:max-w-[600px] lg:h-auto lg:shrink-0 lg:my-auto">
      {/* Mobile top bar */}
      <div className="lg:hidden shrink-0 flex items-center justify-between px-3 h-11 border-b border-ccb-border">
        <Link href="/play" className="p-1.5 -ml-1.5 text-ccb-muted hover:text-ccb-primary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          {isSpectator && <Eye className="w-3.5 h-3.5 text-ccb-muted" />}
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-ccb-surface text-ccb-muted">{game.time_control}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${game.rated ? "bg-ccb-primary/15 text-ccb-primary" : "bg-ccb-surface text-ccb-muted"}`}>{game.rated ? "Ranked" : "Casual"}</span>
        </div>
        <button onClick={() => toggleSheet("menu")} className="p-1.5 -mr-1.5 text-ccb-muted hover:text-ccb-primary">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {!connected && (
        <div className="shrink-0 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted px-4 py-1.5 text-xs text-center max-w-[600px] mx-auto w-full mt-1">
          Connecting...
        </div>
      )}

      {/* Horizontal move scroller — chess.com style, at the very top above the opponent bar */}
      <div className="max-w-[600px] mx-auto w-full px-2 py-1">
        {moveHistory.length >= 2 && (
          <div className="mb-1">
            <OpeningBadge moves={moveHistory} />
          </div>
        )}
        <div className="rounded-lg bg-ccb-surface/50 border border-ccb-border/50 px-2 py-1.5">
          <MoveScroller moves={moveHistory} currentPly={viewPly} onPlyChange={setViewPly} />
        </div>
      </div>

      {/* Opponent bar */}
      {renderPlayerBar(topPlayer)}

      {/* Board */}
      <div ref={boardContainerRef} className="flex-1 min-h-0 flex items-center justify-center px-2 py-1">
        <div style={{ width: boardSize, height: boardSize }}>
          <Chessboard options={{
            position: displayFen,
            boardOrientation: isWhite || isSpectator ? "white" : "black",
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              if (!targetSquare) return false;
              return onDrop(sourceSquare, targetSquare);
            },
            allowDragging: !gameEnded && !isSpectator && isLiveView,
            squareStyles: squareStyles,
            showAnimations: false,
            animationDurationInMs: 0,
            showNotation: true,
            darkSquareNotationStyle: { color: boardTheme.light, fontSize: "10px", fontWeight: 600 },
            lightSquareNotationStyle: { color: boardTheme.dark, fontSize: "10px", fontWeight: 600 },
            onPieceClick: handlePieceClick,
            onSquareClick: handleSquareClick,
            darkSquareStyle: { backgroundColor: boardTheme.dark },
            lightSquareStyle: { backgroundColor: boardTheme.light },
            boardStyle: { borderRadius: "6px", overflow: "hidden" },
          }} />
        </div>
      </div>

      {/* Your bar */}
      {renderPlayerBar(bottomPlayer)}

      {/* Draw offer banner — received from opponent */}
      {drawOffer === "offer" && !isSpectator && !gameEnded && (
        <div className="max-w-[600px] mx-auto w-full px-2 py-2">
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
        <div className="max-w-[600px] mx-auto w-full px-2 py-2">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-ccb-muted/10 border border-ccb-border">
            <div className="w-4 h-4 border-2 border-ccb-muted border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-ccb-muted">Waiting for opponent to respond…</span>
            <button onClick={declineDraw} className="ml-auto text-sm text-ccb-muted hover:text-ccb-danger underline">Cancel</button>
          </div>
        </div>
      )}

      {/* Live position indicator when reviewing past moves */}
      {!isLiveView && moveHistory.length > 0 && (
        <div className="max-w-[600px] mx-auto w-full px-2">
          <button
            onClick={() => { setReviewFen(null); setViewPly(moveHistory.length); }}
            className="w-full text-center text-xs text-ccb-primary hover:underline py-1"
          >
            ← Return to live position
          </button>
        </div>
      )}

      {/* Desktop resign/draw controls */}
      {showControls && !gameEnded && (
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

      {/* Mobile bottom toolbar — chess.com style: live play shows Chat/Draw/Resign,
          finished games switch to Options/Chat/Back/Forward for reviewing moves */}
      <div className="lg:hidden shrink-0 border-t border-ccb-border" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {showResignConfirm ? (
          <div className="flex items-center justify-center gap-3 h-14">
            <span className="text-sm text-ccb-muted">Resign?</span>
            <button onClick={handleResign} className="btn bg-ccb-danger text-white px-4 py-1.5 text-sm">Yes</button>
            <button onClick={() => setShowResignConfirm(false)} className="btn-secondary text-sm px-4 py-1.5">Cancel</button>
          </div>
        ) : gameEnded ? (
          <div className="flex items-center justify-around h-14">
            <button
              onClick={() => toggleSheet("menu")}
              className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-muted hover:text-ccb-primary"
            >
              <MoreVertical className="w-5 h-5" /><span className="text-[10px]">Options</span>
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

      {/* Mobile bottom sheet (Chat + Theme) — GameChat stays mounted (just hidden)
          so its realtime channel subscribes as soon as the game loads, not only
          once the sheet is opened. Otherwise messages sent before both players
          have opened chat at least once are silently lost (broadcast has no
          persistence/history). */}
      <div className={`lg:hidden absolute inset-x-2 bottom-16 z-20 max-h-[45%] rounded-xl border border-ccb-border bg-ccb-card shadow-2xl flex flex-col overflow-hidden ${activeSheet && activeSheet !== "menu" ? "animate-sheet-up" : "hidden"}`}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-ccb-border shrink-0">
          <span className="text-sm font-medium">
            {activeSheet === "chat" ? "Chat" : "Board Theme"}
          </span>
          <button onClick={() => setActiveSheet(null)} className="text-ccb-muted hover:text-ccb-primary p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
          <div className={`h-full ${activeSheet === "chat" ? "" : "hidden"}`}>
            <GameChat gameId={gameId} currentUserId={currentUserId} currentUserName={isWhite ? whiteName : blackName} opponentName={isWhite ? blackName : whiteName} isSpectator={isSpectator} isVisible={chatVisibleMobile} onUnreadChange={setUnreadCount} />
          </div>
          {activeSheet === "theme" && <BoardThemePicker inline onThemeChange={setBoardTheme} />}
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {activeSheet === "menu" && (
        <div className="lg:hidden fixed inset-0 z-30" onClick={() => setActiveSheet(null)}>
          <div className="absolute top-12 right-3 card p-2 min-w-[180px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={toggleSound} className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-ccb-surface transition-colors text-sm">
              <span>Sound</span>
              {soundOn ? <Volume2 className="w-4 h-4 text-ccb-primary" /> : <VolumeX className="w-4 h-4 text-ccb-muted" />}
            </button>
            <button onClick={() => { setActiveSheet("theme"); }} className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-ccb-surface transition-colors text-sm">
              <span>Board Theme</span>
              <Palette className="w-4 h-4 text-ccb-muted" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ============ CHESS.COM-STYLE SIDEBAR (Desktop) ============
  const renderDesktopSidebar = () => (
    <div className="hidden lg:flex lg:flex-col lg:w-[320px] lg:shrink-0 lg:h-full lg:py-2 gap-3">
      <div className="flex flex-col gap-3 h-full overflow-hidden">
        {/* Header bar */}
        <div className="card flex items-center justify-between shrink-0 !p-3">
          <Link href="/play" className="text-sm text-ccb-muted hover:text-ccb-primary flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-2">
            {isSpectator && <span className="flex items-center gap-1 text-xs text-ccb-muted"><Eye className="w-3.5 h-3.5" />Spectating</span>}
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-ccb-surface text-ccb-muted">{game.time_control}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${game.rated ? "bg-ccb-primary/15 text-ccb-primary" : "bg-ccb-surface text-ccb-muted"}`}>{game.rated ? "Ranked" : "Casual"}</span>
          </div>
        </div>

        {/* Sound + theme controls */}
        <div className="flex items-center gap-2 shrink-0 px-1">
          <button onClick={toggleSound} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-sm text-ccb-muted hover:text-ccb-text transition-colors">
            {soundOn ? <Volume2 className="w-4 h-4 text-ccb-primary" /> : <VolumeX className="w-4 h-4" />}
            <span>Sound</span>
          </button>
          <BoardThemePicker onThemeChange={setBoardTheme} />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 shrink-0 px-1">
          <button onClick={() => setDesktopTab("moves")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${desktopTab === "moves" ? "bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/20" : "text-ccb-muted hover:text-ccb-text border border-transparent"}`}>Moves</button>
          <button onClick={() => setDesktopTab("chat")} className={`relative flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${desktopTab === "chat" ? "bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/20" : "text-ccb-muted hover:text-ccb-text border border-transparent"}`}>Chat{unreadCount > 0 && (<span className="absolute top-1 right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1 leading-none">{unreadCount > 9 ? "9+" : unreadCount}</span>)}</button>
        </div>

        {/* Tab content — both panels stay mounted (CSS-hidden when inactive) so
            GameChat's realtime channel subscribes immediately on load rather
            than only once the Chat tab is first clicked. */}
        <div className={desktopTab === "moves" ? "contents" : "hidden"}>
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar rounded-lg bg-ccb-card border border-ccb-border p-2">
            <div className="space-y-0.5">
              {moveHistory.length === 0 && <p className="text-xs text-ccb-muted text-center py-4">No moves yet</p>}
              {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => (
                <div key={i} className="flex items-center gap-1 text-sm rounded-md hover:bg-ccb-surface/50 px-1 py-0.5 transition-colors">
                  <span className="text-ccb-muted text-xs font-mono w-7 text-right shrink-0">{i + 1}.</span>
                  <button onClick={() => setViewPly(i * 2 + 1)} className={`font-mono flex-1 text-left rounded px-2 py-0.5 transition-colors ${viewPly === i * 2 + 1 ? "bg-ccb-primary text-white" : "text-ccb-text hover:bg-ccb-surface"}`}>{moveHistory[i * 2] || ""}</button>
                  {moveHistory[i * 2 + 1] && (
                    <button onClick={() => setViewPly(i * 2 + 2)} className={`font-mono flex-1 text-left rounded px-2 py-0.5 transition-colors ${viewPly === i * 2 + 2 ? "bg-ccb-primary text-white" : "text-ccb-text hover:bg-ccb-surface"}`}>{moveHistory[i * 2 + 1]}</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="text-center text-xs text-ccb-muted shrink-0 py-1">
            Move {game.move_count} · {game.time_control}
          </div>
        </div>
        <div className={`flex-1 min-h-0 flex flex-col rounded-lg border border-ccb-border overflow-hidden ${desktopTab === "chat" ? "" : "hidden"}`}>
          <GameChat gameId={gameId} currentUserId={currentUserId} currentUserName={isWhite ? whiteName : blackName} opponentName={isWhite ? blackName : whiteName} isSpectator={isSpectator} isVisible={chatVisibleDesktop} onUnreadChange={setUnreadCount} />
        </div>
      </div>
    </div>
  );

  // ============ SPECTATOR VIEW ============
  if (isSpectator) {
    const topPlayer = { name: blackName, avatar: blackAvatar, rating: game.black_rating, ratingChange: game.black_rating_change, captured: captured.black, advantage: -captured.advantage, clock: getLiveClock("black"), isActive: game.turn === "black" && !gameEnded, symbol: "♚" };
    const bottomPlayer = { name: whiteName, avatar: whiteAvatar, rating: game.white_rating, ratingChange: game.white_rating_change, captured: captured.white, advantage: captured.advantage, clock: getLiveClock("white"), isActive: game.turn === "white" && !gameEnded, symbol: "♔" };

    return (
      <>
        <div className="game-viewport -my-4 sm:-my-6 flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-4">
          {boardColumn(topPlayer, bottomPlayer, false)}
          {renderDesktopSidebar()}
        </div>

        <PromotionDialog visible={!!pendingPromotion} color={isWhite ? "white" : "black"} onSelect={handlePromotionSelect} onCancel={() => setPendingPromotion(null)} />
        <VictoryOverlay
          visible={gameEnded && !victoryDismissed}
          outcome={(game.status === "abort" ? "abort" : game.winner === null ? "draw" : game.winner === (isWhite ? "white" : "black") ? "win" : "loss") as GameOutcome}
          reasonLabel={STATUS_LABELS[game.status] || game.status}
          ratingChange={myRatingChange}
          berriesAwarded={berriesEarned}
          moneyEarned={moneyEarned}
          moneyLabel={isBattleGame ? "Battle winnings" : undefined}
          moveCount={game.move_count}
          subtitle={`${game.time_control} · ${game.rated ? "Ranked" : "Casual"}${isBattleGame ? " · Staked" : ""}`}
          playerNames={{ white: whiteName, black: blackName }}
          winnerSide={game.winner as "white" | "black" | null}
          lobbyHref="/play"
          onPlayAgain={!isSpectator ? handlePlayAgain : undefined}
          onRematch={!isSpectator && game.status !== "abort" && !incomingRematch ? handleRematch : undefined}
          rematchState={rematchState}
          onCancelRematch={rematchState.status === "waiting" ? handleCancelRematch : undefined}
          onAcceptRematch={incomingRematch && !isSpectator ? handleAcceptIncomingRematch : undefined}
          onDeclineRematch={incomingRematch && !isSpectator ? handleDeclineIncomingRematch : undefined}
          onReview={() => setVictoryDismissed(true)}
          onDismiss={() => setVictoryDismissed(true)}
        />
      </>
    );
  }

  // ============ PLAYER VIEW ============
  const playerData = isWhite
    ? { name: blackName, avatar: blackAvatar, rating: game.black_rating, ratingChange: game.black_rating_change, captured: captured.black, advantage: -captured.advantage, clock: getLiveClock("black"), isActive: game.turn === "black" && !gameEnded, symbol: "♚" }
    : { name: whiteName, avatar: whiteAvatar, rating: game.white_rating, ratingChange: game.white_rating_change, captured: captured.white, advantage: captured.advantage, clock: getLiveClock("white"), isActive: game.turn === "white" && !gameEnded, symbol: "♔" };

  const myData = isWhite
    ? { name: whiteName, avatar: whiteAvatar, rating: game.white_rating, ratingChange: game.white_rating_change, captured: captured.white, advantage: captured.advantage, clock: getLiveClock("white"), isActive: game.turn === "white" && !gameEnded, symbol: "♔" }
    : { name: blackName, avatar: blackAvatar, rating: game.black_rating, ratingChange: game.black_rating_change, captured: captured.black, advantage: -captured.advantage, clock: getLiveClock("black"), isActive: game.turn === "black" && !gameEnded, symbol: "♚" };

  return (
    <>
      {/* First-move abort countdown banner */}
      {isFirstMovePending && (
        <div className={`flex items-center justify-center gap-2 px-4 py-2 mb-1 rounded-lg text-sm font-medium transition-colors ${
          abortRemainingSec <= 5
            ? "bg-red-500/15 text-red-400 border border-red-500/30"
            : "bg-ccb-surface text-ccb-muted border border-ccb-border"
        }`}>
          <Timer className="w-4 h-4" />
          {myTurn
            ? <span>Make your first move! <span className="tabular-nums font-bold">{abortRemainingSec}s</span></span>
            : <span>Waiting for opponent... <span className="tabular-nums">{abortRemainingSec}s</span></span>
          }
        </div>
      )}

      <div className="game-viewport -my-4 sm:-my-6 flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-4">
        {boardColumn(playerData, myData, true)}
        {renderDesktopSidebar()}
      </div>

      <PromotionDialog visible={!!pendingPromotion} color={isWhite ? "white" : "black"} onSelect={handlePromotionSelect} onCancel={() => setPendingPromotion(null)} />
      <VictoryOverlay
        visible={gameEnded && !victoryDismissed}
        outcome={(game.status === "abort" ? "abort" : game.winner === null ? "draw" : game.winner === (isWhite ? "white" : "black") ? "win" : "loss") as GameOutcome}
        reasonLabel={STATUS_LABELS[game.status] || game.status}
        ratingChange={myRatingChange}
        berriesAwarded={berriesEarned}
        moneyEarned={moneyEarned}
        moneyLabel={isBattleGame ? "Battle winnings" : undefined}
        moveCount={game.move_count}
        subtitle={`${game.time_control} · ${game.rated ? "Ranked" : "Casual"}${isBattleGame ? " · Staked" : ""}`}
        playerNames={{ white: whiteName, black: blackName }}
        winnerSide={game.winner as "white" | "black" | null}
        lobbyHref="/play"
        onRematch={game.status !== "abort" && !incomingRematch ? handleRematch : undefined}
        rematchState={rematchState}
        onCancelRematch={rematchState.status === "waiting" ? handleCancelRematch : undefined}
        onAcceptRematch={incomingRematch ? handleAcceptIncomingRematch : undefined}
        onDeclineRematch={incomingRematch ? handleDeclineIncomingRematch : undefined}
        onReview={() => setVictoryDismissed(true)}
        onDismiss={() => setVictoryDismissed(true)}
      />
    </>
  );
}
