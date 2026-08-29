"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Crown, X, Sparkles, Trophy, Clock, Users, ChevronRight, Loader2 } from "lucide-react";

type LeagueInfo = {
  id: string;
  name: string;
  tier: number;
  minRating: number;
  maxRating: number | null;
};

type PopupData = {
  show: boolean;
  recommended: LeagueInfo | null;
  leagues: LeagueInfo[];
  userRating: number;
  deadline: string;
};

const DISMISS_KEY = "ccb-league-popup-dismissed";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function shouldShowAfterDismiss(): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) return true;
    const dismissedTime = parseInt(dismissed, 10);
    return Date.now() - dismissedTime >= WEEK_MS;
  } catch {
    return true;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  } catch {}
}

const TIER_META: Record<number, { color: string; bg: string; icon: typeof Crown }> = {
  1: { color: "text-ccb-primary", bg: "bg-ccb-primary/10", icon: Crown },
  2: { color: "text-ccb-accent", bg: "bg-ccb-accent/10", icon: Trophy },
  3: { color: "text-amber-500", bg: "bg-amber-500/10", icon: Trophy },
  4: { color: "text-ccb-muted", bg: "bg-ccb-muted/10", icon: Users },
  5: { color: "text-ccb-success", bg: "bg-ccb-success/10", icon: Users },
};

export default function LeagueRegistrationPopup() {
  const [data, setData] = useState<PopupData | null>(null);
  const [visible, setVisible] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    // Only check after a short delay to not interfere with page load
    const timer = setTimeout(async () => {
      // Check weekly dismissal first (client-side)
      if (!shouldShowAfterDismiss()) return;

      try {
        const res = await fetch("/api/league/popup-status");
        if (!res.ok) return;
        const json: PopupData = await res.json();
        if (json.show) {
          setData(json);
          setVisible(true);
        }
      } catch {}
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    markDismissed();
    setVisible(false);
  };

  const handleJoin = async (leagueId: string) => {
    setJoining(true);
    setJoinMsg(null);
    try {
      const res = await fetch("/api/league/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to register");

      setJoinMsg({ type: "success", msg: "You're in! See you on the board." });
      // Auto-close after success
      setTimeout(() => {
        setVisible(false);
      }, 1800);
    } catch (e: any) {
      setJoinMsg({ type: "error", msg: e.message || "Registration failed" });
    } finally {
      setJoining(false);
    }
  };

  if (!visible || !data) return null;

  const rec = data.recommended;
  const recMeta = rec ? TIER_META[rec.tier] || TIER_META[5] : null;
  const RecIcon = recMeta?.icon || Crown;

  return (
    <div
      className="fixed bottom-4 right-3 sm:bottom-5 sm:right-5 z-[120] w-[85vw] sm:w-[320px] max-w-[340px] max-h-[45vh] sm:max-h-[70vh]
                 bg-ccb-card border border-ccb-border rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-up"
    >
      {/* Compact header */}
      <div className="relative shrink-0 bg-gradient-to-br from-ccb-primary to-ccb-accent px-3.5 py-2.5 pr-9">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 z-20 text-white/90 hover:text-white p-1 rounded-md bg-black/20 hover:bg-black/30 transition-colors"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-white shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-black text-white uppercase tracking-tight leading-tight">Season 1</p>
            <p className="text-[10px] text-white/80 leading-tight">Free Entry · Closes {data.deadline}</p>
          </div>
        </div>
      </div>

      {/* Compact body */}
      <div className="overflow-y-auto px-3.5 py-3 space-y-2.5">
        {rec && recMeta && (
          <div className="bg-ccb-surface border border-ccb-border rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3 h-3 text-ccb-primary shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-ccb-primary">For You</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${recMeta.bg}`}>
                <RecIcon className={`w-3.5 h-3.5 ${recMeta.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-xs text-ccb-text truncate">{rec.name}</p>
                <p className="text-[10px] text-ccb-muted">
                  {rec.minRating}+{rec.maxRating ? `–${rec.maxRating}` : ""} · You: {data.userRating}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleJoin(rec.id)}
              disabled={joining}
              className="w-full mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-ccb-primary to-ccb-accent hover:opacity-90 text-white text-xs font-bold px-3 py-2 transition-all disabled:opacity-50"
            >
              {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
              Register Now
            </button>
          </div>
        )}

        {joinMsg && (
          <div className={`text-xs font-medium text-center px-2.5 py-1.5 rounded-lg ${
            joinMsg.type === "success"
              ? "bg-ccb-success/10 text-ccb-success"
              : "bg-destructive/10 text-destructive"
          }`}>
            {joinMsg.msg}
          </div>
        )}

        <Link
          href="/league"
          onClick={handleDismiss}
          className="flex items-center justify-between w-full text-xs font-semibold text-ccb-text hover:text-ccb-primary px-1 py-1"
        >
          <span>Not your tier? Pick any of the 5 leagues</span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        </Link>

        <button
          onClick={handleDismiss}
          className="w-full text-center text-[10px] text-ccb-muted hover:text-ccb-text font-medium"
        >
          Remind me next week
        </button>
      </div>
    </div>
  );
}
