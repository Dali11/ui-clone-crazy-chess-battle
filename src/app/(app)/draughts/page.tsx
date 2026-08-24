"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Zap, Clock, Swords, X, Disc3 } from "lucide-react";

const timeControls = [
  { id: "bullet", label: "Bullet", minutes: 1, increment: 0, desc: "1+0", icon: Zap },
  { id: "blitz", label: "Blitz", minutes: 5, increment: 0, desc: "5+0", icon: Zap },
  { id: "rapid", label: "Rapid", minutes: 10, increment: 0, desc: "10+0", icon: Clock },
];

type SearchState = "idle" | "searching";

export default function DraughtsPage() {
  const [selectedTC, setSelectedTC] = useState("blitz");
  const [rated, setRated] = useState(true);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ draughts_rating?: number; username?: string } | null>(null);
  const matchChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("username, draughts_rating")
        .eq("id", user.id)
        .single();
      if (data) setProfile(data);
    });
    return () => cleanupSearch();
  }, []);

  const cleanupSearch = () => {
    if (matchChannelRef.current) {
      supabase.removeChannel(matchChannelRef.current);
      matchChannelRef.current = null;
    }
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (searchIntervalRef.current) {
      clearInterval(searchIntervalRef.current);
      searchIntervalRef.current = null;
    }
  };

  const handleQuickMatch = async () => {
    setSearchState("searching");
    setSearchSeconds(0);
    setError(null);

    searchIntervalRef.current = setInterval(() => setSearchSeconds(s => s + 1), 1000);

    try {
      const response = await fetch("/api/draughts/matchmaking/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: selectedTC, rated }),
      });
      const data = await response.json();

      if (data.status === "matched" && data.gameId) {
        cleanupSearch();
        router.push(`/draughts/game/${data.gameId}`);
        return;
      }

      if (data.status === "searching") {
        // Listen for when we get matched (polling approach)
        matchChannelRef.current = supabase
          .channel("draughts_matchmaking")
          .on(
            "postgres_changes",
            { event: "DELETE", schema: "public", table: "draughts_matchmaking_queue" },
            async () => {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;
              const { data: newGame } = await supabase
                .from("draughts_games")
                .select("id")
                .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
                .eq("status", "playing")
                .order("created_at", { ascending: false })
                .limit(1)
                .single();
              if (newGame) {
                cleanupSearch();
                router.push(`/draughts/game/${newGame.id}`);
              }
            }
          )
          .subscribe();

        // No timeout auto-cancel for now — let user cancel manually
        return;
      }

      if (data.error) {
        cleanupSearch();
        setError(data.error);
        setSearchState("idle");
      }
    } catch {
      cleanupSearch();
      setError("Failed to join queue");
      setSearchState("idle");
    }
  };

  const handleCancel = async () => {
    cleanupSearch();
    try {
      await fetch("/api/draughts/matchmaking/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch {}
    setSearchState("idle");
  };

  if (searchState === "searching") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 animate-slide-up">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-ccb-primary/10 flex items-center justify-center animate-pulse-glow">
            <Disc3 className="w-14 h-14 text-ccb-primary" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-ccb-primary/20 border-t-ccb-primary animate-spin" style={{ animationDuration: "1.5s" }} />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">Finding draughts opponent...</h2>
          <p className="text-sm text-ccb-muted">
            {timeControls.find((t) => t.id === selectedTC)?.desc} · {rated ? "Ranked" : "Casual"}
          </p>
          <p className="text-xs text-ccb-muted mt-2 tabular-nums">{searchSeconds}s elapsed</p>
        </div>
        <button onClick={handleCancel} className="btn-secondary px-8">
          <X className="w-4 h-4 mr-1.5" /> Cancel Search
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-ccb-primary/10 flex items-center justify-center">
            <Disc3 className="w-7 h-7 text-ccb-primary" />
          </div>
          <h1 className="text-3xl font-bold">Draughts</h1>
        </div>
        <p className="text-ccb-muted">English checkers · 8×8 · Captures mandatory</p>
      </div>

      {/* Rating display */}
      {profile && (
        <div className="flex items-center justify-center gap-4">
          <div className="px-6 py-3 rounded-xl bg-ccb-surface border border-ccb-border text-center">
            <p className="text-xs text-ccb-muted mb-1">Your Draughts Rating</p>
            <p className="text-2xl font-bold text-ccb-primary">{profile.draughts_rating || 1500}</p>
          </div>
        </div>
      )}

      {/* Time controls */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ccb-muted uppercase tracking-wide">Time Control</h3>
        <div className="grid grid-cols-3 gap-3">
          {timeControls.map((tc) => {
            const Icon = tc.icon;
            const isSelected = selectedTC === tc.id;
            return (
              <button
                key={tc.id}
                onClick={() => setSelectedTC(tc.id)}
                className={`flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? "border-ccb-primary bg-ccb-primary/10 text-ccb-primary"
                    : "border-ccb-border bg-ccb-surface text-ccb-muted hover:border-ccb-primary/50"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-bold">{tc.label}</span>
                <span className="text-xs text-ccb-muted">{tc.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rated toggle */}
      <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-ccb-surface border border-ccb-border">
        <div>
          <p className="text-sm font-medium">Ranked</p>
          <p className="text-xs text-ccb-muted">Affects your draughts rating</p>
        </div>
        <button
          onClick={() => setRated(!rated)}
          className={`relative w-12 h-6 rounded-full transition-colors ${rated ? "bg-ccb-primary" : "bg-ccb-muted/30"}`}
        >
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${rated ? "translate-x-6" : "translate-x-0.5"}`} />
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-lg bg-red-500/15 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Play button */}
      <button
        onClick={handleQuickMatch}
        className="btn-primary w-full py-4 text-lg font-bold"
      >
        <Swords className="w-5 h-5 mr-2" /> Find a Game
      </button>

      {/* Info */}
      <div className="px-4 py-3 rounded-xl bg-ccb-surface/50 border border-ccb-border text-center">
        <p className="text-xs text-ccb-muted">
          Draughts is in beta. Battles and leagues coming soon.
        </p>
      </div>
    </div>
  );
}
