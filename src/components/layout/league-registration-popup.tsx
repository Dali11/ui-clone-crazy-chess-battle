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

      setJoinMsg({ type: "success", msg: "You're registered! See you on the board." });
      // Auto-close after success
      setTimeout(() => {
        setVisible(false);
      }, 2000);
    } catch (e: any) {
      setJoinMsg({ type: "error", msg: e.message || "Registration failed" });
    } finally {
      setJoining(false);
    }
  };

  if (!visible || !data) return null;

  const rec = data.recommended;
  const recMeta = rec ? TIER_META[rec.tier] || TIER_META[5] : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-ccb-card border border-ccb-border rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 z-10 text-ccb-muted hover:text-ccb-text p-1.5 rounded-lg hover:bg-ccb-surface transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header banner */}
        <div className="bg-gradient-to-br from-ccb-primary to-ccb-accent px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Season 1 is Here!</h2>
              <p className="text-xs text-white/80">5 Leagues. 12 Weeks. Free Entry.</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Deadline urgency */}
          <div className="flex items-center gap-2 text-xs text-amber-500 dark:text-amber-400 font-semibold">
            <Clock className="w-4 h-4" />
            Registration closes {data.deadline}
          </div>

          {/* Recommended league */}
          {rec && recMeta && (
            <div className="bg-ccb-surface border border-ccb-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-ccb-primary" />
                <span className="text-xs font-bold uppercase tracking-wide text-ccb-primary">Recommended for You</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-ccb-text">{rec.name}</p>
                  <p className="text-xs text-ccb-muted mt-0.5">
                    Rating {rec.minRating}+{rec.maxRating ? `–${rec.maxRating}` : ""} · You: {data.userRating}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${recMeta.bg} ${recMeta.color}`}>
                  Tier {rec.tier}
                </span>
              </div>
              <button
                onClick={() => handleJoin(rec.id)}
                disabled={joining}
                className="w-full mt-3 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-ccb-primary to-ccb-accent hover:opacity-90 text-white text-sm font-bold px-4 py-2.5 transition-all shadow-lg shadow-ccb-primary/20 disabled:opacity-50"
              >
                {joining ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Crown className="w-4 h-4" />
                )}
                Register Now
              </button>
            </div>
          )}

          {/* All leagues list */}
          <div>
            <p className="text-xs font-semibold text-ccb-muted uppercase tracking-wide mb-2">
              Or pick your league
            </p>
            <div className="space-y-1.5">
              {data.leagues.map((league) => {
                const meta = TIER_META[league.tier] || TIER_META[5];
                const Icon = meta.icon;
                const isRec = rec?.id === league.id;
                return (
                  <button
                    key={league.id}
                    onClick={() => handleJoin(league.id)}
                    disabled={joining}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
                      isRec
                        ? "border-ccb-primary/30 bg-ccb-primary/5"
                        : "border-ccb-border hover:bg-ccb-surface"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg}`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-ccb-text">{league.name}</p>
                        <p className="text-[11px] text-ccb-muted">
                          {league.minRating}+{league.maxRating ? `–${league.maxRating}` : ""}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ccb-muted" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Join message */}
          {joinMsg && (
            <div className={`text-sm font-medium text-center px-3 py-2 rounded-lg ${
              joinMsg.type === "success"
                ? "bg-ccb-success/10 text-ccb-success"
                : "bg-destructive/10 text-destructive"
            }`}>
              {joinMsg.msg}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <Link
              href="/league"
              onClick={handleDismiss}
              className="text-xs text-ccb-muted hover:text-ccb-text font-medium underline"
            >
              Learn more about leagues
            </Link>
            <button
              onClick={handleDismiss}
              className="text-xs text-ccb-muted hover:text-ccb-text font-medium"
            >
              Remind me next week
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
