"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Handshake, Frown, RefreshCw, Home, Swords, Cherry, ScanSearch, Clock } from "lucide-react";
import FireworksCanvas from "./fireworks-canvas";

export type GameOutcome = "win" | "loss" | "draw" | "abort";

interface VictoryOverlayProps {
  visible: boolean;
  outcome: GameOutcome;
  reasonLabel: string;
  ratingChange?: number | null;
  moveCount: number;
  subtitle: string;
  berriesAwarded?: number;
  onNewGame?: () => void;
  onRematch?: () => void;
  onReview?: () => void;
  newGameLabel?: string;
  lobbyHref?: string;
}

export default function VictoryOverlay({
  visible,
  outcome,
  reasonLabel,
  ratingChange,
  moveCount,
  subtitle,
  berriesAwarded,
  onNewGame,
  onRematch,
  onReview,
  newGameLabel = "New Game",
  lobbyHref = "/play",
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

  // Color scheme per outcome
  const accent = isWin ? "#a78bfa" : isDraw ? "#94a3b8" : isAbort ? "#64748b" : "#f87171";
  const accentBg = isWin ? "rgba(167,139,250,0.12)" : isDraw ? "rgba(148,163,184,0.1)" : isAbort ? "rgba(100,116,139,0.1)" : "rgba(248,113,113,0.1)";
  const accentBorder = isWin ? "rgba(167,139,250,0.3)" : isDraw ? "rgba(148,163,184,0.2)" : isAbort ? "rgba(100,116,139,0.2)" : "rgba(248,113,113,0.25)";

  const headline = isWin ? "Victory" : isDraw ? "Draw" : isAbort ? "Aborted" : "Defeat";
  const headline2 = isWin ? "You Won" : isDraw ? "Game Drawn" : isAbort ? "Game Aborted" : "You Lost";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-400 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      style={{
        backgroundColor: "rgba(6,6,12,0.85)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* Fireworks layer */}
      {(isWin || isDraw) && (
        <FireworksCanvas active={mounted} colorTheme={isWin ? "win" : "draw"} />
      )}

      {/* Card */}
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
        {/* Accent ring at top */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full flex items-center justify-center transition-transform duration-500"
          style={{
            backgroundColor: "rgba(15,15,22,0.95)",
            border: `2px solid ${accent}`,
            boxShadow: `0 0 24px ${accentBg}`,
          }}
        >
          {isWin && <Trophy className="h-7 w-7" style={{ color: accent }} />}
          {isDraw && <Handshake className="h-7 w-7" style={{ color: accent }} />}
          {isAbort && <Clock className="h-7 w-7" style={{ color: accent }} />}
          {isLoss && <Frown className="h-7 w-7" style={{ color: accent }} />}
        </div>

        {/* Headline */}
        <div className="mt-6">
          <h2
            className="text-2xl font-extrabold tracking-tight leading-none"
            style={{ color: accent }}
          >
            {headline}
          </h2>
          <p className="text-sm text-white/50 mt-1.5 font-medium">{headline2}</p>
        </div>

        {/* Divider */}
        <div
          className="my-4 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accentBorder}, transparent)` }}
        />

        {/* Stats row */}
        <div className="flex items-center justify-center gap-6 mb-4">
          {/* Reason */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">Result</span>
            <span className="text-sm font-semibold text-white/80">{reasonLabel}</span>
          </div>
          {/* Rating change — hidden for aborts (no rating change) */}
          {ratingChange !== null && ratingChange !== undefined && !isAbort && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">Rating</span>
              <span
                className="text-sm font-bold"
                style={{ color: ratingChange >= 0 ? "#4ade80" : "#f87171" }}
              >
                {ratingChange >= 0 ? "+" : ""}{ratingChange}
              </span>
            </div>
          )}
          {/* Move count */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">Moves</span>
            <span className="text-sm font-semibold text-white/80">{moveCount}</span>
          </div>
        </div>

        {/* Subtitle */}
        <p className="text-xs text-white/35 mb-5">{subtitle}</p>

        {/* Buttons */}
        <div
          className={`flex flex-col gap-2 transition-all duration-400 ${
            showButtons ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          {onNewGame && (
            <button
              onClick={onNewGame}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: accent,
                color: "#0a0a0f",
                boxShadow: `0 4px 20px ${accentBg}`,
              }}
            >
              <RefreshCw className="w-4 h-4" /> {newGameLabel}
            </button>
          )}
          {onRematch && (
            <button
              onClick={onRematch}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: accentBg,
                color: accent,
                border: `1px solid ${accentBorder}`,
              }}
            >
              <Swords className="w-4 h-4" /> Rematch
            </button>
          )}
          {onReview && (
            <button
              onClick={onReview}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <ScanSearch className="w-4 h-4" /> Review Moves
            </button>
          )}
          <Link
            href={lobbyHref}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {onNewGame ? <Home className="w-4 h-4" /> : <Swords className="w-4 h-4" />}
            {onNewGame ? "Back to Lobby" : "Play Again"}
          </Link>
        </div>
      </div>
    </div>
  );
}
