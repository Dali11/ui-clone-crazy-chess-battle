"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Chessboard } from "react-chessboard";
import { customPieces } from "@/lib/game/piece-styles";
import { getPremoveGhosts } from "@/lib/game/premove-ghost";
import { Chess } from "chess.js";
import { Clock, Flag, ArrowLeft, Bot, Volume2, VolumeX, List, Palette, X, ChevronLeft, ChevronRight, MoreVertical, MessageCircle, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getBestMove, type AIDifficulty } from "@/lib/game/chess-ai";
import { getCapturedPieces, getCheckSquare, getSeamlessBoardStyles } from "@/lib/game/board-helpers";
import { playSound, detectMoveSound, setSoundEnabled } from "@/lib/game/sound";
import { getStoredBoardTheme, type BoardTheme } from "@/lib/game/board-themes";
import { useBoardSize } from "@/hooks/use-board-size";
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll";
import MoveScroller from "./move-scroller";
import CapturedPieces from "./captured-pieces";
import VictoryOverlay, { type GameOutcome } from "./victory-overlay";
import PromotionDialog from "./promotion-dialog";
import BoardThemePicker from "./board-theme-picker";
import OpeningBadge from "./opening-badge";

interface ComputerGameProps {
  difficulty: AIDifficulty;
  playerColor: "white" | "black";
  initialMinutes: number;
  incrementSeconds: number;
  userId: string | null;
}

const DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  easy: "Easy Bot",
  medium: "Medium Bot",
  hard: "Hard Bot",
};

const STATUS_LABELS: Record<string, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  draw: "Draw",
  resign: "Resignation",
  timeout: "Time out",
};

type SheetType = "chat" | "theme" | "menu" | "moves" | null;

interface ChatMsg {
  id: string;
  sender: "user" | "bot";
  text: string;
}

