"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Trophy, X, Zap, Clock, Users, DollarSign } from "lucide-react";

type PopupTournament = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  time_control: string;
  initial_minutes: number;
  increment_seconds: number;
  entry_fee: number | null;
  max_players: number | null;
  starts_at: string | null;
  popup_reason: "new" | "starting_soon";
  minutes_until_start: number | null;
};

const DISMISSED_KEY = "ccb-tournament-popups";

function getDismissedIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markDismissed(id: string, reason: string) {
  try {
    // Key includes reason so "new" popup and "starting_soon" popup are independent
    const key = `${id}:${reason}`;
    const dismissed = getDismissedIds().filter((d) => d !== key);
    dismissed.push(key);
    // Keep only last 20 entries
    const trimmed = dismissed.slice(-20);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(trimmed));
  } catch {}
}

function isDismissed(id: string, reason: string): boolean {
  const key = `${id}:${reason}`;
  return getDismissedIds().includes(key);
}

export default function TournamentPopup() {
  const [tournament, setTournament] = useState<PopupTournament | null>(null);
  const [visible, setVisible] = useState(false);

  const fetchPopup = useCallback(async () => {
    try {
      const res = await fetch("/api/tournaments/popup");
      if (!res.ok) return;
      const data = await res.json();
      const tournaments: PopupTournament[] = data.tournaments || [];

      // Find first non-dismissed tournament
      for (const t of tournaments) {
        if (!isDismissed(t.id, t.popup_reason)) {
          setTournament(t);
          setVisible(true);
          return;
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    // Check shortly after page load
    const timer = setTimeout(fetchPopup, 2000);
    // Re-check every 2 minutes in case a new tournament is created
    const interval = setInterval(fetchPopup, 2 * 60 * 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchPopup]);

  const handleDismiss = () => {
    if (tournament) {
      markDismissed(tournament.id, tournament.popup_reason);
    }
    setVisible(false);
  };

  if (!visible || !tournament) return null;

  const isNew = tournament.popup_reason === "new";
  const timeLabel =
    tournament.initial_minutes && tournament.increment_seconds !== undefined
      ? `${tournament.initial_minutes}+${tournament.increment_seconds}`
      : tournament.time_control;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-md animate-slide-up">
      <div className="bg-ccb-card border border-ccb-border sm:rounded-xl shadow-2xl px-4 py-3.5">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-ccb-muted hover:text-ccb-text p-1 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isNew
              ? "bg-gradient-to-br from-ccb-primary to-ccb-accent"
              : "bg-gradient-to-br from-amber-500 to-orange-500"
          }`}>
            {isNew ? (
              <Zap className="w-5 h-5 text-white" />
            ) : (
              <Clock className="w-5 h-5 text-white" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                isNew
                  ? "bg-ccb-primary/20 text-ccb-primary"
                  : "bg-amber-500/20 text-amber-400"
              }`}>
                {isNew ? "New Tournament" : "Starting Soon"}
              </span>
            </div>
            <h3 className="font-bold text-sm mt-1.5 truncate">{tournament.name}</h3>
            {tournament.description && (
              <p className="text-xs text-ccb-muted mt-0.5 line-clamp-2">{tournament.description}</p>
            )}

            <div className="flex items-center gap-3 mt-2 text-xs text-ccb-muted">
              <span className="flex items-center gap-1 capitalize">
                <Trophy className="w-3 h-3" />
                {tournament.type}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeLabel}
              </span>
              {tournament.entry_fee ? (
                <span className="flex items-center gap-1 text-ccb-success">
                  <DollarSign className="w-3 h-3" />
                  {tournament.entry_fee} MK
                </span>
              ) : (
                <span className="flex items-center gap-1 text-ccb-success font-medium">
                  Free
                </span>
              )}
            </div>

            {!isNew && tournament.minutes_until_start !== null && (
              <p className="text-xs text-amber-400 font-semibold mt-1.5">
                {tournament.minutes_until_start <= 0
                  ? "Starting now!"
                  : `Starts in ${tournament.minutes_until_start} min`}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <Link
            href={`/tournament/${tournament.id}`}
            onClick={handleDismiss}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-ccb-primary to-ccb-accent hover:opacity-90 text-white text-sm font-semibold px-4 py-2.5 transition-all shadow-lg shadow-ccb-primary/20"
          >
            <Trophy className="w-4 h-4" />
            View Tournament
          </Link>
        </div>
      </div>
    </div>
  );
}
