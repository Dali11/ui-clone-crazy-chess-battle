"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { customPieces } from "@/lib/game/piece-styles";
import { Chess } from "chess.js";
import { useRealtimeGame, type GameState } from "@/hooks/use-realtime-game";
import { Clock, Flag, Eye, ArrowLeft, Volume2, VolumeX, Palette, X, MessageCircle, MoreVertical, Handshake, ChevronLeft, ChevronRight, Swords, RefreshCw, Radio, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { getCapturedPieces, getCheckSquare, getSeamlessBoardStyles } from "@/lib/game/board-helpers";
import { playSound, detectMoveSound, setSoundEnabled } from "@/lib/game/sound";
import { getStoredBoardTheme, type BoardTheme } from "@/lib/game/board-themes";
import { useBoardSize } from "@/hooks/use-board-size";
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll";
import { useRematch } from "@/hooks/use-rematch";
import MoveScroller from "./move-scroller";
import CapturedPieces from "./captured-pieces";
import VictoryOverlay, { type GameOutcome, type RematchState } from "./victory-overlay";
import SpectatorLanding from "./spectator-landing";
import PromotionDialog from "./promotion-dialog";
import BoardThemePicker from "./board-theme-picker";
import OpeningBadge from "./opening-badge";
import GameChat from "./game-chat";
import PreGameCountdown from "./pre-game-countdown";
import { getAbortSeconds, BATTLE_FIRST_MOVE_GRACE_SECONDS, BATTLE_REPLY_GRACE_SECONDS } from "@/lib/game/abort-config";
import PlayerProfilePreview from "./player-profile-preview";
import PlayerBar from "./player-bar";
import { formatClock } from "./utils";
import { moneySymbol } from "@/lib/geo/format";
import type { BattleInfo, GameClientProps, SheetType } from "./types";
import { STATUS_LABELS } from "./types";

// Connection status indicator — chess.com-style: a tiny live icon in the
// game header, nothing more. Green when the realtime socket is healthy,
// amber-pulsing while it reconnects, red when the browser itself reports
// no network (navigator.onLine + online/offline events, so it reacts to
// the device's actual connection state, not just our socket heuristics).
// Deliberately subtle: no banner, no pill, no text.
function ConnectionStatus({ quality }: { quality: "online" | "reconnecting" | "offline" }) {
  const [browserOnline, setBrowserOnline] = useState(true);

  useEffect(() => {
    setBrowserOnline(navigator.onLine);
    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const effective = !browserOnline ? "offline" : quality;

  if (effective === "offline") {
    return <WifiOff className="w-3.5 h-3.5 text-red-500 animate-pulse shrink-0" aria-label="No internet connection" />;
  }
  if (effective === "reconnecting") {
    return <WifiOff className="w-3.5 h-3.5 text-amber-500 animate-pulse shrink-0" aria-label="Reconnecting" />;
  }
  return <Wifi className="w-3.5 h-3.5 text-emerald-500/70 shrink-0" aria-label="Connected" />;
}


export default function GameClient({ gameId, initialGame, currentUserId, isSpectator = false, whiteName = "White", blackName = "Black", whiteAvatar, blackAvatar, whiteCountry, blackCountry, battleInfo, tournamentId, countryCode }: GameClientProps) {
  const { game, connected, connectionQuality, drawOffer, makeMove, resign, checkTimeout, offerDraw, acceptDraw, declineDraw, spectatorCount } = useRealtimeGame(gameId, initialGame, currentUserId);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Skip the redundant spectator landing gate if the user already confirmed
  // "Watch Match" once upstream (e.g. from the challenge-taken screen) —
  // arriving here with ?spectate=1 means don't ask them to click again.
  const skipSpectatorLanding = searchParams.get("spectate") === "1";
  const [fen, setFen] = useState(game.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [viewPly, setViewPly] = useState(0);
  const [victoryDismissed, setVictoryDismissed] = useState(false);
  const [spectatorLandingDismissed, setSpectatorLandingDismissed] = useState(skipSpectatorLanding);

  const [reviewFen, setReviewFen] = useState<string | null>(null);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(getStoredBoardTheme());
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [premovePromotion, setPremovePromotion] = useState<{ from: string; to: string } | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<string[]>([]);
  // Premove queue — chess.com-style, unlimited length. Each entry plays on
  // its own turn (first entry plays now, the rest stay queued for our
  // subsequent turns as the opponent replies).
  const [premoves, setPremoves] = useState<{ from: string; to: string }[]>([]);
  // True once we've auto-played a premove this turn — prevents the queue
  // effect from firing the whole chain back-to-back while the realtime
  // hook's myTurn is still stale-true (it only flips after the server
  // broadcast confirms the opponent replied).
  const playedThisTurnRef = useRef(false);
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [clockTick, setClockTick] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const [desktopTab, setDesktopTab] = useState<"moves" | "chat">("moves");
  const [armageddonGameId, setArmageddonGameId] = useState<string | null>(null);
  // League XP earned from this game (shown on the end-of-game screen).
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [armageddonLoading, setArmageddonLoading] = useState(false);
  const [armageddonForfeiting, setArmageddonForfeiting] = useState(false);
  const [armageddonError, setArmageddonError] = useState(false);
  const chatVisibleMobile = activeSheet === "chat";
  const chatVisibleDesktop = desktopTab === "chat";
  const lastFenRef = useRef(game.fen);
  const soundPlayedForEnd = useRef(false);
  const prevFenRef = useRef(game.fen);
  // 0.94: board gets ~3% breathing room per side on phones/tablets so
  // squares stay slightly smaller than full-width (was edge-to-edge ~55-56px
  // on mobile). Snapped to a multiple of 8 by the hook, so still seam-free.
  const { containerRef: boardContainerRef, size: boardSize } = useBoardSize(600, 220, 8, 0.94);

  const TERMINAL_STATUSES = ["checkmate", "stalemate", "draw", "resign", "timeout", "abort"];
  const gameEnded = TERMINAL_STATUSES.includes(game.status);

  const {
    rematchState, rematchStake, incomingRematch,
    handleRematch, handleCancelRematch,
    handleAcceptIncomingRematch, handleDeclineIncomingRematch,
  } = useRematch({ gameId: game.id, gameEnded, isSpectator });

  // If the player dismissed the overlay to review the board but an incoming rematch offer
  // arrives, bring the overlay back so they can see Accept/Decline.
  useEffect(() => {
    if (incomingRematch) setVictoryDismissed(false);
  }, [incomingRematch]);

  useLockBodyScroll();

  useEffect(() => {
    if (drawOffer === "offer") {
      // opponentDrawOffer handled in UI
    }
  }, [drawOffer]);

  const isWhite = game.white_player_id === currentUserId;
  const isBlack = game.black_player_id === currentUserId;
  const myTurn = (isWhite && game.turn === "white") || (isBlack && game.turn === "black");
  // Only these are genuinely terminal. "waiting" (pre-game countdown, used by
  // tournament pairings before their scheduled_start) is NOT one of them —
  // treating it as ended (the old `!== "playing"` check did) fired the
  // Victory/Draw overlay during the countdown itself, showing a bogus
  // "Draw · 0 moves" result before the game had even started.
  const isLiveView = moveHistory.length === 0 || viewPly >= moveHistory.length;
  const displayFen = reviewFen ?? fen;

  // Clocks now start ticking as soon as the game transitions to "playing"
  // (last_move_at is set by the tournament cron at that moment).

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
  const isTournamentGame = !!tournamentId;
  const moneyEarned = isBattleGame && didIWin ? (battleInfo?.winnerPayout ?? 0) : undefined;

  // Battle draw → Armageddon: the backend already auto-creates the sudden-death
  // game as soon as the draw is settled, but we gate the redirect behind an
  // explicit player choice instead of yanking them straight into it. Poll
  // battle status until the new armageddon game shows up.
  // League XP: fetch what this game earned once it ends (3 win / 1 draw /
  // 0 loss). The server award is fire-and-forget, so retry briefly until
  // the event row lands. Losses and bot games stay 0 → nothing is shown.
  useEffect(() => {
    if (!gameEnded || isSpectator) return;
    let cancelled = false;
    const attempt = async () => {
      try {
        const res = await fetch(`/api/league/xp/game-earned?gameId=${gameId}&kind=chess`);
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
  }, [gameEnded, isSpectator, gameId]);

  const isBattleDraw = isBattleGame && gameEnded && game.winner === null && game.status !== "abort";
  useEffect(() => {
    if (!isBattleDraw || !battleInfo?.battleId || isSpectator) return;
    let cancelled = false;
    setArmageddonLoading(true);
    setArmageddonGameId(null);

    const poll = async () => {
      try {
        const res = await fetch(`/api/battles/status?battleId=${battleInfo.battleId}`);
        if (!res.ok) return;
        const data = await res.json();
        const newGameId = data.armageddonGameId as string | null;
        if (newGameId && newGameId !== gameId && !cancelled) {
          setArmageddonGameId(newGameId);
          setArmageddonLoading(false);
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 1500);
    // Timeout after 30s — if backend hasn't created armageddon game, bail out
    const timeout = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        clearInterval(interval);
        setArmageddonLoading(false);
        setArmageddonError(true);
      }
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isBattleDraw, battleInfo?.battleId, isSpectator, gameId]);

  const handleStartArmageddon = useCallback(() => {
    if (armageddonGameId) router.push(`/game/${armageddonGameId}`);
  }, [armageddonGameId, router]);

  const handleResignArmageddon = useCallback(async () => {
    if (!armageddonGameId || armageddonForfeiting) return;
    setArmageddonForfeiting(true);
    try {
      const res = await fetch("/api/game/resign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: armageddonGameId }),
      });
      if (res.ok) {
        router.push("/battles");
      } else {
        setArmageddonForfeiting(false);
      }
    } catch {
      setArmageddonForfeiting(false);
    }
  }, [armageddonGameId, armageddonForfeiting, router]);

  const captured = useMemo(() => getCapturedPieces(displayFen), [displayFen]);
  const checkSquare = useMemo(() => getCheckSquare(displayFen), [displayFen]);

  useEffect(() => {
    if (prevFenRef.current !== game.fen && !pendingPromotion) {
      // Guard: never pass null/undefined fen to chess.js — it calls
      // fen.split(/\s+/) inside load() and crashes with
      // "Cannot read properties of null (reading 'split')"
      const safePrev = prevFenRef.current || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const safeFen = game.fen || safePrev;
      try {
        const tempGame = new Chess(safePrev);
        const nextGame = new Chess(safeFen);
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

  // Auto-redirect to tournament page after game ends (tournament games only, non-spectators)
  useEffect(() => {
    if (!gameEnded || !isTournamentGame || isSpectator || victoryDismissed) return;
    const timer = setTimeout(() => {
      if (tournamentId) router.push(`/tournament/${tournamentId}`);
    }, 4000);
    return () => clearTimeout(timer);
  }, [gameEnded, isTournamentGame, isSpectator, victoryDismissed, tournamentId, router]);

  useEffect(() => {
    setFen(game.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
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

  // Show past position when reviewing moves (same pattern as computer game).
  //
  // BUGFIX: the two early-return branches below used to leave `lastMove`
  // untouched, so the purple "last move" highlight kept showing whatever
  // squares were highlighted for the PREVIOUSLY reviewed ply — stuck on
  // stale squares that don't correspond to any move visible in the
  // position now on screen (reported as "board looks off / not evenly
  // divided": a highlighted square with no piece movement to justify it
  // reads as a rendering glitch). Every branch now recomputes `lastMove`
  // from whatever position is actually being displayed, so the highlight
  // always matches what's on the board.
  useEffect(() => {
    if (viewPly === 0 || moveHistory.length === 0) {
      setReviewFen(null);
      setLastMove(null); // start of the game — nothing to highlight yet
      return;
    }
    if (viewPly >= moveHistory.length) {
      setReviewFen(null);
      // Back at the live position — recompute from the full move list
      // instead of leaving the highlight stuck on a reviewed ply.
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
    // Premove queue — every queued premove gets the amber highlight
    const queuedPremoves = premovePromotion ? [...premoves, { from: premovePromotion.from, to: premovePromotion.to }] : premoves;
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
  }, [lastMove, checkSquare, legalMoveSquares, selectedSquare, premoves, premovePromotion, isLiveView]);

  const getLiveClock = (player: "white" | "black") => {
    if (!game.last_move_at || !game.white_clock_ms || !game.black_clock_ms) return "—";
    // Clock starts ticking as soon as the game is "playing" (last_move_at
    // is set by the tournament cron at that moment). No first-move exemption.
    if (gameEnded || game.turn !== player) {
      return formatClock(player === "white" ? game.white_clock_ms : game.black_clock_ms);
    }
    const elapsed = Date.now() - new Date(game.last_move_at).getTime();
    void clockTick;
    const baseMs = player === "white" ? game.white_clock_ms : game.black_clock_ms;
    return formatClock(Math.max(0, baseMs - elapsed));
  };

  // No-show countdown: while move_count is 0 (white hasn't moved) or 1
  // (black hasn't responded), surface a visible countdown so both players
  // know the timer is ticking. The thresholds MUST mirror the server's
  // early-move enforcement exactly (/api/game/timeout-check and the
  // /api/game/timeout cron sweep) so the countdown actually resolves when
  // it hits zero — previously the UI promised 2:00 but the server only
  // enforced the full clock, so the countdown ran out and nothing happened.
  //   move 0 casual: getAbortSeconds(time_control) — bullet aborts at 30s
  //   move 0 tournament: 2 minutes (cron auto-resign)
  //   move 0 battle: BATTLE_FIRST_MOVE_GRACE_SECONDS (2 min) — but battles
  //     begin in a 2-minute "waiting" join window with frozen clocks first,
  //     so an absent player's total grace is window + 2 min
  //   move 1 (reply): 2 minutes casual/tournament, BATTLE_REPLY_GRACE_SECONDS battle
  const noShowInfo = useMemo(() => {
    if (gameEnded || game.status !== "playing") return null;
    if (game.move_count !== 0 && game.move_count !== 1) return null;
    const timerStartRaw = game.last_move_at || game.created_at;
    if (!timerStartRaw) return null;
    void clockTick; // re-run every second
    const thresholdMs =
      game.move_count === 0
        ? isBattleGame
          ? BATTLE_FIRST_MOVE_GRACE_SECONDS * 1000
          : isTournamentGame
            ? 2 * 60 * 1000
            : getAbortSeconds(game.time_control) * 1000
        : isBattleGame
          ? BATTLE_REPLY_GRACE_SECONDS * 1000
          : 2 * 60 * 1000;
    const elapsed = Date.now() - new Date(timerStartRaw).getTime();
    const remainingMs = thresholdMs - elapsed;
    return {
      remainingSec: Math.max(0, Math.ceil(remainingMs / 1000)),
      noShowPlayer: game.turn as "white" | "black",
    };
  }, [game.move_count, game.last_move_at, game.created_at, game.turn, game.status, gameEnded, clockTick, isTournamentGame, isBattleGame]);

  const isPromotionMove = useCallback((from: string, to: string): boolean => {
    const game2 = new Chess(fen);
    const piece = game2.get(from as any);
    if (!piece || piece.type !== "p") return false;
    const rank = to[1];
    return (piece.color === "w" && rank === "8") || (piece.color === "b" && rank === "1");
  }, [fen]);

  // Generate OUR piece's move destinations even when it's not our turn.
  // chess.js moves() only returns moves for the side to move, so during
  // the opponent's turn our pieces would get an EMPTY move list — which is
  // exactly why tap-to-move premoves never worked (drag premoves bypass
  // the legal-move list entirely). Fix: swap the turn field in the FEN
  // (and strip en-passant, which belongs to the opponent) and ask "if it
  // were my turn right now, where could this piece go?" These are premove
  // CANDIDATES only — every premove is re-validated against the real
  // position when it actually executes, so pseudo-legal is fine here.
  const getPremoveMoves = useCallback((square: string): string[] => {
    try {
      const parts = fen.split(" ");
      parts[1] = isWhite ? "w" : "b";
      parts[3] = "-";
      const game = new Chess(parts.join(" "));
      return game.moves({ square: square as any, verbose: true }).map((m: any) => m.to);
    } catch {
      return [];
    }
  }, [fen, isWhite]);

  // PURE SELECTION LOGIC — never executes moves. react-chessboard fires
  // onPieceClick AND the bubbled onSquareClick for the same piece tap on
  // desktop, so executing here would double-fire every capture tap. All
  // move and premove execution lives in handleSquareClick, which fires
  // exactly once per tap.
  const handlePieceClick = useCallback(({ square, piece }: { square: string | null; piece: { pieceType: string } | null }) => {
    if (isSpectator || gameEnded || !isLiveView) return;

    if (!piece || !square) {
      // Clicked empty board — clear selection, cancel queued premoves
      if (premoves.length > 0 || premovePromotion) {
        setPremoves([]);
        setPremovePromotion(null);
      }
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
    if (!myTurn) {
      const game = new Chess(fen);
      const squarePiece = game.get(square as any);
      if (!squarePiece) return;
      const isMyPiece = (isWhite && squarePiece.color === "w") || (isBlack && squarePiece.color === "b");
      if (!isMyPiece) {
        // Clicked opponent piece — cancel any queued premoves
        if (premoves.length > 0 || premovePromotion) {
          setPremoves([]);
          setPremovePromotion(null);
        }
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
      // piece's destinations even though it's the opponent's turn —
      // chess.js would otherwise return an empty list here, which is why
      // tap premoves never registered.
      setSelectedSquare(square);
      setLegalMoveSquares(getPremoveMoves(square));
      return;
    }

    // It's our turn — select the piece if it's ours
    const game = new Chess(fen);
    const squarePiece = game.get(square as any);
    if (!squarePiece) return;
    const isMyPiece = (isWhite && squarePiece.color === "w") || (isBlack && squarePiece.color === "b");
    if (!isMyPiece) {
      // Clicked an opponent piece that isn't a capture target — deselect
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
  }, [isSpectator, myTurn, gameEnded, fen, isWhite, isBlack, isLiveView, selectedSquare, legalMoveSquares, premoves, premovePromotion, getPremoveMoves]);

  // ALL move and premove execution lives here. react-chessboard fires
  // onSquareClick exactly once per tap — for empty squares directly, and
  // for piece squares via bubbling (on mobile the touch handler fires it
  // directly and suppresses the synthetic click). Making this the single
  // execution point guarantees a tap can never double-fire a move.
  const handleSquareClick = useCallback(({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
    // Legal move target of the current selection — execute or queue
    if (selectedSquare && square !== selectedSquare && legalMoveSquares.includes(square)) {
      if (myTurn) {
        if (isPromotionMove(selectedSquare, square)) {
          setPendingPromotion({ from: selectedSquare, to: square });
        } else {
          const prevFen = fen;
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
              makeMove(selectedSquare, square).then((res: any) => {
                if (!res?.success) {
                  setFen(prevFen);
                  setMoveHistory((prev) => prev.slice(0, -1));
                  setViewPly((prev) => Math.max(0, prev - 1));
                  setLastMove(null);
                }
              });
            }
          } catch {}
        }
      } else {
        // Not our turn — queue a premove via tap-to-move. No limit on
        // chain length (chess.com-style: keep stacking, each plays on its
        // own turn).
        if (isPromotionMove(selectedSquare, square)) {
          setPremovePromotion({ from: selectedSquare, to: square });
        } else {
          setPremoves((prev) => [...prev, { from: selectedSquare, to: square }]);
        }
      }
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return;
    }
    // Everything else (selection, deselect, premove cancel) — defer
    handlePieceClick({ square, piece });
  }, [selectedSquare, legalMoveSquares, myTurn, isPromotionMove, fen, makeMove, handlePieceClick]);

  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean => {
      if (isSpectator || gameEnded) return false;
      if (!isLiveView) return false;
      if (myTurn) {
        if (isPromotionMove(sourceSquare, targetSquare)) {
          setPendingPromotion({ from: sourceSquare, to: targetSquare });
          return false;
        }
        const prevFen = fen;
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
        // Send to server, roll back on failure
        makeMove(sourceSquare, targetSquare).then((res: any) => {
          if (!res?.success) {
            setFen(prevFen);
            setMoveHistory((prev) => prev.slice(0, -1));
            setViewPly((prev) => Math.max(0, prev - 1));
            setLastMove(null);
          }
        });
        return true;
      }
      if (!targetSquare) return false;
      // Dragging a piece onto its own queued premove target cancels the
      // whole queue ("undo the premove")
      if (premoves.some((p) => p.from === sourceSquare && p.to === targetSquare)) {
        setPremoves([]);
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
        // Queue the drag as a premove — no limit (chess.com-style chain).
        // If this piece already has a queued premove, the new drag
        // replaces it instead of leaving two destinations for one piece.
        setPremoves((prev) => [
          ...prev.filter((p) => p.from !== sourceSquare),
          { from: sourceSquare, to: targetSquare },
        ]);
      }
      return true;
    },
    [isSpectator, myTurn, gameEnded, fen, makeMove, isPromotionMove, isWhite, isBlack, isLiveView, premoves]
  );

  const handlePromotionSelect = useCallback((piece: "q" | "r" | "b" | "n") => {
    if (pendingPromotion) {
      const prevFen = fen;
      const promoFrom = pendingPromotion.from;
      const promoTo = pendingPromotion.to;
      try {
        const tempGame = new Chess(fen);
        const move = tempGame.move({ from: promoFrom, to: promoTo, promotion: piece });
        if (move) {
          setFen(tempGame.fen());
          setMoveHistory((prev) => [...prev, move.san]);
          setViewPly((prev) => prev + 1);
          setLastMove({ from: promoFrom, to: promoTo });
          playSound(detectMoveSound(move));
        }
      } catch {}
      makeMove(promoFrom, promoTo, piece).then((res: any) => {
        if (!res?.success) {
          setFen(prevFen);
          setMoveHistory((prev) => prev.slice(0, -1));
          setViewPly((prev) => Math.max(0, prev - 1));
          setLastMove(null);
        }
      });
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

  // Auto-execute the premove queue when it becomes our turn — chess.com
  // behavior: only the FIRST queued premove plays; the rest stay queued for
  // our subsequent turns as the opponent replies. If the first premove is
  // no longer legal (piece captured, self-check, etc.) the whole chain is
  // cancelled — a broken chain shouldn't half-execute.
  //
  // CRITICAL: use game.fen (from the realtime hook) not local fen.
  // When the opponent moves, game.fen is already updated in the same render
  // that flips myTurn to true, but local fen won't sync until a separate
  // effect runs on the NEXT render. Using local fen here means chess.js sees
  // the position where it's still the opponent's turn → move() returns null →
  // the premove is silently discarded before fen ever catches up.
  //
  // playedThisTurnRef guarantees we never play two of our own moves in one
  // turn: myTurn stays true until the server broadcast confirms the opponent
  // replied, and without this guard the effect would happily fire the whole
  // queue back-to-back the moment setPremoves() re-triggers it.
  useEffect(() => {
    if (!myTurn) {
      playedThisTurnRef.current = false;
      return;
    }
    if (gameEnded) return;
    if (premovePromotion) {
      // The queued premove is a promotion — show the picker now that it's
      // actually our turn (same dialog as a normal promotion move).
      setPendingPromotion({ from: premovePromotion.from, to: premovePromotion.to });
      setPremovePromotion(null);
      return;
    }
    const first = premoves[0];
    if (!first || playedThisTurnRef.current) return;
    playedThisTurnRef.current = true;
    try {
      const chess = new Chess(game.fen);
      const move = chess.move({ from: first.from, to: first.to, promotion: "q" });
      if (move !== null) {
        setFen(chess.fen());
        setMoveHistory((prev) => [...prev, move.san]);
        setViewPly((prev) => prev + 1);
        setLastMove({ from: first.from, to: first.to });
        playSound(detectMoveSound(move));
        if (chess.inCheck() && !chess.isCheckmate()) {
          setTimeout(() => playSound("check"), 100);
        }
        makeMove(first.from, first.to).then((res: any) => {
          if (!res?.success) {
            // Premove rejected by server — board will auto-correct from server state
          }
        });
        // Executed — keep the rest of the queue for our next turns. Chained
        // promotions beyond the first are auto-queened here (the picker only
        // applies to a premove detectable at queue time; deeper chain entries
        // can't be detected until their position actually exists).
        setPremoves((prev) => prev.slice(1));
        return;
      }
      // move === null → the premove is no longer legal on the new position
      // (e.g. the piece was captured, or the move would be self-check).
      // The chain is broken — cancel everything, standard chess.com behavior.
    } catch {
      // Invalid position or move — cancel the queue
    }
    setPremoves([]);
  }, [myTurn, premoves, premovePromotion, game.fen, gameEnded, makeMove]);

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
    // For battle games, re-join the battle queue with same stake + time control
    if (isBattleGame && battleInfo?.stake) {
      try {
        const res = await fetch("/api/battles/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stake: battleInfo.stake, timeControl: tcIdFromGame }),
        });
        const data = await res.json();
        if (data.matched && data.battleId) {
          // Opponent found immediately — go to the battle
          const statusRes = await fetch(`/api/battles/status?battleId=${data.battleId}`);
          if (statusRes.ok) {
            router.push(`/battles`);
          } else {
            router.push("/battles");
          }
        } else {
          // No immediate match — go to battles page which shows searching state
          router.push("/battles");
        }
      } catch {
        router.push("/battles");
      }
      return;
    }
    // For regular games, use matchmaking as before
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



  const renderPlayerBar = (data: { name: string; userId?: string; avatar?: string | null; country?: string | null; rating?: number | string | null; ratingChange?: number | null; captured: string[]; advantage: number; clock: string; isActive: boolean; symbol: string }) => (
    <PlayerBar
      name={data.name}
      userId={data.userId}
      avatar={data.avatar}
      country={data.country}
      rating={data.rating}
      ratingChange={data.ratingChange}
      captured={data.captured}
      advantage={data.advantage}
      clock={data.clock}
      isActive={data.isActive}
      symbol={data.symbol}
      gameEnded={gameEnded}
      onPreview={setPreviewUserId}
    />
  );

  // Computed once, above boardColumn's definition, so its closure never hits
  // the temporal dead zone — previously this was declared separately inside
  // each branch (spectator vs player), and since boardColumn's closure binds
  // to the outer scope, calling it from the spectator branch (which returns
  // before ever reaching the player-view declaration) threw "Cannot access
  // 'isWaiting' before initialization".
  const isWaiting = game.status === "waiting" && game.scheduled_start;

  // Memoized board element — identity stays stable across the 1s clock
  // tick, chat unread updates, draw-offer state, spectator counts, etc.
  // React bails out of reconciling the 64-square board subtree entirely
  // when the element reference is unchanged. Previously every clock tick
  // rebuilt the whole board (64 squares + dnd-kit tree) mid-drag, which
  // caused visible piece stutter on low-end phones — the "pieces stuck
  // in mud" report. Only genuinely board-relevant deps are listed.
  // Computed fresh each render (cheap: one function call) so it always
  // reflects the latest boardSize/theme — memoized below via chessboardElement's deps.
  const seamlessBoardStyles = getSeamlessBoardStyles(boardTheme.dark, boardTheme.light, boardSize);

  const chessboardElement = useMemo(() => (
    <Chessboard
      options={{
        position: displayFen,
        pieces: customPieces,
        boardOrientation: isWhite || isSpectator ? "white" : "black",
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          if (!targetSquare) return false;
          return onDrop(sourceSquare, targetSquare);
        },
        allowDragging: !gameEnded && !isSpectator && isLiveView && !isWaiting,
        squareStyles: squareStyles,
        showAnimations: false,
        animationDurationInMs: 0,
        showNotation: true,
        darkSquareNotationStyle: { color: boardTheme.light, fontSize: "10px", fontWeight: 600 },
        lightSquareNotationStyle: { color: boardTheme.dark, fontSize: "10px", fontWeight: 600 },
        onPieceClick: handlePieceClick,
        onSquareClick: handleSquareClick,
        ...seamlessBoardStyles,
        boardStyle: { ...seamlessBoardStyles.boardStyle, borderRadius: "6px", overflow: "hidden" },
      }}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [displayFen, isWhite, isSpectator, gameEnded, isLiveView, isWaiting, squareStyles, boardTheme, boardSize, onDrop, handlePieceClick, handleSquareClick]);

  // ============ SHARED BOARD COLUMN ============
  const boardColumn = (topPlayer: any, bottomPlayer: any, showControls: boolean) => (
    <div className="relative flex flex-col h-full w-full lg:w-[600px] lg:max-w-[600px] lg:h-auto lg:shrink-0 lg:my-auto">
      {/* Mobile top bar */}
      <div className="lg:hidden shrink-0 flex items-center justify-between px-3 pt-[max(0.875rem,env(safe-area-inset-top))] pb-2 h-auto min-h-12 border-b border-ccb-border">
        <Link href="/play" className="p-1.5 -ml-1.5 text-ccb-muted hover:text-ccb-primary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-1.5">
          {isSpectator && <Eye className="w-3.5 h-3.5 text-ccb-muted" />}
          <Swords className="w-3.5 h-3.5 text-ccb-primary" />
          <span className="text-sm font-bold text-ccb-text">Crazy Chess Battles</span>
        </div>
        <div className="flex items-center gap-0.5">
          <ConnectionStatus quality={connectionQuality} />
          <button
            onClick={() => window.location.reload()}
            className="p-1.5 -mr-1 text-ccb-muted hover:text-ccb-primary"
            title="Refresh if the board looks stuck"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => toggleSheet("menu")} className="p-1.5 -mr-1.5 text-ccb-muted hover:text-ccb-primary">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Moves + opening area — fixed height slot, nothing enters/leaves flow */}
      <div className="relative max-w-[600px] mx-auto w-full px-2 py-1 h-[62px]">
        {/* Move scroller — pinned to bottom of the fixed-height slot */}
        <div className="absolute bottom-1 inset-x-2 rounded-lg bg-ccb-surface/50 border border-ccb-border/50 px-2 py-1.5">
          <MoveScroller moves={moveHistory} currentPly={viewPly} onPlyChange={setViewPly} />
        </div>

        {/* Spectator count — subtle muted text in the top of the moves slot
            (the move scroller itself is pinned to the bottom). Moved out of
            the game header to keep the header clean, chess.com-style. */}
        {spectatorCount > 0 && !gameEnded && (
          <div className="absolute top-0.5 right-3 z-10 flex items-center gap-1 text-[11px] text-ccb-muted pointer-events-none">
            <Eye className="w-3 h-3" /> {spectatorCount} watching
          </div>
        )}

        {/* No-show countdown — visible to both players while the game is
            waiting on White's opening move or Black's reply. Turns red and
            starts pulsing in the final 30 seconds. */}
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
      </div>

      {/* Opponent bar */}
      {renderPlayerBar(topPlayer)}

      {/* Board */}
      <div ref={boardContainerRef} className="relative flex-1 min-h-0 flex items-center justify-center px-2 py-1">
        <div style={{ width: boardSize, height: boardSize, colorScheme: "light" }} className="relative">
          {chessboardElement}
          {isWaiting && (
            <PreGameCountdown
              scheduledStart={game.scheduled_start ?? null}
              whiteName={whiteName}
              blackName={blackName}
              whiteAvatar={whiteAvatar}
              blackAvatar={blackAvatar}
              whiteRating={game.white_rating ?? undefined}
              blackRating={game.black_rating ?? undefined}
              waitingLabel={
                isBattleGame
                  ? "Waiting for both players to join — starts the moment you're both on the board"
                  : undefined
              }
              overlay
            />
          )}

          {/* "Return to live" now lives in the toolbar — no floating overlay to block buttons */}
        </div>
      </div>

      {/* Your bar */}
      {renderPlayerBar(bottomPlayer)}

      {/* Draw offer banner — floats over the board, never affects layout */}
      {drawOffer === "offer" && !isSpectator && !gameEnded && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-ccb-surface/95 border border-ccb-primary/40 shadow-2xl backdrop-blur-md max-w-[90%]">
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

      {/* Draw offer pending — floats over the board, never affects layout */}
      {drawOffer === "pending" && !isSpectator && !gameEnded && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl bg-ccb-surface/95 border border-ccb-border shadow-2xl backdrop-blur-md">
            <div className="w-4 h-4 border-2 border-ccb-muted border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-ccb-muted">Waiting for opponent to respond…</span>
            <button onClick={declineDraw} className="ml-auto text-sm text-ccb-muted hover:text-ccb-danger underline">Cancel</button>
          </div>
        </div>
      )}

      {/* Desktop resign/draw controls — fixed height slot, content may disappear without shifting */}
      <div className="hidden lg:flex items-center justify-center gap-3 max-w-[600px] mx-auto mt-2 h-11 shrink-0">
        {showControls && !gameEnded && (
          <>
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
          </>
        )}
      </div>

      {/* Mobile bottom toolbar — chess.com style: live play shows Chat/Draw/Resign,
          finished games switch to Options/Chat/Back/Forward for reviewing moves */}
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
            {!isLiveView && (
              <button
                onClick={() => { setReviewFen(null); setViewPly(moveHistory.length); }}
                className="flex flex-col items-center gap-0.5 flex-1 py-1 text-ccb-primary"
              >
                <Radio className="w-5 h-5" /><span className="text-[10px] font-bold">Live</span>
              </button>
            )}
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

      {/* Dimming backdrop behind the mobile sheet — without this, the sheet's
          card background sat directly on the board/countdown with no visual
          separation, so it was unclear where the page ended and the chat
          panel began. Tapping the dimmed area closes the sheet, same as the
          menu dropdown below. */}
      {activeSheet && activeSheet !== "menu" && (
        <div
          className="lg:hidden absolute inset-0 z-40 bg-black/50 animate-fade-in"
          onClick={() => setActiveSheet(null)}
        />
      )}

      {/* Mobile bottom sheet (Chat + Theme) — GameChat stays mounted (just hidden)
          so its realtime channel subscribes as soon as the game loads, not only
          once the sheet is opened. Otherwise messages sent before both players
          have opened chat at least once are silently lost (broadcast has no
          persistence/history). */}
      <div className={`lg:hidden absolute inset-x-2 bottom-16 z-50 max-h-[45%] rounded-2xl border border-ccb-border bg-ccb-card shadow-2xl flex flex-col overflow-hidden ${activeSheet && activeSheet !== "menu" ? "animate-sheet-up" : "hidden"}`}>
        {/* Drag-handle bar — standard bottom-sheet affordance, makes it read
            unmistakably as a floating panel rather than part of the board */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-ccb-border" />
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-ccb-border shrink-0">
          <span className="text-sm font-semibold text-ccb-text">
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
            <Link href="/history" className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-ccb-surface transition-colors text-sm">
              <span>Game History</span>
              <Clock className="w-4 h-4 text-ccb-muted" />
            </Link>
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
          <div className="flex items-center gap-3">
            <Link href="/play" className="text-sm text-ccb-muted hover:text-ccb-primary flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <Link href="/history" className="text-sm text-ccb-muted hover:text-ccb-primary flex items-center gap-1">
              <Clock className="w-4 h-4" /> History
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            {isSpectator && <span className="flex items-center gap-1 text-xs text-ccb-muted"><Eye className="w-3.5 h-3.5" />Spectating</span>}
            <ConnectionStatus quality={connectionQuality} />
            <Swords className="w-4 h-4 text-ccb-primary" />
            <span className="text-sm font-bold text-ccb-text">Crazy Chess Battles</span>
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
    const topPlayer = { name: blackName, userId: game.black_player_id, avatar: blackAvatar, country: blackCountry, rating: game.black_rating, ratingChange: game.black_rating_change, captured: captured.black, advantage: -captured.advantage, clock: getLiveClock("black"), isActive: game.turn === "black" && !gameEnded, symbol: "♚" };
    const bottomPlayer = { name: whiteName, userId: game.white_player_id, avatar: whiteAvatar, country: whiteCountry, rating: game.white_rating, ratingChange: game.white_rating_change, captured: captured.white, advantage: captured.advantage, clock: getLiveClock("white"), isActive: game.turn === "white" && !gameEnded, symbol: "♔" };

    return (
      <>
        <div className="game-viewport -my-4 sm:-my-6 -mx-4 sm:-mx-6 flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-4">
          {boardColumn(topPlayer, bottomPlayer, false)}
          {renderDesktopSidebar()}
        </div>

        <PromotionDialog visible={!!pendingPromotion} color={isWhite ? "white" : "black"} onSelect={handlePromotionSelect} onCancel={() => setPendingPromotion(null)} />
        <SpectatorLanding
          visible={isSpectator && !gameEnded && !spectatorLandingDismissed}
          whiteName={whiteName}
          blackName={blackName}
          whiteAvatar={whiteAvatar}
          blackAvatar={blackAvatar}
          whiteRating={game.white_rating ?? undefined}
          blackRating={game.black_rating ?? undefined}
          timeControl={game.time_control}
          moveCount={game.move_count}
          onWatch={() => setSpectatorLandingDismissed(true)}
        />
        <VictoryOverlay
          visible={gameEnded && !victoryDismissed}
          outcome={(game.status === "abort" ? "abort" : game.winner === null ? "draw" : game.winner === (isWhite ? "white" : "black") ? "win" : "loss") as GameOutcome}
          reasonLabel={STATUS_LABELS[game.status] || game.status}
          ratingChange={myRatingChange}
          moneyEarned={moneyEarned}
          moneyLabel={isBattleGame ? "Battle winnings" : undefined}
          xpEarned={xpEarned}
          adPlacement={isBattleGame ? "battle_settlement" : "game_results"}
          moveCount={game.move_count}
          subtitle={`${game.time_control} · ${isTournamentGame ? "Tournament" : game.rated ? "Ranked" : "Casual"}${isBattleGame ? " · Staked" : ""}`}
          playerNames={{ white: whiteName, black: blackName }}
          winnerSide={game.winner as "white" | "black" | null}
          lobbyHref={isTournamentGame ? `/tournament/${tournamentId}` : isBattleGame ? "/battles" : "/play"}
          newGameLabel={isTournamentGame ? "Back to Tournament" : isBattleGame ? "New Match" : "New Game"}
          playAgainLabel={isTournamentGame ? "Back to Tournament" : isBattleGame ? "New Match" : "Play Again"}
          isArmageddonDraw={isBattleDraw}
          armageddonLoading={armageddonLoading}
          armageddonError={armageddonError}
          armageddonForfeiting={armageddonForfeiting}
          onStartArmageddon={isBattleDraw && armageddonGameId ? handleStartArmageddon : undefined}
          onResignArmageddon={isBattleDraw && armageddonGameId ? handleResignArmageddon : undefined}
          onPlayAgain={isBattleDraw ? undefined : !isSpectator && !isTournamentGame ? handlePlayAgain : isTournamentGame ? () => router.push(`/tournament/${tournamentId}`) : undefined}
          onRematch={!isSpectator && !isTournamentGame && !isBattleDraw && game.status !== "abort" && !incomingRematch ? handleRematch : undefined}
          rematchState={rematchState}
          onCancelRematch={rematchState.status === "waiting" ? handleCancelRematch : undefined}
          onAcceptRematch={incomingRematch && !isSpectator ? handleAcceptIncomingRematch : undefined}
          onDeclineRematch={incomingRematch && !isSpectator ? handleDeclineIncomingRematch : undefined}
          rematchStake={rematchStake}
          incomingRematchStake={incomingRematch?.stake || 0}
          incomingRematchError={incomingRematch?.error}
          onReview={() => setVictoryDismissed(true)}
          onDismiss={() => setVictoryDismissed(true)}
        />

        {previewUserId && (
          <PlayerProfilePreview userId={previewUserId} onClose={() => setPreviewUserId(null)} />
        )}
      </>
    );
  }

  // ============ PLAYER VIEW (also used for waiting state — countdown overlays the board) ============
  const playerData = isWhite
    ? { name: blackName, userId: game.black_player_id, avatar: blackAvatar, country: blackCountry, rating: game.black_rating, ratingChange: game.black_rating_change, captured: captured.black, advantage: -captured.advantage, clock: getLiveClock("black"), isActive: game.turn === "black" && !gameEnded, symbol: "♚" }
    : { name: whiteName, userId: game.white_player_id, avatar: whiteAvatar, country: whiteCountry, rating: game.white_rating, ratingChange: game.white_rating_change, captured: captured.white, advantage: captured.advantage, clock: getLiveClock("white"), isActive: game.turn === "white" && !gameEnded, symbol: "♔" };

  const myData = isWhite
    ? { name: whiteName, userId: game.white_player_id, avatar: whiteAvatar, country: whiteCountry, rating: game.white_rating, ratingChange: game.white_rating_change, captured: captured.white, advantage: captured.advantage, clock: getLiveClock("white"), isActive: game.turn === "white" && !gameEnded, symbol: "♔" }
    : { name: blackName, userId: game.black_player_id, avatar: blackAvatar, country: blackCountry, rating: game.black_rating, ratingChange: game.black_rating_change, captured: captured.black, advantage: -captured.advantage, clock: getLiveClock("black"), isActive: game.turn === "black" && !gameEnded, symbol: "♚" };

  return (
    <>
      <div className="game-viewport -my-4 sm:-my-6 -mx-4 sm:-mx-6 flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-4">
        {boardColumn(playerData, myData, true)}
        {renderDesktopSidebar()}
      </div>

      <PromotionDialog visible={!!pendingPromotion} color={isWhite ? "white" : "black"} onSelect={handlePromotionSelect} onCancel={() => setPendingPromotion(null)} />
      <VictoryOverlay
        visible={gameEnded && !victoryDismissed}
        outcome={(game.status === "abort" ? "abort" : game.winner === null ? "draw" : game.winner === (isWhite ? "white" : "black") ? "win" : "loss") as GameOutcome}
        reasonLabel={STATUS_LABELS[game.status] || game.status}
        ratingChange={myRatingChange}
        moneyEarned={moneyEarned}
        moneyLabel={isBattleGame ? "Battle winnings" : undefined}
        xpEarned={xpEarned}
        adPlacement={isBattleGame ? "battle_settlement" : "game_results"}
        moveCount={game.move_count}
        subtitle={`${game.time_control} · ${isTournamentGame ? "Tournament" : game.rated ? "Ranked" : "Casual"}${isBattleGame ? " · Staked" : ""}`}
        playerNames={{ white: whiteName, black: blackName }}
        winnerSide={game.winner as "white" | "black" | null}
        lobbyHref={isTournamentGame ? `/tournament/${tournamentId}` : isBattleGame ? "/battles" : "/play"}
        newGameLabel={isTournamentGame ? "Back to Tournament" : isBattleGame ? "New Match" : "New Game"}
        playAgainLabel={isTournamentGame ? "Back to Tournament" : isBattleGame ? "New Match" : "Play Again"}
        isArmageddonDraw={isBattleDraw}
        armageddonLoading={armageddonLoading}
        armageddonForfeiting={armageddonForfeiting}
        onStartArmageddon={isBattleDraw && armageddonGameId ? handleStartArmageddon : undefined}
        onResignArmageddon={isBattleDraw && armageddonGameId ? handleResignArmageddon : undefined}
        onPlayAgain={isBattleDraw ? undefined : isTournamentGame ? () => router.push(`/tournament/${tournamentId}`) : handlePlayAgain}
        onRematch={!isTournamentGame && !isBattleDraw && game.status !== "abort" && !incomingRematch ? handleRematch : undefined}
        rematchState={rematchState}
        onCancelRematch={rematchState.status === "waiting" ? handleCancelRematch : undefined}
        onAcceptRematch={incomingRematch ? handleAcceptIncomingRematch : undefined}
        onDeclineRematch={incomingRematch ? handleDeclineIncomingRematch : undefined}
        rematchStake={rematchStake}
        incomingRematchStake={incomingRematch?.stake || 0}
        incomingRematchError={incomingRematch?.error}
        onReview={() => setVictoryDismissed(true)}
        onDismiss={() => setVictoryDismissed(true)}
      />

      {previewUserId && (
        <PlayerProfilePreview userId={previewUserId} onClose={() => setPreviewUserId(null)} />
      )}
    </>
  );
}
