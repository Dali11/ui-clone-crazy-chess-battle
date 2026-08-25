"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AIDifficulty } from "@/lib/game/draughts-ai";
import {
  Zap, Clock, Swords, Bot, Link2, Disc3, X, Sparkles, ChevronRight, Play,
  Coins, Crown, TrendingUp, Trophy,
} from "lucide-react";
import { VARIANTS, VARIANT_LIST, type Variant } from "@/lib/game/draughts-engine";

const timeControls = [
  { id: "bullet", label: "Bullet", minutes: 1,  increment: 0, desc: "1+0",  icon: Zap },
  { id: "blitz",  label: "Blitz",  minutes: 5,  increment: 0, desc: "5+0",  icon: Zap },
  { id: "rapid",  label: "Rapid",  minutes: 10, increment: 0, desc: "10+0", icon: Clock },
];

const aiDifficulties: { id: AIDifficulty; label: string; desc: string }[] = [
  { id: "easy",   label: "Easy",   desc: "Beginner friendly" },
  { id: "medium", label: "Medium", desc: "A fair challenge" },
  { id: "hard",   label: "Hard",   desc: "Think carefully" },
];

type SearchState = "idle" | "searching" | "noPlayers";

export default function DraughtsPage() {
  const [selectedTC, setSelectedTC] = useState("rapid");
  const [variant, setVariant] = useState<Variant>("international");
  const [rated, setRated] = useState(true);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ draughts_rating?: number; username?: string } | null>(null);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>("medium");
  const [aiColor, setAiColor] = useState<"white" | "black">("white");
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

  const handlePlayBot = () => {
    const color = Math.random() < 0.5 ? "white" : "black";
    router.push(`/draughts/play/computer?difficulty=${aiDifficulty}&color=${color}&tc=${selectedTC}&variant=${variant}`);
  };

  const handlePlayComputer = () => {
    router.push(`/draughts/play/computer?difficulty=${aiDifficulty}&color=${aiColor}&tc=${selectedTC}&variant=${variant}`);
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

  // Auto-start search with ?tc=...&search=1 (Play Again flow)
  useEffect(() => {
    const tc = searchParams.get("tc");
    const shouldSearch = searchParams.get("search");
    if (tc && shouldSearch === "1") {
      const validTCs = ["bullet", "blitz", "rapid"];
      if (validTCs.includes(tc)) setSelectedTC(tc);
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

  // ===== No players found — fallback =====
  if (searchState === "noPlayers") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-6 animate-slide-up px-4">
        <div className="w-24 h-24 rounded-full bg-ccb-primary/10 flex items-center justify-center">
          <Bot className="w-12 h-12 text-ccb-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">No players online right now</h2>
          <p className="text-sm text-ccb-muted max-w-sm">
            We couldn't find an opponent in 20 seconds. Play the computer or send a challenge link.
          </p>
        </div>

        {adminNotified && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-ccb-primary/10 border border-ccb-primary/30 text-xs text-ccb-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>We've notified the admin — they may join to play you!</span>
          </div>
        )}

        {/* Difficulty picker */}
        <div className="flex gap-2">
          {aiDifficulties.map((d) => (
            <button
              key={d.id}
              onClick={() => setAiDifficulty(d.id)}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                aiDifficulty === d.id
                  ? "bg-ccb-primary text-white shadow-lg shadow-ccb-primary/20"
                  : "bg-ccb-card border border-ccb-border text-ccb-muted hover:text-ccb-text"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button onClick={handlePlayBot} className="btn-primary px-8">
            <Bot className="w-4 h-4 mr-1.5" /> Play Computer
          </button>
          <button onClick={handleCreateChallenge} disabled={creatingChallenge} className="btn-secondary px-6 flex items-center gap-2">
            {creatingChallenge ? (
              <span className="w-4 h-4 border-2 border-ccb-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <Link2 className="w-4 h-4 text-ccb-accent" />
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
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">Crazy Draughts Battles ⚔️</h1>
            <p className="text-sm text-ccb-muted truncate">Play. Compete. Climb.</p>
          </div>
        </div>
        {profile && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-ccb-muted uppercase tracking-wide">Rating</p>
            <p className="text-lg font-bold text-ccb-primary leading-tight">{profile.draughts_rating || 1500}</p>
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
        <div className="space-y-5 animate-slide-up">
          {/* Variant Selector */}
          <div>
            <h3 className="text-sm font-medium text-ccb-muted mb-3">Game Variant</h3>
            <div className="grid grid-cols-3 gap-3">
              {VARIANT_LIST.map((v) => {
                const isSelected = variant === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setVariant(v.id)}
                    className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all text-center ${
                      isSelected
                        ? "border-ccb-primary bg-ccb-primary/10 text-ccb-primary"
                        : "border-ccb-border bg-ccb-surface text-ccb-muted hover:border-ccb-primary/50"
                    }`}
                  >
                    <span className="text-sm font-bold">{v.name}</span>
                    <span className="text-[10px] leading-tight">{v.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Control */}
          <div>
            <h3 className="text-sm font-medium text-ccb-muted mb-3">Time Control</h3>
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

          {/* Big play button */}
          <button onClick={handleQuickMatch} className="btn-primary w-full py-4 text-lg font-bold">
            <Swords className="w-5 h-5 mr-2" /> Find a Game
          </button>

          <p className="text-xs text-ccb-muted text-center">
            No opponent found in 20s? You'll get the option to play the computer or send a challenge link.
          </p>

          {/* Divider */}
          <div className="relative pt-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-ccb-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-ccb-dark px-3 text-xs text-ccb-muted">or</span>
            </div>
          </div>

          {/* Challenge link expiry picker */}
          <div className="flex items-center gap-2 flex-wrap">
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

          {/* Secondary actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCreateChallenge}
              disabled={creatingChallenge}
              className="flex items-center justify-center gap-2 rounded-xl border border-ccb-border bg-ccb-card px-4 py-3 text-sm font-medium text-ccb-text hover:border-ccb-accent/40 hover:bg-ccb-surface transition-colors disabled:opacity-50"
            >
              {creatingChallenge ? (
                <span className="w-4 h-4 border-2 border-ccb-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 text-ccb-accent" />
              )}
              {creatingChallenge ? "Creating..." : "Challenge a Friend"}
            </button>
            <button
              onClick={() => router.push(`/draughts/play/computer?difficulty=${aiDifficulty}&color=${aiColor}&tc=${selectedTC}&variant=${variant}`)}
              className="flex items-center justify-center gap-2 rounded-xl border border-ccb-border bg-ccb-card px-4 py-3 text-sm font-medium text-ccb-text hover:border-ccb-success/50 hover:bg-ccb-surface transition-colors"
            >
              <Bot className="w-4 h-4 text-ccb-success" />
              Play Computer
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
