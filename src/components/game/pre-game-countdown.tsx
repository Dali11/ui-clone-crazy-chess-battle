"use client";

import { useEffect, useState } from "react";

interface PreGameCountdownProps {
  scheduledStart: string | null;
  whiteName: string;
  blackName: string;
  whiteAvatar?: string | null;
  blackAvatar?: string | null;
}

export default function PreGameCountdown({
  scheduledStart,
  whiteName,
  blackName,
  whiteAvatar,
  blackAvatar,
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