function formatClock(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function ComputerGame({ difficulty, playerColor, initialMinutes, incrementSeconds, userId }: ComputerGameProps) {
  const chessRef = useRef(new Chess());
  const [fen, setFen] = useState(chessRef.current.fen());
  const [turn, setTurn] = useState<"white" | "black">("white");
  const [status, setStatus] = useState("playing");
  const [winner, setWinner] = useState<string | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [whiteClock, setWhiteClock] = useState(initialMinutes * 60 * 1000);
  const router = useRouter();
  const [blackClock, setBlackClock] = useState(initialMinutes * 60 * 1000);
  const [clockTick, setClockTick] = useState(0);
  const [lastMoveAt, setLastMoveAt] = useState(Date.now());
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(getStoredBoardTheme());
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<string[]>([]);
  // Premove queue — chess.com-style, unlimited length. Each entry plays on
  // its own turn (first entry plays now, the rest stay queued as the engine
  // replies between them).
  const [premoves, setPremoves] = useState<{ from: string; to: string }[]>([]);
  const [premovePromotion, setPremovePromotion] = useState<{ from: string; to: string } | null>(null);
  // True once we've auto-played a premove this turn — prevents the queue
  // effect from firing the whole chain back-to-back while isPlayerTurn is
  // still true before the engine's reply lands.
  const playedThisTurnRef = useRef(false);
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [viewPly, setViewPly] = useState(0);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [reviewFen, setReviewFen] = useState<string | null>(null);
  const [botMessages, setBotMessages] = useState<ChatMsg[]>([
    { id: "init", sender: "bot", text: `Hello! Good luck playing against ${DIFFICULTY_LABELS[difficulty]}! 🤖` }
  ]);
  const [chatInput, setChatInput] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundPlayedForEnd = useRef(false);
  const savedRef = useRef(false);
  // 0.94: board gets ~3% breathing room per side on phones/tablets so
  // squares stay slightly smaller than full-width (was edge-to-edge ~55-56px
  // on mobile). Snapped to a multiple of 8 by the hook, so still seam-free.
  const { containerRef: boardContainerRef, size: boardSize } = useBoardSize(680, 220, 8, 0.94);

  useLockBodyScroll();

  const isPlayerWhite = playerColor === "white";
  const isPlayerTurn = (isPlayerWhite && turn === "white") || (!isPlayerWhite && turn === "black");
  const gameEnded = status !== "playing";
  const aiColor = isPlayerWhite ? "black" : "white";
  const isLiveView = viewPly === 0 || viewPly >= moveHistory.length;

  // Derived: captured pieces, check square
  const captured = useMemo(() => getCapturedPieces(fen), [fen]);
  const checkSquare = useMemo(() => getCheckSquare(fen), [fen]);

  // Queued premove chain (promotion premove keeps its FIFO slot inline)
  const queuedPremoves = useMemo(
    () => (premovePromotion ? [...premoves, { from: premovePromotion.from, to: premovePromotion.to }] : premoves),
    [premoves, premovePromotion]
  );

  // chess.com-style ghost pieces: a faded copy of the piece that each
  // queued premove will deliver, drawn on its destination square so the
  // player can SEE the projected piece and knows they can tap it to
  // chain the next hop.
  const premoveGhosts = useMemo(() => getPremoveGhosts(fen, isPlayerWhite, queuedPremoves), [fen, isPlayerWhite, queuedPremoves]);

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
    // Legal move hints
    for (const sq of legalMoveSquares) {
      styles[sq] = {
        background: "radial-gradient(circle, rgba(139,92,246,0.25) 22%, transparent 24%)",
      };
    }
    // Selected square highlight
    if (selectedSquare) {
      styles[selectedSquare] = {
        ...styles[selectedSquare],
        background: "radial-gradient(circle, rgba(139,92,246,0.4) 70%, transparent 72%)",
      };
    }
    // Premove queue highlight — amber/orange on every queued premove
    for (const p of queuedPremoves) {
      styles[p.from] = {
        ...styles[p.from],
        background: "radial-gradient(circle, rgba(251,191,36,0.4) 70%, transparent 72%)",
        boxShadow: "inset 0 0 0 3px rgba(251,191,36,0.6)",
      };
      styles[p.to] = {
        ...styles[p.to],
        background: "radial-gradient(circle, rgba(251,191,36,0.35) 70%, transparent 72%)",
        boxShadow: "inset 0 0 0 3px rgba(251,191,36,0.5)",
      };
    }
    return styles;
  }, [lastMove, checkSquare, legalMoveSquares, selectedSquare, queuedPremoves, isLiveView]);

  // Live clock tick
  useEffect(() => {
    if (gameEnded) return;
    const tick = () => {
      const now = Date.now();
      setClockTick((t) => t + 1);
      const elapsed = now - lastMoveAt;
      const activeClock = turn === "white" ? whiteClock : blackClock;
      const remaining = activeClock - elapsed;
      if (remaining <= 0) {
        const loser = turn;
        const w = loser === "white" ? "black" : "white";
        setStatus("timeout");
        setWinner(w);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [turn, lastMoveAt, gameEnded, whiteClock, blackClock]);

  // Play game-over sound when game ends
  useEffect(() => {
    if (gameEnded && !soundPlayedForEnd.current) {
      soundPlayedForEnd.current = true;
      playSound("gameEnd");
    }
  }, [gameEnded]);

  // Save bot game to database when game ends
  useEffect(() => {
    if (!gameEnded || savedRef.current || !userId) return;
    savedRef.current = true;

    const pgn = chessRef.current.pgn();
    const finalFen = chessRef.current.fen();
    const moveCountVal = chessRef.current.history().length;

    fetch("/api/games/save-bot-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        difficulty,
        playerColor,
        status,
        winner,
        pgn,
        fen: finalFen,
        moveCount: moveCountVal,
        initialMinutes,
        incrementSeconds,
        whiteClockMs: whiteClock,
        blackClockMs: blackClock,
      }),
    }).catch(() => {});
  }, [gameEnded, userId, status, winner, difficulty, playerColor, initialMinutes, incrementSeconds, whiteClock, blackClock]);

  // Apply a move with sound
  const applyMove = useCallback((from: string, to: string, promotion: string = "q") => {
    try {
      const result = chessRef.current.move({ from, to, promotion });
      if (result === null) return false;

      // Clear selections
      setSelectedSquare(null);
      setLegalMoveSquares([]);

      // Play sound based on move type
      const soundType = detectMoveSound(result);
      playSound(soundType);
      // Check sound if in check after the move
      if (chessRef.current.inCheck() && !chessRef.current.isCheckmate()) {
        setTimeout(() => playSound("check"), 100);
      }

      const now = Date.now();
      const elapsed = now - lastMoveAt;

      if (turn === "white") {
        const newWhite = whiteClock - elapsed + incrementSeconds * 1000;
        setWhiteClock(Math.max(0, Math.floor(newWhite)));
      } else {
        const newBlack = blackClock - elapsed + incrementSeconds * 1000;
        setBlackClock(Math.max(0, Math.floor(newBlack)));
      }

      setFen(chessRef.current.fen());
      setTurn(chessRef.current.turn() === "w" ? "white" : "black");
      setMoveCount(chessRef.current.history().length);
      setMoveHistory(chessRef.current.history());
      setViewPly(chessRef.current.history().length);
      setLastMove({ from, to });
      setLastMoveAt(now);

      if (chessRef.current.isCheckmate()) {
        setStatus("checkmate");
        setWinner(turn);
      } else if (chessRef.current.isStalemate()) {
        setStatus("stalemate");
      } else if (chessRef.current.isDraw() || chessRef.current.isThreefoldRepetition() || chessRef.current.isInsufficientMaterial()) {
        setStatus("draw");
      }

      return true;
    } catch {
      return false;
    }
  }, [turn, whiteClock, blackClock, lastMoveAt, incrementSeconds]);

  // AI makes a move
  useEffect(() => {
    if (gameEnded || isPlayerTurn) return;
    setAiThinking(true);
    const timeout = setTimeout(() => {
      const move = getBestMove(fen, difficulty);
      if (move) {
        applyMove(move.from, move.to, move.promotion || "q");
      }
      setAiThinking(false);
    }, 300 + Math.random() * 700);
    return () => clearTimeout(timeout);
  }, [turn, gameEnded, isPlayerTurn, fen, difficulty, applyMove]);

  // Check if a move is a pawn promotion
  const isPromotionMove = useCallback((from: string, to: string): boolean => {
    const game = new Chess(fen);
    const piece = game.get(from as any);
    if (!piece || piece.type !== "p") return false;
    const rank = to[1];
    return (piece.color === "w" && rank === "8") || (piece.color === "b" && rank === "1");
  }, [fen]);

  // Auto-execute the premove queue when it becomes our turn — chess.com
  // behavior: only the FIRST queued premove plays; the rest stay queued for
  // our subsequent turns as the engine replies. If the first premove is no
  // longer legal, the whole chain is cancelled.
  useEffect(() => {
    if (!isPlayerTurn) {
      playedThisTurnRef.current = false;
      return;
    }
    if (gameEnded) return;
    if (premovePromotion) {
      // The queued premove is a promotion — show the picker now
      setPendingPromotion({ from: premovePromotion.from, to: premovePromotion.to });
      setPremovePromotion(null);
      return;
    }
    const first = premoves[0];
    if (!first || playedThisTurnRef.current) return;
    // Validate against the real position; detect promotion HERE (chess.js
    // flags the probed move) instead of at queue time — FIFO order is
    // preserved in mixed chains, and chained promotions get the real
    // picker instead of a silent auto-queen.
    let probe: any = null;
    try {
      probe = new Chess(fen).move({ from: first.from, to: first.to, promotion: "q" });
    } catch {}
    if (!probe) {
      // No longer legal — chain is broken, cancel everything
      setPremoves([]);
      return;
    }
    playedThisTurnRef.current = true;
    if (probe.promotion) {
      // Front of the queue is a promotion — defer to the picker; the
      // consumed turn slot prevents the next chained premove from playing
      // behind the open promotion dialog.
      setPremoves((prev) => prev.slice(1));
      setPremovePromotion({ from: first.from, to: first.to });
      return;
    }
    applyMove(first.from, first.to, "q");
    // Executed — keep the rest of the queue for our next turns
    setPremoves((prev) => prev.slice(1));
  }, [isPlayerTurn, premoves, premovePromotion, fen, gameEnded, applyMove]);

  // Projected ("ghost") piece positions after the queued premove chain —
  // square -> the real origin square of the piece that will sit there if
  // the whole chain plays out. This is what lets the player chain the
  // SAME piece through multiple squares, chess.com-style: after queuing
  // g1->f3, the knight is projected at f3 and can be grabbed "from f3"
  // to queue its next hop, and so on.
  const ghostSquares = useMemo(() => {
    const map: Record<string, string> = {};
    try {
      const g = new Chess(fen);
      for (const f of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
        for (const r of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
          const sq = f + r;
          const pc = g.get(sq as any);
          if (pc && ((isPlayerWhite && pc.color === "w") || (!isPlayerWhite && pc.color === "b"))) map[sq] = sq;
        }
      }
      for (const p of premoves) {
        const origin = map[p.from];
        if (!origin) continue; // broken chain — later hops dangle until execution cancels
        delete map[p.from];
        map[p.to] = origin;
      }
    } catch {
      // keep whatever was mapped so far
    }
    return map;
  }, [fen, premoves, isPlayerWhite]);

  // Handle piece click — show legal moves or capture (Tap-to-move)
  // Generate OUR piece's move destinations even when it's not our turn.
  // chess.js moves() only returns moves for the side to move, so during
  // the engine's turn our pieces would get an EMPTY move list — which is
  // exactly why tap-to-move premoves never worked (drag premoves bypass
  // the legal-move list entirely). Swap the turn field in the FEN (and
  // strip en-passant) to ask "if it were my turn right now, where could
  // this piece go?" Premove candidates are re-validated against the real
  // position when they execute, so pseudo-legal is fine here.
  const getPremoveMoves = useCallback((square: string): string[] => {
    try {
      const parts = fen.split(" ");
      parts[1] = isPlayerWhite ? "w" : "b";
      parts[3] = "-";
      const myColor = isPlayerWhite ? "w" : "b";
      let g = new Chess(parts.join(" "));
      // Selecting on a GHOST square (a mid-chain hop of a piece with
      // premoves queued) — replay the chain on the turn-swapped position
      // so the piece exists there and its next-hop candidates generate.
      if (!new Chess(fen).get(square as any)) {
        for (const p of premoves) {
          const mv = g.move({ from: p.from, to: p.to, promotion: "q" });
          if (!mv) return []; // chain broken — nothing selectable past here
          const f2 = g.fen().split(" ");
          f2[1] = myColor;
          f2[3] = "-";
          g = new Chess(f2.join(" "));
        }
      }
      return g.moves({ square: square as any, verbose: true }).map((m: any) => m.to);
    } catch {
      return [];
    }
  }, [fen, isPlayerWhite, premoves]);

  // PURE SELECTION LOGIC — never executes moves. react-chessboard fires
  // onPieceClick AND the bubbled onSquareClick for the same piece tap on
  // desktop, so executing here would double-fire every capture tap. All
  // move/premove execution lives in handleSquareClick, which fires
  // exactly once per tap.
  // Handle piece click — show legal moves or premove selection (tap-to-move)
  const handlePieceClick = useCallback(({ square, piece }: { square: string | null; piece: { pieceType: string } | null }) => {
    if (gameEnded || !isLiveView) return;

    if (!piece || !square) {
      // Empty square during the engine's turn — if one of our pieces is
      // PROJECTED here mid-chain, select it to queue its next hop
      // (chess.com premove chaining). Otherwise clear/cancel as before.
      if (square && !isPlayerTurn && ghostSquares[square]) {
        setSelectedSquare(square);
        setLegalMoveSquares(getPremoveMoves(square));
        return;
      }
      if (premoves.length > 0 || premovePromotion) { setPremoves([]); setPremovePromotion(null); }
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return;
    }

    // Legal move target of the current selection — defer. The bubbled
    // onSquareClick (handleSquareClick) executes it exactly once.
    if (selectedSquare && square !== selectedSquare && legalMoveSquares.includes(square)) {
      return;
    }

    // Premove selection via tap-to-move (when it's not our turn)
    if (!isPlayerTurn) {
      const game = new Chess(fen);
      const squarePiece = game.get(square as any);
      if (!squarePiece) {
        if (premoves.length > 0 || premovePromotion) { setPremoves([]); setPremovePromotion(null); }
        return;
      }
      const isMyPiece = (isPlayerWhite && squarePiece.color === "w") || (!isPlayerWhite && squarePiece.color === "b");
      if (!isMyPiece) {
        if (premoves.length > 0 || premovePromotion) { setPremoves([]); setPremovePromotion(null); }
        return;
      }
      // Clicked a piece that's part of a queued premove — cancel the whole
      // queue (chess.com behavior: tap the premove piece to clear it).
      if (premoves.some((p) => p.from === square || p.to === square)) {
        setPremoves([]);
        setPremovePromotion(null);
        return;
      }
      // Select piece for a new premove. getPremoveMoves() generates our
      // piece's destinations even though it's the engine's turn —
      // chess.js would otherwise return an empty list here, which is why
      // tap premoves never registered.
      setSelectedSquare(square);
      setLegalMoveSquares(getPremoveMoves(square));
      return;
    }

    // Our turn — select the piece if it's ours
    const game = new Chess(fen);
    const squarePiece = game.get(square as any);
    if (!squarePiece) return;
    const isMyPiece = (isPlayerWhite && squarePiece.color === "w") || (!isPlayerWhite && squarePiece.color === "b");
    if (!isMyPiece) {
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return;
    }
    // Toggle: clicking the same piece deselects; otherwise select
    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return;
    }
    setSelectedSquare(square);
    const moves = game.moves({ square: square as any, verbose: true });
    setLegalMoveSquares(moves.map((m: any) => m.to));
  }, [isPlayerTurn, gameEnded, fen, isPlayerWhite, isLiveView, selectedSquare, legalMoveSquares, premoves, premovePromotion, getPremoveMoves, ghostSquares]);

  // Handle square click — tap to move or delegate to piece click
  // ALL move and premove execution lives here. react-chessboard fires
  // onSquareClick exactly once per tap — for empty squares directly, and
  // for piece squares via bubbling (on mobile the touch handler fires it
  // directly and suppresses the synthetic click). Making this the single
  // execution point guarantees a tap can never double-fire a move.
  // Handle square click — tap to move or delegate to piece click
  const handleSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    if (gameEnded || !isLiveView) return;
    // Legal move target of the current selection — execute or queue
    if (selectedSquare && square !== selectedSquare && legalMoveSquares.includes(square)) {
      if (isPlayerTurn) {
        if (isPromotionMove(selectedSquare, square)) {
          setPendingPromotion({ from: selectedSquare, to: square });
        } else {
          applyMove(selectedSquare, square, "q");
        }
      } else {
        // Not our turn — queue a premove, unlimited chain length.
        // Promotions are detected at EXECUTION time so a promotion
        // premove keeps its FIFO place in a mixed chain.
        setPremoves((prev) => [...prev, { from: selectedSquare, to: square }]);
      }
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return;
    }
    // Everything else (selection, deselect, premove cancel) — defer
    handlePieceClick({ square, piece });
  }, [selectedSquare, legalMoveSquares, isPlayerTurn, isPromotionMove, applyMove, handlePieceClick, gameEnded, isLiveView]);

  // Player drop handler — drag and drop
  const onDrop = useCallback((sourceSquare: string, targetSquare: string): boolean => {
    if (gameEnded || !isLiveView) return false;
    setSelectedSquare(null);
    setLegalMoveSquares([]);

    if (isPlayerTurn) {
      if (isPromotionMove(sourceSquare, targetSquare)) {
        setPendingPromotion({ from: sourceSquare, to: targetSquare });
        return false;
      }
      return applyMove(sourceSquare, targetSquare, "q");
    }
    // Not our turn — queue a premove
    if (!targetSquare) return false;
    // Dragging a piece onto its own queued premove target cancels the
    // whole queue ("undo the premove")
    if (premoves.some((p) => p.from === sourceSquare && p.to === targetSquare)) {
      setPremoves([]);
      setPremovePromotion(null);
      return false;
    }
    // Resolve the drag source: a piece on its real square, or the same
    // piece on its PROJECTED square mid-chain (chess.com chaining —
    // after queuing g1->f3 the knight can be grabbed "from f3" to queue
    // its next hop).
    const game = new Chess(fen);
    const piece = game.get(sourceSquare as any);
    const isMyPiece = piece && ((isPlayerWhite && piece.color === "w") || (!isPlayerWhite && piece.color === "b"));
    const realOrigin = isMyPiece ? sourceSquare : ghostSquares[sourceSquare];
    if (!realOrigin) return false;
    if (!isMyPiece) {
      // Ghost source — append the piece's next hop to the end of the queue
      setPremoves((prev) => [
        ...prev.filter((p) => p.from !== sourceSquare),
        { from: sourceSquare, to: targetSquare },
      ]);
      return true;
    }
    // Real-square drag — re-route this piece: drop its WHOLE queued chain
    // (including hops starting from ghost squares) and queue the new
    // destination at the end of the queue. Other pieces' entries keep
    // their FIFO slots.
    setPremoves((prev) => {
      const projAt: Record<string, string> = {};
      const kept: { from: string; to: string }[] = [];
      for (const p of prev) {
        const origin = projAt[p.from] ?? p.from;
        delete projAt[p.from];
        projAt[p.to] = origin;
        if (origin === realOrigin) continue; // old hop of the dragged piece
        kept.push(p);
      }
      kept.push({ from: sourceSquare, to: targetSquare });
      return kept;
    });
    return true;
  }, [isPlayerTurn, gameEnded, isPromotionMove, applyMove, fen, isPlayerWhite, isLiveView, premoves, ghostSquares]);

  // Handle promotion selection
  const handlePromotionSelect = useCallback((piece: "q" | "r" | "b" | "n") => {
    if (pendingPromotion) {
      applyMove(pendingPromotion.from, pendingPromotion.to, piece);
    }
    setPendingPromotion(null);
  }, [pendingPromotion, applyMove]);

  const handleResign = () => {
    setStatus("resign");
    setWinner(aiColor);
    setShowResignConfirm(false);
  };

  const handlePlayAgain = async () => {
    const tcId = (() => {
      const m = initialMinutes;
      const i = incrementSeconds;
      if (m === 1 && i === 0) return "bullet";
      if (m === 3 && i === 2) return "blitz3";
      if (m === 5 && i === 0) return "blitz";
      if (m === 10 && i === 0) return "rapid";
      if (m === 15 && i === 10) return "rapid15";
      if (m === 30 && i === 0) return "classical";
      return "blitz";
    })();
    try {
      const res = await fetch("/api/matchmaking/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: tcId, rated: true }),
      });
      const data = await res.json();
      if (data.status === "matched" && data.gameId) {
        router.push(`/game/${data.gameId}`);
      } else {
        router.push(`/play?tc=${tcId}&rated=1&search=1`);
      }
    } catch {
      router.push(`/play?tc=${tcId}&rated=1&search=1`);
    }
  };

  const handleNewGame = () => {
    chessRef.current.reset();
    setFen(chessRef.current.fen());
    setTurn("white");
    setStatus("playing");
    setWinner(null);
    setMoveCount(0);
    setMoveHistory([]);
    setViewPly(0);
    setOverlayDismissed(false);
    setLastMove(null);
    setSelectedSquare(null);
    setLegalMoveSquares([]);
    setPremoves([]);
    setPremovePromotion(null);
    setWhiteClock(initialMinutes * 60 * 1000);
    setBlackClock(initialMinutes * 60 * 1000);
    setLastMoveAt(Date.now());
    savedRef.current = false;
    soundPlayedForEnd.current = false;
    playSound("gameStart");
  };

  const toggleSound = () => {
    const newVal = !soundOn;
    setSoundOn(newVal);
    setSoundEnabled(newVal);
  };

  const getLiveClock = (player: "white" | "black") => {
    if (gameEnded || turn !== player) {
      return formatClock(player === "white" ? whiteClock : blackClock);
    }
    const elapsed = Date.now() - lastMoveAt;
    void clockTick;
    const base = player === "white" ? whiteClock : blackClock;
    return formatClock(Math.max(0, base - elapsed));
  };

  // If AI plays white, trigger first move
  useEffect(() => {
    if (!isPlayerWhite && turn === "white" && status === "playing" && moveCount === 0) {
      setAiThinking(true);
      const timeout = setTimeout(() => {
        const move = getBestMove(chessRef.current.fen(), difficulty);
        if (move) applyMove(move.from, move.to, move.promotion || "q");
        setAiThinking(false);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isPlayerWhite, turn, status, moveCount, difficulty, applyMove]);

  // Play game start sound on mount
  useEffect(() => {
    playSound("gameStart");
  }, []);

  const toggleSheet = (sheet: SheetType) => setActiveSheet((prev) => (prev === sheet ? null : sheet));

  const sendChatMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: ChatMsg = { id: String(Date.now()), sender: "user", text: trimmed };
    setBotMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    setTimeout(() => {
      let reply = "Beep boop! Let's play some chess! 🤖";
      const lower = trimmed.toLowerCase();
      if (lower.includes("good luck") || lower.includes("gl")) {
        reply = "Good luck to you too! May the best mind win! 🧠";
      } else if (lower.includes("nice") || lower.includes("good move") || lower.includes("great")) {
        reply = "Thank you! I'm evaluating every square! ♟️";
      } else if (lower.includes("gg") || lower.includes("game")) {
        reply = "Good game! It was fun playing with you! 🏆";
      } else if (difficulty === "easy") {
        reply = "I'm Easy Bot! I'm still learning chess tactics. 🤖";
      } else if (difficulty === "medium") {
        reply = "I'm Medium Bot! I'm evaluating positions quickly! ⚡";
      } else if (difficulty === "hard") {
        reply = "I'm Hard Bot! I analyze thousands of moves per second! ⚔️";
      }
      setBotMessages((prev) => [...prev, { id: String(Date.now() + 1), sender: "bot", text: reply }]);
    }, 500);
  };

  // Show past position when reviewing moves
  const displayFen = reviewFen ?? fen;

  // Memoized board element — stable identity across the 1s clock tick so
  // React skips reconciling the 64-square board subtree mid-drag. Prevents
  // piece stutter on low-end phones ("pieces stuck in mud").
  // Computed fresh each render (cheap: one function call) so it always
  // reflects the latest boardSize/theme — memoized below via chessboardElement's deps.
  const seamlessBoardStyles = getSeamlessBoardStyles(boardTheme.dark, boardTheme.light, boardSize);

  const chessboardElement = useMemo(() => (
    <Chessboard
      options={{
        position: displayFen,
        pieces: customPieces,
        boardOrientation: isPlayerWhite ? "white" : "black",
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          if (!targetSquare) return false;
          return onDrop(sourceSquare, targetSquare);
        },
        allowDragging: !gameEnded && isLiveView,
        squareStyles: squareStyles,
        // chess.com-style premove ghosts: faded piece on each premove
        // destination. Non-ghost squares render the library default
        // (width/height/squareStyles) so nothing else changes.
        squareRenderer: ({ square, children }) => {
          const pieceKey = premoveGhosts[square];
          const Ghost = pieceKey ? customPieces[pieceKey as keyof typeof customPieces] : null;
          return (
            <div
              style={{
                width: "100%",
                height: "100%",
                ...(Ghost ? { position: "relative" } : {}),
                ...squareStyles[square],
              }}
            >
              {children}
              {Ghost && (
                // pointer-events-none: taps/drags pass through to the square
                // itself, so tap-chaining off the ghost square is unchanged
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    opacity: 0.45,
                  }}
                >
                  <div style={{ width: "100%", height: "100%" }}>
                    <Ghost />
                  </div>
                </div>
              )}
            </div>
          );
        },
        showAnimations: false,
        animationDurationInMs: 0,
        showNotation: true,
        darkSquareNotationStyle: { color: boardTheme.light, fontSize: "10px", fontWeight: 600 },
        lightSquareNotationStyle: { color: boardTheme.dark, fontSize: "10px", fontWeight: 600 },
        onPieceClick: handlePieceClick,
        onSquareClick: handleSquareClick,
        ...seamlessBoardStyles,
        boardStyle: { ...seamlessBoardStyles.boardStyle, borderRadius: "8px", overflow: "hidden" },
      }}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [displayFen, isPlayerWhite, gameEnded, isLiveView, squareStyles, premoveGhosts, boardTheme, boardSize, onDrop, handlePieceClick, handleSquareClick]);

  // BUGFIX: this effect used to only update `reviewFen` and never touch
  // `lastMove`, so the purple "last move" highlight always showed the
  // most-recently-PLAYED squares regardless of which historical ply was
  // being reviewed — a highlight stuck on the wrong squares while
  // browsing move history (reads as a rendering glitch on the board).
  // Every branch now recomputes `lastMove` from whatever position is
  // actually being displayed, mirroring the live-game reviewer.
  useEffect(() => {
    if (viewPly === 0 || moveHistory.length === 0) {
      setReviewFen(null);
      setLastMove(null); // start of the game — nothing to highlight yet
      return;
    }
    if (viewPly >= moveHistory.length) {
      setReviewFen(null);
      try {
        const liveGame = new Chess();
        for (const mv of moveHistory) liveGame.move(mv);
        const liveVerbose = liveGame.history({ verbose: true });
        const liveLast = liveVerbose[liveVerbose.length - 1];
        setLastMove(liveLast ? { from: liveLast.from, to: liveLast.to } : null);
      } catch {
        setLastMove(null);
      }
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

  const opponentData = isPlayerWhite
    ? { name: DIFFICULTY_LABELS[difficulty], color: "black", symbol: "♚", captured: captured.black, advantage: -captured.advantage, clock: getLiveClock("black"), isActive: turn === "black" && !gameEnded }
    : { name: DIFFICULTY_LABELS[difficulty], color: "white", symbol: "♔", captured: captured.white, advantage: captured.advantage, clock: getLiveClock("white"), isActive: turn === "white" && !gameEnded };

  const playerData = isPlayerWhite
    ? { name: "You", color: "white", symbol: "♔", captured: captured.white, advantage: captured.advantage, clock: getLiveClock("white"), isActive: isPlayerTurn && !gameEnded }
    : { name: "You", color: "black", symbol: "♚", captured: captured.black, advantage: -captured.advantage, clock: getLiveClock("black"), isActive: isPlayerTurn && !gameEnded };

  return (
    <>
      <div className="game-viewport -my-4 sm:-my-6 -mx-4 sm:-mx-6 lg:-mx-8 flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-6">
        {/* ===== Board column ===== */}
        <div className="relative flex flex-col h-full w-full lg:w-[680px] lg:max-w-[680px] lg:shrink-0 lg:my-auto">
          {/* Mobile-only slim top bar */}
          <div className="lg:hidden shrink-0 flex items-center justify-between px-3 h-11 border-b border-ccb-border">
            <Link href="/play" className="p-1.5 -ml-1.5 text-ccb-muted hover:text-ccb-primary">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-sm font-medium text-ccb-muted truncate flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" />
              {aiThinking ? "Thinking..." : DIFFICULTY_LABELS[difficulty]}
            </span>
            <button onClick={toggleSound} className="p-1.5 -mr-1.5 text-ccb-muted hover:text-ccb-primary">
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          {/* Horizontal move scroller — chess.com style, at the very top */}
          <div className="max-w-[680px] mx-auto w-full px-2 py-1">
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
          <div className={`shrink-0 flex items-center justify-between max-w-[680px] mx-auto w-full px-2 py-1.5 rounded-lg transition-colors ${opponentData.isActive ? "bg-ccb-primary/8" : ""}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${opponentData.isActive ? "border-ccb-primary bg-ccb-primary/15" : "border-ccb-border bg-ccb-surface"}`}>
                <Bot className="w-4 h-4 text-ccb-muted" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold leading-tight truncate">{opponentData.name}</span>
                <CapturedPieces pieces={opponentData.captured} advantage={opponentData.advantage} perspective="top" />
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-mono text-xl font-bold transition-all shrink-0 ${
              opponentData.isActive
                ? "bg-ccb-surface text-ccb-text shadow-md ring-1 ring-ccb-primary/30"
                : "bg-ccb-surface/60 text-ccb-muted"
            }`}>
              <Clock className={`w-4 h-4 ${opponentData.isActive ? "text-ccb-primary" : "text-ccb-muted"}`} />
              {opponentData.clock}
            </div>
          </div>

          {/* Chessboard — flexible, fills remaining space, never forces scroll */}
          <div ref={boardContainerRef} className="flex-1 min-h-0 flex items-center justify-center px-2 py-1">
            <div style={{ width: boardSize, height: boardSize, colorScheme: "light" }}>
              {chessboardElement}
            </div>
          </div>

          {/* Player bar */}
          <div className={`shrink-0 flex items-center justify-between max-w-[680px] mx-auto w-full px-2 py-1.5 rounded-lg transition-colors ${playerData.isActive ? "bg-ccb-primary/8" : ""}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${playerData.isActive ? "border-ccb-primary bg-ccb-primary/15" : "border-ccb-border bg-ccb-surface"}`}>
                <span className="text-lg">{playerData.symbol}</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold leading-tight truncate">{playerData.name}</span>
                <CapturedPieces pieces={playerData.captured} advantage={playerData.advantage} perspective="bottom" />
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-mono text-xl font-bold transition-all shrink-0 ${
              playerData.isActive
                ? "bg-ccb-surface text-ccb-text shadow-md ring-1 ring-ccb-primary/30"
                : "bg-ccb-surface/60 text-ccb-muted"
            }`}>
              <Clock className={`w-4 h-4 ${playerData.isActive ? "text-ccb-primary" : "text-ccb-muted"}`} />
              {playerData.clock}
            </div>
          </div>

          {/* Live position indicator when reviewing past moves */}
          {!isLiveView && moveHistory.length > 0 && (
            <div className="max-w-[680px] mx-auto w-full px-2">
              <button
                onClick={() => setViewPly(moveHistory.length)}
                className="w-full text-center text-xs text-ccb-primary hover:underline py-1"
              >
                ← Return to live position
              </button>
            </div>
          )}

          {/* Desktop-only resign control */}
          {!gameEnded && (
            <div className="hidden lg:flex items-center justify-center gap-3 max-w-[680px] mx-auto mt-2 shrink-0">
              {showResignConfirm ? (
                <>
                  <span className="text-sm text-ccb-muted">Resign?</span>
                  <button onClick={handleResign} className="btn bg-ccb-danger text-white px-4 py-2 text-sm">
                    Yes, resign
                  </button>
                  <button onClick={() => setShowResignConfirm(false)} className="btn-secondary text-sm">
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setShowResignConfirm(true)} className="btn-secondary text-sm">
                  <Flag className="w-4 h-4 mr-1" /> Resign
                </button>
              )}
            </div>
          )}

          {/* Mobile bottom toolbar — chess.com style layout used during both play and after game */}
          <div className="lg:hidden shrink-0 border-t border-ccb-border" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}>
            {showResignConfirm ? (
              <div className="flex items-center justify-center gap-3 h-14">
                <span className="text-sm text-ccb-muted">Resign?</span>
                <button onClick={handleResign} className="btn bg-ccb-danger text-white px-4 py-1.5 text-sm">
                  Yes
                </button>
                <button onClick={() => setShowResignConfirm(false)} className="btn-secondary text-sm px-4 py-1.5">
                  Cancel
                </button>
              </div>
            ) : gameEnded ? (
              <div className="flex items-center justify-around h-14">
                <button
                  onClick={handleNewGame}
                  className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-primary hover:text-ccb-primary/80"
                >
                  <RotateCcw className="w-5 h-5" /><span className="text-[10px]">New Game</span>
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
                  className={`flex flex-col items-center gap-0.5 flex-1 py-1 ${activeSheet === "chat" ? "text-ccb-primary" : "text-ccb-muted"}`}
                >
                  <MessageCircle className="w-5 h-5" /><span className="text-[10px]">Chat</span>
                </button>
                <button
                  onClick={() => toggleSheet("menu")}
                  className={`flex flex-col items-center gap-0.5 flex-1 py-1 ${activeSheet === "menu" ? "text-ccb-primary" : "text-ccb-muted"}`}
                >
                  <MoreVertical className="w-5 h-5" /><span className="text-[10px]">Options</span>
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
                <button
                  onClick={() => toggleSheet("chat")}
                  className={`flex flex-col items-center gap-0.5 flex-1 py-1 ${activeSheet === "chat" ? "text-ccb-primary" : "text-ccb-muted"}`}
                >
                  <MessageCircle className="w-5 h-5" /><span className="text-[10px]">Chat</span>
                </button>
                <button
                  onClick={() => toggleSheet("menu")}
                  className={`flex flex-col items-center gap-0.5 flex-1 py-1 ${activeSheet === "menu" ? "text-ccb-primary" : "text-ccb-muted"}`}
                >
                  <MoreVertical className="w-5 h-5" /><span className="text-[10px]">Options</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile bottom sheet — Chat / Menu / Moves / Theme */}
          {activeSheet && (
            <div className="lg:hidden absolute inset-x-2 bottom-16 z-20 max-h-[50%] rounded-xl border border-ccb-border bg-ccb-card shadow-2xl animate-sheet-up flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-ccb-border shrink-0">
                <span className="text-sm font-medium">
                  {activeSheet === "chat" ? `Chat with ${DIFFICULTY_LABELS[difficulty]}` :
                   activeSheet === "moves" ? "Move History" :
                   activeSheet === "theme" ? "Board Theme" : "Options"}
                </span>
                <button onClick={() => setActiveSheet(null)} className="text-ccb-muted hover:text-ccb-primary p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 no-scrollbar min-h-0 flex flex-col">
                {activeSheet === "chat" && (
                  <div className="flex flex-col h-full min-h-[200px]">
                    <div className="flex-1 overflow-y-auto space-y-2 p-1">
                      {botMessages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${
                            msg.sender === "user"
                              ? "bg-ccb-primary text-white"
                              : "bg-ccb-surface text-ccb-text border border-ccb-border"
                          }`}>
                            {msg.sender === "bot" && (
                              <div className="text-[10px] font-medium text-ccb-primary mb-0.5 flex items-center gap-1">
                                <Bot className="w-3 h-3" /> {DIFFICULTY_LABELS[difficulty]}
                              </div>
                            )}
                            <div>{msg.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Quick messages */}
                    <div className="py-1 flex flex-wrap gap-1 border-t border-ccb-border/50 shrink-0">
                      {["Good luck!", "Nice move!", "GG", "Oops 😅", "Let's go!"].map((q) => (
                        <button
                          key={q}
                          onClick={() => sendChatMessage(q)}
                          className="rounded-full bg-ccb-surface border border-ccb-border px-2 py-0.5 text-[11px] hover:bg-ccb-card transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    {/* Chat input */}
                    <form
                      onSubmit={(e) => { e.preventDefault(); sendChatMessage(chatInput); }}
                      className="flex items-center gap-1.5 pt-1 shrink-0"
                    >
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 min-w-0 bg-ccb-surface border border-ccb-border rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-ccb-primary"
                      />
                      <button
                        type="submit"
                        disabled={!chatInput.trim()}
                        className="bg-ccb-primary text-white rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-40"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}

                {activeSheet === "menu" && (
                  <div className="space-y-1">
                    <button
                      onClick={() => setActiveSheet("theme")}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-ccb-surface hover:bg-ccb-card text-xs font-medium transition-colors"
                    >
                      <span className="flex items-center gap-2"><Palette className="w-4 h-4 text-ccb-primary" /> Board Theme</span>
                      <ChevronRight className="w-4 h-4 text-ccb-muted" />
                    </button>
                    <button
                      onClick={() => setActiveSheet("moves")}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-ccb-surface hover:bg-ccb-card text-xs font-medium transition-colors"
                    >
                      <span className="flex items-center gap-2"><List className="w-4 h-4 text-ccb-primary" /> Move History</span>
                      <ChevronRight className="w-4 h-4 text-ccb-muted" />
                    </button>
                    <button
                      onClick={toggleSound}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg bg-ccb-surface hover:bg-ccb-card text-xs font-medium transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        {soundOn ? <Volume2 className="w-4 h-4 text-ccb-primary" /> : <VolumeX className="w-4 h-4 text-ccb-muted" />} Sound
                      </span>
                      <span className="text-ccb-muted">{soundOn ? "On" : "Off"}</span>
                    </button>
                    {!gameEnded ? (
                      <button
                        onClick={() => { setActiveSheet(null); setShowResignConfirm(true); }}
                        className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-ccb-danger/10 text-ccb-danger hover:bg-ccb-danger/20 text-xs font-medium transition-colors"
                      >
                        <Flag className="w-4 h-4" /> Resign Game
                      </button>
                    ) : (
                      <button
                        onClick={() => { setActiveSheet(null); handleNewGame(); }}
                        className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-ccb-primary/10 text-ccb-primary hover:bg-ccb-primary/20 text-xs font-medium transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" /> New Game
                      </button>
                    )}
                  </div>
                )}

                {activeSheet === "moves" && (
                  <>
                    {moveHistory.length >= 2 && <div className="mb-2"><OpeningBadge moves={moveHistory} /></div>}
                    <div className="rounded-lg bg-ccb-surface/50 border border-ccb-border/50 px-2 py-1.5">
                      <MoveScroller moves={moveHistory} currentPly={viewPly} onPlyChange={setViewPly} />
                    </div>
                  </>
                )}

                {activeSheet === "theme" && <BoardThemePicker inline onThemeChange={setBoardTheme} />}
              </div>
            </div>
          )}
        </div>

        {/* ===== Desktop-only sidebar ===== */}
        <div className="hidden lg:flex lg:flex-col lg:w-[280px] lg:shrink-0 lg:h-full lg:py-2 gap-3">
          <div className="flex flex-col gap-3 h-full overflow-y-auto no-scrollbar">
            {/* Status header with controls */}
            <div className="card flex items-center justify-between shrink-0">
              <Link href="/play" className="text-sm text-ccb-muted hover:text-ccb-primary flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </Link>
              <div className="flex items-center gap-2">
                <button onClick={toggleSound} className="text-ccb-muted hover:text-ccb-primary transition-colors p-1" title={soundOn ? "Mute" : "Unmute"}>
                  {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <BoardThemePicker onThemeChange={setBoardTheme} />
              </div>
            </div>

            {/* AI status */}
            <div className="card flex items-center gap-2 shrink-0">
              <Bot className="w-4 h-4 text-ccb-primary" />
              <span className="text-sm text-ccb-muted">{aiThinking ? "Thinking..." : DIFFICULTY_LABELS[difficulty]}</span>
            </div>

            {/* Opening detection */}
            {moveHistory.length >= 2 && <div className="shrink-0"><OpeningBadge moves={moveHistory} /></div>}

            {/* Move history */}
            <div className="flex-1 min-h-0">
              <div className="rounded-lg bg-ccb-surface/50 border border-ccb-border/50 px-2 py-1.5">
                <MoveScroller moves={moveHistory} currentPly={viewPly} onPlyChange={setViewPly} />
              </div>
            </div>

            {/* Footer info */}
            <div className="text-center text-xs text-ccb-muted shrink-0">
              Move {moveCount} · {DIFFICULTY_LABELS[difficulty]} · vs Computer
            </div>
          </div>
        </div>
      </div>

      <PromotionDialog
        visible={!!pendingPromotion}
        color={playerColor}
        onSelect={handlePromotionSelect}
        onCancel={() => setPendingPromotion(null)}
      />

      <VictoryOverlay
        visible={gameEnded && !overlayDismissed}
        outcome={(winner === null ? "draw" : winner === playerColor ? "win" : "loss") as GameOutcome}
        reasonLabel={STATUS_LABELS[status] || status}
        moveCount={moveCount}
        subtitle={`${DIFFICULTY_LABELS[difficulty]} · vs Computer`}
        onPlayAgain={handlePlayAgain}
        onNewGame={handleNewGame}
        newGameLabel="Rematch Bot"
        adPlacement="game_results"
        onReview={() => setOverlayDismissed(true)}
      />
    </>
  );
}
