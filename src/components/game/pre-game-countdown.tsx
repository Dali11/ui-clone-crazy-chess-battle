"use client";

import { useEffect, useState } from "react";

interface PreGameCountdownProps {
  scheduledStart: string | null;
  whiteName: string;
  blackName: string;
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
  whiteRating?: number | null;
  blackRating?: number | null;
  /** When true, renders as a translucent overlay on top of the board. When false, renders as a standalone full-screen card. */
  overlay?: boolean;
}

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

/** Avatar + name + rating, wrapped in its own solid card so it stays legible
 * regardless of what's showing through the blurred board behind it. */
function PlayerBadge({
  name,
  avatar,
  rating,
}: {
  name: string;
  avatar?: string | null;
  rating?: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-ccb-surface/95 border border-ccb-border shadow-lg backdrop-blur-sm min-w-[92px]">
      {avatar ? (
        <img
          src={avatar}
          alt={name}
          className="w-11 h-11 rounded-full ring-2 ring-ccb-primary/50 object-cover"
        />
      ) : (
        <div className="w-11 h-11 rounded-full ring-2 ring-ccb-primary/50 bg-ccb-primary/15 flex items-center justify-center text-sm font-bold text-ccb-primary">
          {initials(name)}
        </div>
      )}
      <span className="text-xs font-semibold text-ccb-foreground truncate max-w-[84px] text-center">
        {name}
      </span>
      {rating != null && (
        <span className="text-[10px] font-medium text-ccb-muted -mt-1">({rating})</span>
      )}
    </div>
  );
}

export default function PreGameCountdown({
  scheduledStart,
  whiteName,
  blackName,
  whiteAvatar,
  blackAvatar,
  whiteRating,
  blackRating,
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

  // ── Overlay mode: sits on top of the board ──
  if (overlay) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center rounded-lg overflow-hidden">
        {/* Strong solid backdrop — the board underneath should read as a
            faint texture, not a distracting, half-legible game of pieces. */}
        <div className="absolute inset-0 bg-ccb-surface/90 backdrop-blur-md" />
        {/* Soft brand-colored glow behind the VS badge for depth */}
        <div className="absolute w-56 h-56 rounded-full bg-ccb-primary/10 blur-3xl" />

        <div className="relative text-center px-4 py-6 w-full flex flex-col items-center">
          {/* Player VS strip — each side is its own solid card so names/avatars
              always stay legible no matter what's behind them */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <PlayerBadge name={whiteName} avatar={whiteAvatar} rating={whiteRating} />
            <span className="text-sm font-bold text-ccb-muted px-1.5 py-1 rounded-full bg-ccb-surface/70 border border-ccb-border/70">
              vs
            </span>
            <PlayerBadge name={blackName} avatar={blackAvatar} rating={blackRating} />
          </div>

          {/* Countdown timer */}
          <div className="mb-3">
            <p className="text-xs text-ccb-text/80 font-semibold mb-1 tracking-wide uppercase">Game starts in</p>
            <div
              className={`text-5xl font-bold tabular-nums ${
                isUrgent ? "text-red-500 animate-pulse" : "text-ccb-primary"
              }`}
            >
              {minutes}:{seconds.toString().padStart(2, "0")}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-center gap-2 text-xs text-ccb-muted px-3 py-1 rounded-full bg-ccb-surface/70 border border-ccb-border/50">
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
            {whiteAvatar ? (
              <img src={whiteAvatar} alt={whiteName} className="w-12 h-12 rounded-full ring-2 ring-ccb-primary/40 object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full ring-2 ring-ccb-primary/40 bg-ccb-primary/15 flex items-center justify-center text-sm font-bold text-ccb-primary">
                {initials(whiteName)}
              </div>
            )}
            <span className="text-sm font-semibold text-ccb-foreground">{whiteName}</span>
            {whiteRating != null && <span className="text-xs text-ccb-muted">({whiteRating})</span>}
          </div>
          <span className="text-xl font-bold text-ccb-muted">vs</span>
          <div className="flex flex-col items-center gap-2">
            {blackAvatar ? (
              <img src={blackAvatar} alt={blackName} className="w-12 h-12 rounded-full ring-2 ring-ccb-primary/40 object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full ring-2 ring-ccb-primary/40 bg-ccb-primary/15 flex items-center justify-center text-sm font-bold text-ccb-primary">
                {initials(blackName)}
              </div>
            )}
            <span className="text-sm font-semibold text-ccb-foreground">{blackName}</span>
            {blackRating != null && <span className="text-xs text-ccb-muted">({blackRating})</span>}
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
