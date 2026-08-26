"use client";

import { useEffect, useState } from "react";

interface PreGameCountdownProps {
  scheduledStart: string | null;
  whiteName: string;
  blackName: string;
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
  /** When true, renders as a translucent overlay on top of the board. When false, renders as a standalone full-screen card. */
  overlay?: boolean;
}

export default function PreGameCountdown({
  scheduledStart,
  whiteName,
  blackName,
  whiteAvatar,
  blackAvatar,
  overlay = false,
}: PreGameCountdownProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!scheduledStart) return;
    const start = new Date(scheduledStart).getTime();

    const update = () => {
      const diff = Math.max(0, Math.floor((start - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [scheduledStart]);

  if (secondsLeft === null) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isUrgent = secondsLeft <= 30;

  // ── Overlay mode: translucent panel on top of the board ──
  if (overlay) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-ccb-bg/80 backdrop-blur-sm rounded-lg">
        <div className="text-center px-6 py-6 max-w-xs w-full">
          {/* Player VS strip */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex flex-col items-center gap-1">
              {whiteAvatar && (
                <img src={whiteAvatar} alt={whiteName} className="w-10 h-10 rounded-full ring-2 ring-ccb-primary/40" />
              )}
              <span className="text-xs font-semibold text-ccb-foreground truncate max-w-[80px]">{whiteName}</span>
            </div>
            <span className="text-lg font-bold text-ccb-muted">vs</span>
            <div className="flex flex-col items-center gap-1">
              {blackAvatar && (
                <img src={blackAvatar} alt={blackName} className="w-10 h-10 rounded-full ring-2 ring-ccb-primary/40" />
              )}
              <span className="text-xs font-semibold text-ccb-foreground truncate max-w-[80px]">{blackName}</span>
            </div>
          </div>

          {/* Countdown timer */}
          <div className="mb-3">
            <p className="text-xs text-ccb-muted mb-1">Game starts in</p>
            <div className={`text-5xl font-bold tabular-nums ${isUrgent ? "text-red-500 animate-pulse" : "text-ccb-primary"}`}>
              {minutes}:{seconds.toString().padStart(2, "0")}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-center gap-2 text-xs text-ccb-muted">
            <span className="w-2 h-2 rounded-full bg-ccb-primary animate-pulse" />
            <span>{secondsLeft > 0 ? "Waiting for countdown" : "Starting now…"}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Standalone mode (original full-screen card) ──
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-ccb-card border border-ccb-border rounded-3xl p-8 max-w-md w-full text-center">
        {/* VS header */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="flex flex-col items-center gap-2">
            {whiteAvatar && (
              <img src={whiteAvatar} alt={whiteName} className="w-12 h-12 rounded-full" />
            )}
            <span className="text-sm font-semibold text-ccb-foreground">{whiteName}</span>
          </div>
          <span className="text-xl font-bold text-ccb-muted">vs</span>
          <div className="flex flex-col items-center gap-2">
            {blackAvatar && (
              <img src={blackAvatar} alt={blackName} className="w-12 h-12 rounded-full" />
            )}
            <span className="text-sm font-semibold text-ccb-foreground">{blackName}</span>
          </div>
        </div>

        {/* Countdown */}
        <div className="mb-6">
          <p className="text-sm text-ccb-muted mb-2">Game starts in</p>
          <div className={`text-6xl font-bold tabular-nums ${isUrgent ? "text-red-500 animate-pulse" : "text-ccb-primary"}`}>
            {minutes}:{seconds.toString().padStart(2, "0")}
          </div>
        </div>

        {/* Status message */}
        {secondsLeft > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-ccb-muted">
              {isUrgent
                ? "Get ready! The game is about to start."
                : "Take a seat and wait for the clock to start."}
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-ccb-muted">
              <span className="w-2 h-2 rounded-full bg-ccb-primary animate-pulse" />
              <span>Waiting for scheduled start time</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-ccb-primary font-semibold animate-pulse">
              Starting now...
            </p>
            <p className="text-xs text-ccb-muted">
              The game will begin momentarily. Stay on this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
