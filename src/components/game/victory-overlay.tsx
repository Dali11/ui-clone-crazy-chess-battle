"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Handshake, Frown, RefreshCw, Home, Swords, Cherry, ScanSearch, Clock, Wallet, Check, X, Loader2 } from "lucide-react";
import FireworksCanvas from "./fireworks-canvas";

export type GameOutcome = "win" | "loss" | "draw" | "abort";

export interface RematchState {
  status: "idle" | "sending" | "waiting" | "accepted" | "declined" | "cancelled" | "expired";
  offerId?: string;
  gameId?: string;
}

interface VictoryOverlayProps {
  visible: boolean;
  outcome: GameOutcome;
  reasonLabel: string;
  ratingChange?: number | null;
  moveCount: number;
  subtitle: string;
  playerNames?: { white: string; black: string };
  winnerSide?: "white" | "black" | null;
  berriesAwarded?: number;
  moneyEarned?: number;     // in MWK
  moneyLabel?: string;       // e.g. "Battle winnings"
  onNewGame?: () => void;
  onRematch?: () => void;
  onReview?: () => void;
  onPlayAgain?: () => void;
  onCancelRematch?: () => void;
  onAcceptRematch?: () => void;
  onDeclineRematch?: () => void;
  onDismiss?: () => void;
  rematchState?: RematchState;
  newGameLabel?: string;
  playAgainLabel?: string;
  lobbyHref?: string;
  // Battle draw → Armageddon: staked draws can't just end — a sudden-death
  // decider is required. These gate that flow behind an explicit choice.
  isArmageddonDraw?: boolean;
  armageddonLoading?: boolean;
  armageddonError?: boolean;
  armageddonForfeiting?: boolean;
  onStartArmageddon?: () => void;
  onResignArmageddon?: () => void;
}

