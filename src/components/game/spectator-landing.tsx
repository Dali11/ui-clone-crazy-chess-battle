"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Eye, Swords, Clock } from "lucide-react";

interface SpectatorLandingProps {
  visible: boolean;
  whiteName: string;
  blackName: string;
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
  whiteRating?: number;
  blackRating?: number;
  timeControl?: string;
  moveCount?: number;
  onWatch: () => void;
}

/**
 * Compact landing screen shown to spectators when they arrive at an
 * in-progress game. Shows the matchup (Arthur ⚔️ Amanda), a primary
 * Watch Match CTA, secondary actions (New Game / Staked Battle), and a
 * subtle Adsterra banner ad slot at the bottom.
 *
 * Dismissed by tapping "Watch Match" — then the board is revealed.
 */
export default function SpectatorLanding({
  visible,
  whiteName,
  blackName,
  whiteAvatar,
  blackAvatar,
  whiteRating,
  blackRating,
  timeControl,
  moveCount,
  onWatch,
}: SpectatorLandingProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setMounted(true), 10);
      return () => clearTimeout(t);
    }
    setMounted(false);
  }, [visible]);

  if (!visible) return null;

  const wName = whiteName || "White";
  const bName = blackName || "Black";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${mounted ? "opacity-100" : "opacity-0"}`}
      style={{ backgroundColor: "rgba(6,6,12,0.92)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <div
        className={`relative w-[90%] max-w-[360px] rounded-2xl border border-ccb-border bg-ccb-card shadow-2xl p-5 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
        }`}
        style={{ boxShadow: "0 20px 60px -10px rgba(167,139,250,0.12), 0 0 0 1px rgba(167,139,250,0.15)" }}
      >
        {/* Spectator badge */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-ccb-primary/10 text-ccb-primary">
            <Eye className="w-3 h-3" /> Spectating
          </span>
        </div>

        {/* Matchup — crossed swords */}
        <div className="flex items-center justify-center gap-3 mb-4">
          {/* White player */}
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="w-12 h-12 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden">
              {whiteAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={whiteAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-ccb-muted">{wName[0]?.toUpperCase()}</span>
              )}
            </div>
            <p className="text-sm font-bold text-ccb-text text-center leading-tight truncate max-w-full">{wName}</p>
            {whiteRating ? <span className="text-[10px] text-ccb-muted">{whiteRating}</span> : null}
          </div>

          {/* Crossed swords */}
          <div className="flex flex-col items-center shrink-0">
            <Swords className="w-5 h-5 text-ccb-primary" />
          </div>

          {/* Black player */}
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="w-12 h-12 rounded-full bg-ccb-dark border border-ccb-border flex items-center justify-center overflow-hidden">
              {blackAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={blackAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-white/70">{bName[0]?.toUpperCase()}</span>
              )}
            </div>
            <p className="text-sm font-bold text-ccb-text text-center leading-tight truncate max-w-full">{bName}</p>
            {blackRating ? <span className="text-[10px] text-ccb-muted">{blackRating}</span> : null}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-center gap-3 mb-5 text-[10px] text-ccb-muted">
          {timeControl && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {timeControl}
            </span>
          )}
          {moveCount !== undefined && moveCount > 0 && (
            <span>{moveCount} moves played</span>
          )}
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
          </span>
        </div>

        {/* Primary action — Watch Match */}
        <button
          onClick={onWatch}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold bg-ccb-primary text-white hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Eye className="w-4 h-4" /> Watch Match
        </button>

        {/* Secondary actions — compact row, no icons */}
        <div className="flex gap-2 mt-2">
          <Link
            href="/play"
            className="flex-1 flex items-center justify-center rounded-xl py-2.5 text-xs font-semibold bg-ccb-surface border border-ccb-border text-ccb-text hover:bg-ccb-surface/70 transition-colors"
          >
            New Game
          </Link>
          <Link
            href="/battles"
            className="flex-1 flex items-center justify-center rounded-xl py-2.5 text-xs font-semibold bg-ccb-surface border border-ccb-border text-ccb-text hover:bg-ccb-surface/70 transition-colors"
          >
            Staked Battle
          </Link>
        </div>

        {/* Subtle Adsterra banner ad slot */}
        <div className="mt-4 pt-3 border-t border-ccb-border/50">
          <div
            className="w-full overflow-hidden rounded-lg flex items-center justify-center"
            style={{ minHeight: "50px", maxHeight: "50px" }}
            data-adsterra-slot
          >
            {/* Adsterra banner will inject here. Placeholder shown until loaded. */}
            <span className="text-[9px] text-ccb-muted/40 uppercase tracking-wider">Ad</span>
          </div>
        </div>
      </div>
    </div>
  );
}
