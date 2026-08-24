"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AIDifficulty } from "@/lib/game/chess-ai";
import {
  Zap, Clock, Swords, Bot, Link2, Copy, Check, X,
  Users, Target, Sparkles, ChevronRight, Play,
} from "lucide-react";

const timeControls = [
  { id: "bullet",    label: "Bullet",    minutes: 1,  increment: 0,  desc: "1+0",   icon: Zap },
  { id: "blitz3",    label: "Blitz",     minutes: 3,  increment: 2,  desc: "3+2",   icon: Zap },
  { id: "blitz",     label: "Blitz",     minutes: 5,  increment: 0,  desc: "5+0",   icon: Zap },
  { id: "rapid",     label: "Rapid",     minutes: 10, increment: 0,  desc: "10+0",  icon: Clock },
  { id: "rapid15",   label: "Rapid",     minutes: 15, increment: 10, desc: "15+10", icon: Clock },
  { id: "classical", label: "Classical", minutes: 30, increment: 0,  desc: "30+0",  icon: Clock },
];

const aiDifficulties: { id: AIDifficulty; label: string; desc: string }[] = [
  { id: "easy",   label: "Easy",   desc: "Beginner friendly" },
  { id: "medium", label: "Medium", desc: "A fair challenge" },
  { id: "hard",   label: "Hard",   desc: "Think carefully" },
];

type View = "main" | "challenge" | "computer";
type SearchState = "idle" | "searching" | "noPlayers";