export default function VictoryOverlay({
  visible,
  outcome,
  reasonLabel,
  ratingChange,
  moveCount,
  subtitle,
  berriesAwarded = 0,
  moneyEarned,
  moneyLabel = "Battle winnings",
  playerNames,
  winnerSide,
  onNewGame,
  onRematch,
  onReview,
  onPlayAgain,
  onCancelRematch,
  onAcceptRematch,
  onDeclineRematch,
  onDismiss,
  rematchState = { status: "idle" },
  newGameLabel = "New Game",
  playAgainLabel = "Play Again",
  lobbyHref = "/play",
  isArmageddonDraw = false,
  armageddonLoading = false,
  armageddonError = false,
  armageddonForfeiting = false,
  onStartArmageddon,
  onResignArmageddon,
}: VictoryOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [showButtons, setShowButtons] = useState(false);

  useEffect(() => {
    if (visible) {
      const t1 = setTimeout(() => setMounted(true), 20);
      const t2 = setTimeout(() => setShowButtons(true), 500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    setMounted(false);
    setShowButtons(false);
  }, [visible]);

  if (!visible) return null;

  const isWin = outcome === "win";
  const isDraw = outcome === "draw";
  const isLoss = outcome === "loss";
  const isAbort = outcome === "abort";

  const accent = isWin ? "#a78bfa" : isDraw ? "#94a3b8" : isAbort ? "#64748b" : "#f87171";
  const accentBg = isWin ? "rgba(167,139,250,0.12)" : isDraw ? "rgba(148,163,184,0.1)" : isAbort ? "rgba(100,116,139,0.1)" : "rgba(248,113,113,0.1)";
  const accentBorder = isWin ? "rgba(167,139,250,0.3)" : isDraw ? "rgba(148,163,184,0.2)" : isAbort ? "rgba(100,116,139,0.2)" : "rgba(248,113,113,0.25)";

  const headline = isWin ? "Victory" : isDraw ? "Draw" : isAbort ? "Aborted" : "Defeat";
  const headline2 = isWin ? "You Won" : isDraw ? "Game Drawn" : isAbort ? "Game Aborted" : "You Lost";

  const hasEarnings = (isWin && (berriesAwarded > 0 || (moneyEarned !== undefined && moneyEarned > 0)));

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-400 ${mounted ? "opacity-100" : "opacity-0"}`}
      style={{ backgroundColor: "rgba(6,6,12,0.85)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
    >
      {(isWin || isDraw) && <FireworksCanvas active={mounted} colorTheme={isWin ? "win" : "draw"} />}

      <div
        className={`relative w-[88%] max-w-[340px] rounded-2xl border p-6 text-center shadow-2xl transition-all duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "-translate-y-8 scale-95 opacity-0"
        }`}
        style={{
          backgroundColor: "rgba(15,15,22,0.95)",
          borderColor: accentBorder,
          boxShadow: `0 20px 60px -10px ${accentBg}, 0 0 0 1px ${accentBorder}`,
        }}
      >
        {/* Dismiss button — lets players close the overlay to review the board/moves underneath */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Accent ring */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full flex items-center justify-center transition-transform duration-500"
          style={{ backgroundColor: "rgba(15,15,22,0.95)", border: `2px solid ${accent}`, boxShadow: `0 0 24px ${accentBg}` }}
        >
          {isWin && <Trophy className="h-7 w-7" style={{ color: accent }} />}
          {isDraw && <Handshake className="h-7 w-7" style={{ color: accent }} />}
          {isAbort && <Clock className="h-7 w-7" style={{ color: accent }} />}
          {isLoss && <Frown className="h-7 w-7" style={{ color: accent }} />}
        </div>

        {/* Headline */}
        <div className="mt-6">
          <h2 className="text-2xl font-extrabold tracking-tight leading-none" style={{ color: accent }}>{headline}</h2>
          <p className="text-sm text-white/50 mt-1.5 font-medium">{headline2}</p>
        </div>

        {/* Player names — the actual winning side is celebrated, regardless of viewer's own color */}
        {playerNames && (() => {
          // Fall back to viewer-perspective if winnerSide wasn't passed (e.g. draw/abort, or legacy callers)
          const whiteIsWinner = winnerSide ? winnerSide === "white" : isWin;
          const blackIsWinner = winnerSide ? winnerSide === "black" : (!isWin && !isDraw && !isAbort);
          return (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-sm">
              <span className={`inline-flex items-center gap-1 font-semibold ${whiteIsWinner ? "text-white" : "text-white/50"}`}>
                {whiteIsWinner && <Trophy className="h-3.5 w-3.5" style={{ color: accent }} />}
                {playerNames.white}
              </span>
              <span className="text-white/30 text-xs font-medium">vs</span>
              <span className={`inline-flex items-center gap-1 font-semibold ${blackIsWinner ? "text-white" : "text-white/50"}`}>
                {blackIsWinner && <Trophy className="h-3.5 w-3.5" style={{ color: accent }} />}
                {playerNames.black}
              </span>
            </div>
          );
        })()}

        {/* Divider */}
        <div className="my-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accentBorder}, transparent)` }} />

        {/* Earnings section — money + berries */}
        {hasEarnings && (
          <div className="mb-4 flex items-center justify-center gap-4">
            {moneyEarned !== undefined && moneyEarned > 0 && (
              <div className="flex flex-col items-center px-3 py-2 rounded-xl" style={{ backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <span className="text-[10px] uppercase tracking-wider text-emerald-400/70 font-semibold mb-0.5 flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> {moneyLabel}
                </span>
                <span className="text-lg font-extrabold text-emerald-400">MK {moneyEarned.toLocaleString()}</span>
              </div>
            )}
            {berriesAwarded > 0 && (
              <div className="flex flex-col items-center px-3 py-2 rounded-xl" style={{ backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <span className="text-[10px] uppercase tracking-wider text-orange-400/70 font-semibold mb-0.5 flex items-center gap-1">
                  <Cherry className="w-3 h-3" /> Berries
                </span>
                <span className="text-lg font-extrabold text-orange-400">+{berriesAwarded}</span>
              </div>
            )}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-center gap-6 mb-4">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">Result</span>
            <span className="text-sm font-semibold text-white/80">{reasonLabel}</span>
          </div>
          {ratingChange !== null && ratingChange !== undefined && !isAbort && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">Rating</span>
              <span className="text-sm font-bold" style={{ color: ratingChange >= 0 ? "#4ade80" : "#f87171" }}>
                {ratingChange >= 0 ? "+" : ""}{ratingChange}
              </span>
            </div>
          )}
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">Moves</span>
            <span className="text-sm font-semibold text-white/80">{moveCount}</span>
          </div>
        </div>

        <p className="text-xs text-white/35 mb-5">{subtitle}</p>

        {/* Battle draw → mandatory Armageddon decider */}
        {isArmageddonDraw && (
          <div className="mb-4 px-4 py-3 rounded-xl text-left" style={{ backgroundColor: accentBg, border: `1px solid ${accentBorder}` }}>
            <p className="text-xs leading-relaxed text-white/70">
              <span className="font-bold" style={{ color: accent }}>Sudden-death Armageddon:</span>{" "}
              this battle can&apos;t end in a draw with money on the line. A decider game starts now with{" "}
              <span className="font-semibold text-white/90">half the time</span> — first to win takes the whole pot.
            </p>
          </div>
        )}

        {/* Rematch waiting state */}
        {rematchState.status === "waiting" && (
          <div className="mb-3 px-4 py-3 rounded-xl flex items-center justify-center gap-2" style={{ backgroundColor: accentBg, border: `1px solid ${accentBorder}` }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: accent }} />
            <span className="text-sm font-medium" style={{ color: accent }}>Waiting for opponent...</span>
            {onCancelRematch && (
              <button onClick={onCancelRematch} className="ml-2 text-xs text-white/40 hover:text-white/70 underline">Cancel</button>
            )}
          </div>
        )}

        {/* Rematch accepted — redirecting */}
        {rematchState.status === "accepted" && rematchState.gameId && (
          <div className="mb-3 px-4 py-3 rounded-xl flex items-center justify-center gap-2" style={{ backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <Check className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">Opponent accepted! Starting game...</span>
          </div>
        )}

        {/* Rematch declined */}
        {rematchState.status === "declined" && (
          <div className="mb-3 px-4 py-3 rounded-xl flex items-center justify-center gap-2" style={{ backgroundColor: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}>
            <X className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">Opponent declined the rematch</span>
          </div>
        )}

        {/* Buttons */}
        <div className={`flex flex-col gap-2 transition-all duration-400 ${showButtons ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
          {/* Rematch button — only show when idle, not waiting/accepted/declined */}
          {onRematch && (rematchState.status === "idle" || rematchState.status === "declined" || rematchState.status === "cancelled" || rematchState.status === "expired") && (
            <button
              onClick={onRematch}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: accentBg, color: accent, border: `1px solid ${accentBorder}` }}
            >
              <Swords className="w-4 h-4" /> Rematch
            </button>
          )}

          {/* Rematch sending state */}
          {rematchState.status === "sending" && (
            <button disabled className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold opacity-60" style={{ backgroundColor: accentBg, color: accent, border: `1px solid ${accentBorder}` }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Sending offer...
            </button>
          )}

          {onAcceptRematch && (
            <button
              onClick={onAcceptRematch}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}
            >
              <Check className="w-4 h-4" /> Accept Rematch
            </button>
          )}

          {onDeclineRematch && (
            <button
              onClick={onDeclineRematch}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}
            >
              <X className="w-4 h-4" /> Decline
            </button>
          )}

          {/* Battle draw → Armageddon action buttons */}
          {isArmageddonDraw && armageddonLoading && !armageddonError && !onStartArmageddon && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-white/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              Preparing armageddon...
            </div>
          )}
          {isArmageddonDraw && armageddonError && (
            <div className="mb-3 px-4 py-3 rounded-xl text-center" style={{ backgroundColor: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}>
              <p className="text-sm text-red-400 mb-2">Could not start Armageddon game.</p>
              <button
                onClick={() => onDismiss?.()}
                className="text-xs text-white/50 hover:text-white/80 underline"
              >
                Back to battles
              </button>
            </div>
          )}
          {onStartArmageddon && (
            <button
              onClick={onStartArmageddon}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: "#a78bfa", color: "#0a0a0f", boxShadow: "0 4px 20px rgba(167,139,250,0.3)" }}
            >
              <Swords className="w-4 h-4" /> Start Armageddon Battle
            </button>
          )}
          {onResignArmageddon && (
            <button
              onClick={onResignArmageddon}
              disabled={armageddonForfeiting}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              style={{ backgroundColor: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}
            >
              {armageddonForfeiting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              {armageddonForfeiting ? "Forfeiting..." : "Resign (Forfeit Battle)"}
            </button>
          )}

          {onPlayAgain && (
            <button
              onClick={onPlayAgain}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: accent, color: "#0a0a0f", boxShadow: `0 4px 20px ${accentBg}` }}
            >
              <Swords className="w-4 h-4" /> {playAgainLabel}
            </button>
          )}

          {onNewGame && (
            <button
              onClick={onNewGame}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <RefreshCw className="w-4 h-4" /> {newGameLabel}
            </button>
          )}

          {onReview && (
            <button
              onClick={onReview}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <ScanSearch className="w-4 h-4" /> Review Moves
            </button>
          )}

          <Link
            href={lobbyHref}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Home className="w-4 h-4" /> Back to Lobby
          </Link>
        </div>
      </div>
    </div>
  );
}
