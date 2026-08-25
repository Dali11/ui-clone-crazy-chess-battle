"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Clock, Swords, Link2, Disc3, X, Sparkles, ChevronRight, Play,
  Coins, Crown, TrendingUp, Trophy,
} from "lucide-react";
import { type Variant } from "@/lib/game/draughts-engine";

// Draughts free play uses a single fixed time control (shown for info only)
const FIXED_TC = { id: "rapid", label: "Rapid", minutes: 10, increment: 0, desc: "10+0" };

type SearchState = "idle" | "searching" | "noPlayers";

export default function DraughtsPage() {
  const selectedTC = FIXED_TC.id;
  const [variant] = useState<Variant>("international"); // International is the most widely played competitive variant
  const [rated, setRated] = useState(true);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ draughts_rating?: number; username?: string } | null>(null);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [challengeExpiry, setChallengeExpiry] = useState(10);
  const [adminNotified, setAdminNotified] = useState(false);
  const [activeTab, setActiveTab] = useState<"play" | "battles" | "leagues" | "history">("play");
  const [draughtsGames, setDraughtsGames] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const matchChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const matchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // Fetch draughts game history when History tab is opened
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Store user id for rendering
      (fetchHistory as any).userId = user.id;
      const { data } = await supabase
        .from("draughts_games")
        .select("id, status, winner, time_control, rated, white_player_id, black_player_id, white_rating, black_rating, white_rating_change, black_rating_change, move_count, created_at, ended_at, variant")
        .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(30);
      if (data) setDraughtsGames(data);
    } catch {}
    setLoadingHistory(false);
  };

  const cleanupSearch = () => {
    if (matchChannelRef.current) {
      supabase.removeChannel(matchChannelRef.current);
      matchChannelRef.current = null;
    }
    if (matchTimeoutRef.current) {
      clearTimeout(matchTimeoutRef.current);
      matchTimeoutRef.current = null;
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
    setAdminNotified(false);

    searchIntervalRef.current = setInterval(() => setSearchSeconds(s => s + 1), 1000);

    try {
      const response = await fetch("/api/draughts/matchmaking/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: selectedTC, rated, variant }),
      });
      const data = await response.json();

      if (data.status === "matched" && data.gameId) {
        cleanupSearch();
        router.push(`/draughts/game/${data.gameId}`);
        return;
      }

      if (data.status === "searching") {
        const channel = supabase
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
        matchChannelRef.current = channel;

        // 20s timeout — then offer bot + challenge link
        matchTimeoutRef.current = setTimeout(async () => {
          cleanupSearch();
          fetch("/api/draughts/matchmaking/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }).catch(() => {});

          try {
            await fetch("/api/notify-admin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ timeControl: selectedTC, rated, variant, game: "draughts" }),
            });
            setAdminNotified(true);
          } catch {}

          setSearchState("noPlayers");
        }, 20000);
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

  const handleCreateChallenge = async () => {
    setCreatingChallenge(true);
    try {
      const response = await fetch("/api/draughts/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: selectedTC, rated, expiryMinutes: challengeExpiry, variant }),
      });
      const data = await response.json();
      if (data.challengeId) {
        router.push(`/draughts/challenge/${data.challengeId}`);
      }
    } catch {}
    setCreatingChallenge(false);
  };

  // Auto-start search with ?search=1 (Play Again flow) — time control is fixed
  useEffect(() => {
    const shouldSearch = searchParams.get("search");
    if (shouldSearch === "1") {
      setTimeout(() => handleQuickMatch(), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ===== Searching state =====
  if (searchState === "searching") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 animate-slide-up">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-ccb-primary/10 flex items-center justify-center animate-pulse-glow">
            <Disc3 className="w-14 h-14 text-ccb-primary animate-spin-slow" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-ccb-primary/20 border-t-ccb-primary animate-spin" style={{ animationDuration: "1.5s" }} />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">Finding draughts opponent...</h2>
          <p className="text-sm text-ccb-muted">
            {FIXED_TC.desc} · {rated ? "Ranked" : "Casual"}
          </p>
          <p className="text-xs text-ccb-muted mt-2 tabular-nums">{searchSeconds}s elapsed</p>
        </div>
        <button onClick={handleCancel} className="btn-secondary px-8">
          <X className="w-4 h-4 mr-1.5" /> Cancel Search
        </button>
      </div>
    );
  }

  // ===== No players found — fallback =====
  if (searchState === "noPlayers") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-6 animate-slide-up px-4">
        <div className="w-24 h-24 rounded-full bg-ccb-primary/10 flex items-center justify-center">
          <Link2 className="w-12 h-12 text-ccb-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">No players online right now</h2>
          <p className="text-sm text-ccb-muted max-w-sm">
            We couldn't find an opponent in 20 seconds. Send a challenge link to a friend instead.
          </p>
        </div>

        {adminNotified && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-ccb-primary/10 border border-ccb-primary/30 text-xs text-ccb-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>We've notified the admin — they may join to play you!</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button onClick={handleCreateChallenge} disabled={creatingChallenge} className="btn-primary px-8 flex items-center gap-2">
            {creatingChallenge ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {creatingChallenge ? "Creating..." : "Challenge a Friend"}
          </button>
        </div>

        <button onClick={() => setSearchState("idle")} className="text-sm text-ccb-muted hover:text-ccb-text">
          Back
        </button>
      </div>
    );
  }

  // ===== MAIN VIEW =====
  const tabs = [
    { id: "play" as const, label: "Free Play", icon: Swords },
    { id: "battles" as const, label: "Battles", icon: Coins },
    { id: "leagues" as const, label: "Leagues", icon: Crown },
    { id: "history" as const, label: "History", icon: TrendingUp },
  ];

  return (
    <div className="max-w-2xl mx-auto pb-20 sm:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 flex items-center justify-center shrink-0">
            <Disc3 className="w-6 h-6 text-ccb-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-3xl font-bold leading-tight">
              <span className="block sm:inline">Crazy Draughts</span>{" "}
              <span className="block sm:inline">Battles ⚔️</span>
            </h1>
            <p className="text-sm text-ccb-text/80 truncate">Play. Compete. Climb.</p>
          </div>
        </div>
        {profile && (
          <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full bg-ccb-surface border border-ccb-border">
            <span className="text-[10px] text-ccb-muted uppercase tracking-wide">Rtg</span>
            <span className="text-sm font-bold text-ccb-primary leading-tight">{profile.draughts_rating || 1500}</span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-ccb-border overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "history") fetchHistory();
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative shrink-0 ${
                isActive ? "text-ccb-primary" : "text-ccb-muted hover:text-ccb-text"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-ccb-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "play" && (
        <div className="space-y-4 animate-slide-up">
          {/* Time Control — fixed, shown as info only */}
          <div>
            <h3 className="text-sm font-semibold text-ccb-text mb-2.5">Time Control</h3>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-ccb-surface border-2 border-ccb-primary">
              <div className="w-9 h-9 rounded-lg bg-ccb-primary/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-ccb-primary" />
              </div>
              <div>
                <span className="text-sm font-bold text-ccb-primary">{FIXED_TC.label}</span>
                <span className="text-xs text-ccb-text/60 ml-2">{FIXED_TC.desc}</span>
              </div>
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

          {/* Big play button */}
          <button onClick={handleQuickMatch} className="btn-primary w-full py-4 text-lg font-bold">
            <Swords className="w-5 h-5 mr-2" /> Find a Game
          </button>

          <p className="text-xs text-ccb-muted text-center">
            No opponent in 20s? You'll get the option to send a challenge link.
          </p>

          {/* Challenge a Friend — directly below Find a Game */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="text-xs text-ccb-muted">Link expires in:</span>
              {[10, 30, 60].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setChallengeExpiry(mins)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    challengeExpiry === mins
                      ? "bg-ccb-primary text-ccb-primary-foreground"
                      : "bg-ccb-surface text-ccb-muted border border-ccb-border hover:border-ccb-primary/40"
                  }`}
                >
                  {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                </button>
              ))}
            </div>

            <button
              onClick={handleCreateChallenge}
              disabled={creatingChallenge}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-ccb-border bg-ccb-card px-4 py-3 text-sm font-medium text-ccb-text hover:border-ccb-accent/40 hover:bg-ccb-surface transition-colors disabled:opacity-50"
            >
              {creatingChallenge ? (
                <span className="w-4 h-4 border-2 border-ccb-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 text-ccb-accent" />
              )}
              {creatingChallenge ? "Creating..." : "Challenge a Friend"}
            </button>
          </div>
        </div>
      )}

      {/* Battles tab — coming soon */}
      {activeTab === "battles" && (
        <div className="flex flex-col items-center justify-center py-16 text-center animate-slide-up">
          <div className="w-16 h-16 rounded-full bg-ccb-accent/10 flex items-center justify-center mb-4">
            <Coins className="w-8 h-8 text-ccb-accent" />
          </div>
          <h2 className="text-xl font-bold mb-2">Draughts Battles</h2>
          <p className="text-sm text-ccb-muted max-w-xs mb-4">
            Staked draughts games with real money on the line. Coming soon to Crazy Draughts Battles.
          </p>
          <button onClick={() => setActiveTab("play")} className="btn-secondary text-sm">
            Back to Free Play
          </button>
        </div>
      )}

      {/* Leagues tab — coming soon */}
      {activeTab === "leagues" && (
        <div className="flex flex-col items-center justify-center py-16 text-center animate-slide-up">
          <div className="w-16 h-16 rounded-full bg-ccb-primary/10 flex items-center justify-center mb-4">
            <Crown className="w-8 h-8 text-ccb-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Draughts Leagues</h2>
          <p className="text-sm text-ccb-muted max-w-xs mb-4">
            Competitive draughts leagues and tournaments. Coming soon to Crazy Draughts Battles.
          </p>
          <button onClick={() => router.push("/league")} className="btn-secondary text-sm">
            View Chess Leagues
          </button>
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <div className="space-y-3 animate-slide-up">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-ccb-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : draughtsGames.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-ccb-surface flex items-center justify-center mb-4">
                <TrendingUp className="w-8 h-8 text-ccb-muted" />
              </div>
              <h2 className="text-lg font-bold mb-1">No games yet</h2>
              <p className="text-sm text-ccb-muted mb-4">Play your first draughts game to see it here.</p>
              <button onClick={() => setActiveTab("play")} className="btn-primary text-sm">
                Start Playing
              </button>
            </div>
          ) : (
            draughtsGames.map((g) => {
              const isWhite = g.white_player_id === (fetchHistory as any).userId;
              const won = g.winner === (isWhite ? "white" : "black");
              const drew = g.status === "draw" || g.winner === "draw";
              const aborted = g.status === "abort" || g.status === "aborted";
              const resultIcon = aborted ? "—" : won ? "W" : drew ? "D" : "L";
              const resultColor = aborted ? "text-ccb-muted" : won ? "text-emerald-500" : drew ? "text-ccb-muted" : "text-ccb-danger";
              const date = new Date(g.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              const tc = g.time_control || "10+0";

              return (
                <button
                  key={g.id}
                  onClick={() => router.push(`/draughts/game/${g.id}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-ccb-surface border border-ccb-border hover:border-ccb-primary/40 transition-colors text-left"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                    won ? "bg-emerald-500/15 text-emerald-500" :
                    drew ? "bg-ccb-muted/15 text-ccb-muted" :
                    aborted ? "bg-ccb-muted/10 text-ccb-muted" :
                    "bg-ccb-danger/15 text-ccb-danger"
                  }`}>
                    {resultIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {g.rated ? "Ranked" : "Casual"} · {tc} · {g.variant || "international"}
                    </p>
                    <p className="text-xs text-ccb-muted">
                      {date} · {g.move_count || 0} moves · {isWhite ? "White" : "Black"}
                    </p>
                  </div>
                  {typeof g.white_rating_change === "number" && g.white_rating_change !== 0 && !aborted && (
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${
                      ((isWhite ? g.white_rating_change : g.black_rating_change) || 0) > 0 ? "text-emerald-500" : "text-ccb-danger"
                    }`}>
                      {(isWhite ? g.white_rating_change : g.black_rating_change) > 0 ? "+" : ""}
                      {isWhite ? g.white_rating_change : g.black_rating_change}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