export default function PlayPage() {
  const [view, setView] = useState<View>("main");
  const [selectedTC, setSelectedTC] = useState("rapid15");
  const [rated, setRated] = useState(true);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [copied, setCopied] = useState(false);
  const [challengeUrl, setChallengeUrl] = useState<string | null>(null);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [challengeExpiry, setChallengeExpiry] = useState(10); // minutes
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [adminNotified, setAdminNotified] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>("medium");
  const [aiColor, setAiColor] = useState<"white" | "black">("white");
  const [searchSeconds, setSearchSeconds] = useState(0);
  const matchChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const matchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

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
    setAdminNotified(false);

    searchIntervalRef.current = setInterval(() => {
      setSearchSeconds((s) => s + 1);
    }, 1000);

    try {
      const response = await fetch("/api/matchmaking/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: selectedTC, rated }),
      });
      const data = await response.json();

      if (data.status === "matched" && data.gameId) {
        cleanupSearch();
        router.push(`/game/${data.gameId}`);
        return;
      }

      if (data.status === "searching") {
        const channel = supabase
          .channel("matchmaking")
          .on(
            "postgres_changes",
            { event: "DELETE", schema: "public", table: "matchmaking_queue" },
            async () => {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;
              const { data: newGame } = await supabase
                .from("games")
                .select("id")
                .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
                .eq("status", "playing")
                .order("created_at", { ascending: false })
                .limit(1)
                .single();
              if (newGame) {
                cleanupSearch();
                router.push(`/game/${newGame.id}`);
              }
            }
          )
          .subscribe();
        matchChannelRef.current = channel;

        matchTimeoutRef.current = setTimeout(async () => {
          cleanupSearch();
          fetch("/api/matchmaking/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }).catch(() => {});

          try {
            await fetch("/api/notify-admin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ timeControl: selectedTC, rated }),
            });
            setAdminNotified(true);
          } catch {}

          setSearchState("noPlayers");
        }, 20000);
        return;
      }

      if (data.error) {
        cleanupSearch();
        setSearchState("idle");
        alert(data.error);
      }
    } catch {
      cleanupSearch();
      setSearchState("idle");
    }
  };

  const handleCancel = async () => {
    cleanupSearch();
    try {
      await fetch("/api/matchmaking/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch {}
    setSearchState("idle");
  };

  const handlePlayBot = () => {
    const color = Math.random() < 0.5 ? "white" : "black";
    router.push(`/play/computer?difficulty=${aiDifficulty}&color=${color}&tc=${selectedTC}`);
  };

  const handlePlayComputer = () => {
    router.push(`/play/computer?difficulty=${aiDifficulty}&color=${aiColor}&tc=${selectedTC}`);
  };

  useEffect(() => {
    return () => cleanupSearch();
  }, []);

  // Auto-start search when arriving with ?tc=...&rated=...&search=1 (Play Again flow)
  useEffect(() => {
    const tc = searchParams.get("tc");
    const ratedParam = searchParams.get("rated");
    const shouldSearch = searchParams.get("search");
    if (tc && shouldSearch === "1") {
      const validTCs = ["bullet", "blitz3", "blitz", "rapid", "rapid15", "classical"];
      if (validTCs.includes(tc)) setSelectedTC(tc);
      if (ratedParam === "0") setRated(false);
      else if (ratedParam === "1") setRated(true);
      // Small delay to ensure state is set before searching
      setTimeout(() => handleQuickMatch(), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);


  const handleCreateChallenge = async () => {
    setCreatingChallenge(true);
    try {
      const response = await fetch("/api/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: selectedTC, rated, expiryMinutes: challengeExpiry }),
      });
      const data = await response.json();
      if (data.challengeId) {
        router.push(`/challenge/${data.challengeId}`);
      }
    } catch {
      // ignore
    }
    setCreatingChallenge(false);
  };

  const copyChallengeUrl = () => {
    if (challengeUrl) {
      navigator.clipboard.writeText(challengeUrl);
      setChallengeCopied(true);
      setTimeout(() => setChallengeCopied(false), 2000);
    }
  };

  // ===== Searching state =====
  if (searchState === "searching") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 animate-slide-up">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-ccb-primary/10 flex items-center justify-center animate-pulse-glow">
            <Swords className="w-14 h-14 text-ccb-primary" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-ccb-primary/20 border-t-ccb-primary animate-spin" style={{ animationDuration: "1.5s" }} />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">Finding opponent...</h2>
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
            We couldn't find an opponent in the queue. Play the computer while you wait — same time control.
          </p>
        </div>

        {adminNotified && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-ccb-primary/10 border border-ccb-primary/30 text-xs text-ccb-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>We've notified the admin — they may join to play you!</span>
          </div>
        )}

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

        <div className="flex items-center gap-3">
          <button onClick={handlePlayBot} className="btn-primary px-8">
            <Bot className="w-4 h-4 mr-1.5" /> Play Computer
          </button>
          <button onClick={() => setSearchState("idle")} className="btn-secondary px-6">
            Back
          </button>
        </div>
      </div>
    );
  }


  // ===== Play vs Computer view =====
  if (view === "computer") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-20 sm:pb-0 animate-slide-up">
        <button onClick={() => setView("main")} className="text-sm text-ccb-muted hover:text-ccb-text flex items-center gap-1">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back
        </button>

        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-ccb-success/15 flex items-center justify-center">
              <Bot className="w-5 h-5 text-ccb-success" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Play vs Computer</h1>
              <p className="text-sm text-ccb-muted">Hone your skills against the AI</p>
            </div>
          </div>
        </div>

        <TimeControlPicker selectedTC={selectedTC} setSelectedTC={setSelectedTC} />

        <div>
          <h3 className="text-sm font-medium text-ccb-muted mb-3">Difficulty</h3>
          <div className="grid grid-cols-3 gap-3">
            {aiDifficulties.map((d) => (
              <button
                key={d.id}
                onClick={() => setAiDifficulty(d.id)}
                className={`tc-btn flex flex-col items-center text-center py-4 px-2 ${aiDifficulty === d.id ? "tc-active" : ""}`}
              >
                <span className={`text-sm font-medium ${aiDifficulty === d.id ? "text-ccb-primary" : ""}`}>{d.label}</span>
                <span className="text-xs text-ccb-muted mt-0.5">{d.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-ccb-muted mb-3">Your Color</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setAiColor("white")}
              className={`tc-btn flex items-center justify-center gap-2 py-3.5 ${aiColor === "white" ? "tc-active" : ""}`}
            >
              <span className="text-xl">♔</span>
              <span className="text-sm font-medium">White</span>
            </button>
            <button
              onClick={() => setAiColor("black")}
              className={`tc-btn flex items-center justify-center gap-2 py-3.5 ${aiColor === "black" ? "tc-active" : ""}`}
            >
              <span className="text-xl">♚</span>
              <span className="text-sm font-medium">Black</span>
            </button>
          </div>
        </div>

        <button onClick={handlePlayComputer} className="btn-primary w-full text-base py-3.5">
          <Play className="w-5 h-5 mr-2" /> Start Game
        </button>
      </div>
    );
  }

  // ===== MAIN VIEW — flat, no menu step =====
  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20 sm:pb-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Play Chess</h1>
        <p className="text-sm text-ccb-muted mt-1">Pick your time control and find a game</p>
      </div>

      {/* Time Control — immediately visible */}
      <TimeControlPicker selectedTC={selectedTC} setSelectedTC={setSelectedTC} />

      {/* Ranked toggle — inline */}
      <RatedToggle rated={rated} setRated={setRated} />

      {/* Big play button */}
      <button onClick={handleQuickMatch} className="btn-primary w-full text-base py-4 text-lg">
        <Swords className="w-5 h-5 mr-2" /> Find Match
      </button>

      <p className="text-xs text-ccb-muted text-center">
        No opponent found in 20s? You'll get the option to play the computer.
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

      {/* Secondary actions — no extra menu step */}
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
          onClick={() => setView("computer")}
          className="flex items-center justify-center gap-2 rounded-xl border border-ccb-border bg-ccb-card px-4 py-3 text-sm font-medium text-ccb-text hover:border-ccb-success/50 hover:bg-ccb-surface transition-colors"
        >
          <Bot className="w-4 h-4 text-ccb-success" />
          Play Computer
        </button>
      </div>

      {/* Quick links */}
      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button
          onClick={() => router.push("/battles")}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-ccb-border bg-ccb-surface px-4 py-3 text-sm font-medium text-ccb-text hover:border-ccb-accent/40 transition-colors"
        >
          <Target className="w-4 h-4 text-ccb-accent" />
          Staked Battles
        </button>
      </div>
    </div>
  );
}

// ===== Reusable Time Control Picker =====
function TimeControlPicker({ selectedTC, setSelectedTC }: { selectedTC: string; setSelectedTC: (v: string) => void }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-ccb-muted mb-3">Time Control</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {timeControls.map((tc) => {
          const Icon = tc.icon;
          const isSelected = selectedTC === tc.id;
          return (
            <button
              key={tc.id}
              onClick={() => setSelectedTC(tc.id)}
              className={`tc-btn flex items-center gap-3 text-left ${isSelected ? "tc-active" : ""}`}
            >
              <Icon className={`w-5 h-5 ${isSelected ? "text-ccb-primary" : "text-ccb-muted"}`} />
              <div>
                <div className="text-sm font-medium">{tc.desc}</div>
                <div className="text-xs text-ccb-muted">{tc.label}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===== Reusable Rated Toggle =====
function RatedToggle({ rated, setRated }: { rated: boolean; setRated: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between card card-hover">
      <div>
        <h3 className="font-medium">Ranked</h3>
        <p className="text-sm text-ccb-muted">Rated games affect your rating</p>
      </div>
      <button
        onClick={() => setRated(!rated)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
          rated ? "bg-ccb-primary" : "bg-ccb-border"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            rated ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
