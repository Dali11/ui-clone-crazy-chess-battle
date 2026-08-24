"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Swords, Clock, Coins, Zap, AlertCircle, Loader2, Link2, Copy, Check,
  RefreshCw, XCircle, ChevronRight, Users, Target, Sparkles,
} from "lucide-react";

const DEFAULT_STAKES = [50000, 100000, 250000, 500000, 1000000];

const TIME_CONTROLS = [
  { id: "bullet",    label: "Bullet",    desc: "1+0",   icon: Zap },
  { id: "blitz3",    label: "Blitz",     desc: "3+2",   icon: Zap },
  { id: "blitz",     label: "Blitz",     desc: "5+0",   icon: Zap },
  { id: "rapid",     label: "Rapid",     desc: "10+0",  icon: Clock },
  { id: "rapid15",   label: "Rapid",     desc: "15+10", icon: Clock },
  { id: "classical", label: "Classical", desc: "30+0",  icon: Clock },
];

function formatMKK(cents: number): string {
  return `MK ${Math.floor(cents / 100).toLocaleString("en-US")}`;
}

interface BattleConfig {
  enabled: boolean;
  stake_levels: number[];
  platform_fee_pct: number;
  rating_range: number;
  initial_minutes: number;
  increment_seconds: number;
}

type View = "main" | "challenge";
type BattleState = "select" | "searching" | "matched" | "playing";

export default function BattlesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [view, setView] = useState<View>("main");
  const [config, setConfig] = useState<BattleConfig | null>(null);
  const [balance, setBalance] = useState(0);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const MIN_GAMES_FOR_BATTLES = 5;
  const battlesLocked = gamesPlayed < MIN_GAMES_FOR_BATTLES;
  const [selectedStake, setSelectedStake] = useState<number | null>(null);
  const [selectedTC, setSelectedTC] = useState("rapid15");
  const [state, setState] = useState<BattleState>("select");
  const [battleId, setBattleId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<{ username: string; display_name: string; rating: number } | null>(null);
  const [myRating, setMyRating] = useState(1200);
  const [error, setError] = useState<string | null>(null);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [challengeUrl, setChallengeUrl] = useState<string | null>(null);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [adminNotified, setAdminNotified] = useState(false);
  const [checkingActive, setCheckingActive] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [activeBattle, setActiveBattle] = useState<{
    battleId: string;
    gameId?: string;
    status: string;
    stuck?: boolean;
    stakeCents?: number;
  } | null>(null);
  const [cancellingStuck, setCancellingStuck] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adminNotifyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkActiveBattle = useCallback(async () => {
    try {
      const res = await fetch("/api/battles/active");
      if (!res.ok) { setCheckingActive(false); return; }
      const data = await res.json();
      if (data.active) {
        setActiveBattle(data);
        if (data.gameId && data.status === "playing") {
          router.push(`/game/${data.gameId}`);
          return;
        }
      }
    } catch {}
    setCheckingActive(false);
  }, [router]);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("rating, wallet_balance_cents, games_played")
      .eq("id", user.id)
      .single();
    if (profile) {
      setMyRating(profile.rating ?? 1200);
      setBalance(profile.wallet_balance_cents ?? 0);
      setGamesPlayed(profile.games_played ?? 0);
    }
    setProfileLoaded(true);
  };

  useEffect(() => {
    checkActiveBattle();
    loadProfile();
    // Trigger expired challenge cleanup on page load (since cron is daily on Hobby plan)
    fetch("/api/battles/challenge/cleanup-expired", { method: "POST" }).catch(() => {});
    fetch("/api/battles/config")
      .then(async (r) => {
        const d = await r.json();
        // Guard: never treat an error response (e.g. auth failure) as a disabled config
        if (!r.ok || d?.error) return;
        setConfig(d);
      })
      .catch(() => {});
  }, [checkActiveBattle]);


  // Re-fetch the profile (games_played, rating, balance) whenever this tab
  // regains focus or becomes visible again. A long-lived tab can otherwise
  // show a stale "games played" count even after playing more games elsewhere.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") loadProfile();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const handleCancelStuck = async () => {
    if (!activeBattle) return;
    setCancellingStuck(true);
    setError(null);
    try {
      const res = await fetch("/api/battles/cancel-stuck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battleId: activeBattle.battleId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to cancel"); setCancellingStuck(false); return; }
      setActiveBattle(null);
      loadProfile();
    } catch { setError("Failed to cancel"); }
    setCancellingStuck(false);
  };

  // Poll for match while searching
  useEffect(() => {
    if (state !== "searching") return;

    searchIntervalRef.current = setInterval(() => {
      setSearchSeconds((s) => s + 1);
    }, 1000);

    pollRef.current = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: queueEntry } = await supabase
        .from("battle_queue")
        .select("status, battle_id")
        .eq("player_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (queueEntry?.status === "matched" && queueEntry.battle_id) {
        const res = await fetch(`/api/battles/status?battleId=${queueEntry.battle_id}`);
        if (res.ok) {
          const battleData = await res.json();
          setBattleId(queueEntry.battle_id);
          setOpponent(battleData.opponent);
          setState("matched");
        }
      }
    }, 2000);

    adminNotifyRef.current = setTimeout(async () => {
      try {
        await fetch("/api/notify-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timeControl: selectedTC,
            rated: true,
            context: "battle",
            stake: selectedStake,
          }),
        });
        setAdminNotified(true);
      } catch {}
    }, 20000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
      if (adminNotifyRef.current) clearTimeout(adminNotifyRef.current);
    };
  }, [state, selectedTC, selectedStake, supabase]);

  const handleEnterBattle = async () => {
    if (selectedStake === null) return;
    setError(null);

    if (balance < selectedStake) {
      setError(`Insufficient balance. You need ${formatMKK(selectedStake)}. Deposit funds first.`);
      return;
    }

    try {
      const res = await fetch("/api/battles/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stakeCents: selectedStake, timeControl: selectedTC }),
      });

      const data = await res.json();

      if (!res.ok) { setError(data.error || "Failed to join battle"); return; }

      if (data.matched && data.battleId) {
        setBattleId(data.battleId);
        const statusRes = await fetch(`/api/battles/status?battleId=${data.battleId}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setOpponent(statusData.opponent);
          setState("matched");
        }
      } else {
        setState("searching");
        setSearchSeconds(0);
        setAdminNotified(false);
      }
    } catch { setError("Failed to join battle queue"); }
  };

  const handleChallengeFriend = async () => {
    if (selectedStake === null) return;
    setError(null);
    setChallengeUrl(null);

    if (balance < selectedStake) {
      setError(`Insufficient balance. You need ${formatMKK(selectedStake)}. Deposit funds first.`);
      return;
    }

    setCreatingChallenge(true);
    try {
      const res = await fetch("/api/battles/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stakeCents: selectedStake, timeControl: selectedTC }),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error || "Failed to create challenge"); setCreatingChallenge(false); return; }

      router.push(`/battle-challenge/${data.challengeId}`);
    } catch { setError("Failed to create challenge"); }
    setCreatingChallenge(false);
  };

  const handleLeaveQueue = async () => {
    await fetch("/api/battles/leave", { method: "POST" });
    setState("select");
    setSearchSeconds(0);
    setAdminNotified(false);
    loadProfile();
  };

  const handlePlayBattle = async () => {
    if (!battleId) return;
    try {
      const res = await fetch("/api/battles/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battleId, timeControl: selectedTC }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to start game"); return; }
      router.push(`/game/${data.gameId}`);
    } catch { setError("Failed to start battle game"); }
  };

  const stakes = config?.stake_levels ?? DEFAULT_STAKES;
  const feePct = config?.platform_fee_pct ?? 10;

  // Disabled state
  if (!config?.enabled && config !== null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <AlertCircle className="w-12 h-12 text-ccb-muted mb-4" />
        <p className="text-lg font-semibold">Chess Battles are currently disabled</p>
        <p className="text-sm text-ccb-muted mt-2">Check back later or contact an admin.</p>
      </div>
    );
  }

  // ===== Battles locked — insufficient games played =====
  // Wait for profile to load before showing the lock — otherwise players with
  // enough games see the locked wall during the initial fetch (games_played defaults to 0).
  if (!profileLoaded) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-ccb-primary animate-spin mb-3" />
        <p className="text-sm text-ccb-muted">Loading battles...</p>
      </div>
    );
  }
  if (battlesLocked) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28 sm:py-10 sm:pb-10">
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-ccb-primary/10 flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-ccb-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Battles Locked</h2>
          <p className="text-sm text-ccb-muted max-w-sm mx-auto mb-6">
            You need to play at least <span className="font-semibold text-ccb-text">{MIN_GAMES_FOR_BATTLES} games</span> to unlock Chess Battles.
            You&apos;ve played <span className="font-semibold text-ccb-text">{gamesPlayed}</span> so far.
          </p>

          <div className="max-w-sm mx-auto mb-6">
            <div className="flex items-center justify-between text-xs text-ccb-muted mb-1.5">
              <span>{gamesPlayed} / {MIN_GAMES_FOR_BATTLES} games</span>
              <span>{Math.round((gamesPlayed / MIN_GAMES_FOR_BATTLES) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-ccb-surface overflow-hidden">
              <div
                className="h-full rounded-full bg-ccb-primary transition-all duration-500"
                style={{ width: `${Math.min(100, (gamesPlayed / MIN_GAMES_FOR_BATTLES) * 100)}%` }}
              />
            </div>
          </div>

          <a href="/play" className="btn-primary inline-block px-8 py-3.5">
            Play a Quick Match
          </a>

          <p className="text-xs text-ccb-muted mt-4 max-w-sm mx-auto">
            Got a Battle Challenge link from a friend? You can still accept it directly — just open the link they sent you!
          </p>
        </div>
      </div>
    );
  }

  // Active battle blocking
  if (checkingActive) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-ccb-primary animate-spin mb-3" />
        <p className="text-sm text-ccb-muted">Checking for active battles...</p>
      </div>
    );
  }

  if (activeBattle) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28 sm:py-10 sm:pb-10">
        <div className="text-center py-8">
          <Swords className="w-10 h-10 text-ccb-primary mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-1">You have an active battle</h2>
          <p className="text-sm text-ccb-muted mb-6">
            {activeBattle.stuck ? "It failed to start and got stuck — you can cancel it for a full refund." : "Finish it before starting a new one."}
          </p>
          <div className="flex flex-col items-center gap-3">
            {activeBattle.gameId ? (
              <button onClick={() => router.push(`/game/${activeBattle.gameId}`)} className="btn-primary px-8 py-3.5">
                <Swords className="w-4 h-4 mr-1.5" /> Resume Game
              </button>
            ) : activeBattle.stuck ? (
              <>
                <button onClick={checkActiveBattle} className="btn-secondary px-8 py-3.5">
                  <RefreshCw className="w-4 h-4 mr-1.5" /> Try Again
                </button>
                <button onClick={handleCancelStuck} disabled={cancellingStuck} className="px-8 py-3.5 rounded-xl font-semibold text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                  {cancellingStuck ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-1.5" />}
                  {cancellingStuck ? "Cancelling..." : "Cancel & Refund"}
                </button>
              </>
            ) : (
              <button onClick={checkActiveBattle} className="btn-secondary px-8 py-3.5">
                <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== Searching state =====
  if (state === "searching") {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[70vh] space-y-6 animate-slide-up px-4">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-ccb-primary/10 flex items-center justify-center animate-pulse-glow">
            <Coins className="w-14 h-14 text-ccb-primary" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-ccb-primary/20 border-t-ccb-primary animate-spin" style={{ animationDuration: "1.5s" }} />
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">{formatMKK(selectedStake!)} Battle</h2>
          <p className="text-sm text-ccb-muted">
            {TIME_CONTROLS.find((t) => t.id === selectedTC)?.desc} · Searching for opponent...
          </p>
          <p className="text-xs text-ccb-muted mt-2 tabular-nums">{searchSeconds}s elapsed</p>
        </div>

        {adminNotified && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-ccb-primary/10 border border-ccb-primary/30 text-xs text-ccb-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Admin notified — they may join to play you!</span>
          </div>
        )}

        <div className="w-full max-w-xs p-4 rounded-xl bg-ccb-card border border-ccb-border">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Your stake locked</span>
            <span className="font-semibold">{formatMKK(selectedStake!)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ccb-muted">Win potential</span>
            <span className="font-bold text-ccb-primary">
              {formatMKK(selectedStake! * 2 - Math.round(selectedStake! * 2 * (feePct / 100)))}
            </span>
          </div>
        </div>

        <button onClick={handleLeaveQueue} className="btn-secondary px-8">
          <XCircle className="w-4 h-4 mr-1.5" /> Cancel & Refund
        </button>
      </div>
    );
  }

  // ===== Matched state =====
  if (state === "matched" && opponent) {
    return (
      <div className="max-w-2xl mx-auto text-center py-8 animate-slide-up">
        <div className="mb-2 inline-block">
          <span className="px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-medium">
            OPPONENT FOUND
          </span>
        </div>

        <div className="flex items-center justify-center gap-6 sm:gap-12 my-8">
          <div className="text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-ccb-surface border-2 border-ccb-border flex items-center justify-center mx-auto mb-2">
              <span className="text-xl font-bold">
                {(opponent.display_name || opponent.username || "?").charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="font-semibold text-sm sm:text-base">{opponent.display_name || opponent.username}</p>
            <p className="text-ccb-muted text-xs sm:text-sm">{opponent.rating} Rating</p>
          </div>

          <div className="text-center">
            <span className="text-2xl font-bold text-ccb-muted">VS</span>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-ccb-primary/10 border-2 border-ccb-primary flex items-center justify-center mx-auto mb-2">
              <span className="text-xl font-bold text-ccb-primary">You</span>
            </div>
            <p className="font-semibold text-sm sm:text-base">You</p>
            <p className="text-ccb-muted text-xs sm:text-sm">{myRating} Rating</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-ccb-card border border-ccb-border max-w-xs mx-auto">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Stake</span>
            <span className="font-semibold">{formatMKK(selectedStake!)} each</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ccb-muted">Winner receives</span>
            <span className="font-bold text-ccb-primary">
              {formatMKK(selectedStake! * 2 - Math.round(selectedStake! * 2 * (feePct / 100)))}
            </span>
          </div>
        </div>

        <button onClick={handlePlayBattle} className="btn-primary mt-8 px-10 py-4 text-lg">
          <Swords className="w-5 h-5 mr-2" /> PLAY BATTLE
        </button>
      </div>
    );
  }

  // ===== Challenge a Friend view =====
  if (view === "challenge") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-20 sm:pb-0 animate-slide-up">
        <button onClick={() => setView("main")} className="text-sm text-ccb-muted hover:text-ccb-text flex items-center gap-1">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back
        </button>

        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-ccb-accent/15 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-ccb-accent" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Challenge a Friend</h1>
              <p className="text-sm text-ccb-muted">Set the stakes, share the link, winner takes the pot</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Time Control */}
        <div>
          <h3 className="text-sm font-medium text-ccb-muted mb-3">Time Control</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TIME_CONTROLS.map((tc) => {
              const Icon = tc.icon;
              const isSelected = selectedTC === tc.id;
              return (
                <button key={tc.id} onClick={() => setSelectedTC(tc.id)}
                  className={`tc-btn flex items-center gap-3 text-left ${isSelected ? "tc-active" : ""}`}>
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

        {/* Stake */}
        <div>
          <h3 className="text-sm font-medium text-ccb-muted mb-3">Choose Your Stake</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stakes.map((stake) => {
              const isSelected = selectedStake === stake;
              const canAfford = balance >= stake;
              const payout = stake * 2 - Math.round(stake * 2 * (feePct / 100));
              return (
                <button key={stake} onClick={() => canAfford && setSelectedStake(stake)} disabled={!canAfford}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${
                    isSelected ? "border-ccb-accent bg-ccb-accent/10"
                      : canAfford ? "border-ccb-border bg-ccb-surface hover:border-ccb-accent/50"
                      : "border-ccb-border bg-ccb-surface/50 opacity-50 cursor-not-allowed"
                  }`}>
                  <Coins className={`w-5 h-5 mx-auto mb-2 ${isSelected ? "text-ccb-accent" : "text-ccb-muted"}`} />
                  <p className={`font-bold text-lg ${isSelected ? "text-ccb-accent" : ""}`}>{formatMKK(stake)}</p>
                  <p className="text-xs text-ccb-muted mt-1">Win {formatMKK(payout)}</p>
                  {!canAfford && <p className="text-xs text-red-400 mt-1">Insufficient</p>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        {selectedStake !== null && (
          <div className="p-4 rounded-xl bg-ccb-card border border-ccb-border">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-ccb-muted">Your stake</span>
              <span className="font-semibold">{formatMKK(selectedStake)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-ccb-muted">Time control</span>
              <span className="font-semibold">{TIME_CONTROLS.find((t) => t.id === selectedTC)?.desc}</span>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-ccb-border">
              <span className="text-ccb-muted">Winner receives</span>
              <span className="font-bold text-ccb-accent text-lg">
                {formatMKK(selectedStake * 2 - Math.round(selectedStake * 2 * (feePct / 100)))}
              </span>
            </div>
          </div>
        )}

        <button onClick={handleChallengeFriend} disabled={selectedStake === null || creatingChallenge}
          className="btn-primary w-full text-base py-3.5">
          {creatingChallenge ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5 mr-2" />}
          {creatingChallenge ? "Creating..." : "Create Challenge Link"}
        </button>
      </div>
    );
  }

  // ===== MAIN VIEW — flat, no menu step =====
  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-28 sm:py-6 sm:pb-10 space-y-5">
      {/* Header with balance + rating */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Swords className="w-6 h-6 text-ccb-primary" />
          <h1 className="text-2xl font-bold">Chess Battles</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-ccb-muted">Balance: <span className="font-semibold text-ccb-text">{formatMKK(balance)}</span></span>
          <span className="text-ccb-muted">Rating: <span className="font-semibold text-ccb-text">{myRating}</span></span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Time Control — immediately visible */}
      <div>
        <h3 className="text-sm font-medium text-ccb-muted mb-3">Time Control</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TIME_CONTROLS.map((tc) => {
            const Icon = tc.icon;
            const isSelected = selectedTC === tc.id;
            return (
              <button key={tc.id} onClick={() => setSelectedTC(tc.id)}
                className={`tc-btn flex items-center gap-3 text-left ${isSelected ? "tc-active" : ""}`}>
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

      {/* Stake selection — immediately visible */}
      <div>
        <h3 className="text-sm font-medium text-ccb-muted mb-3">Choose Your Stake</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stakes.map((stake) => {
            const isSelected = selectedStake === stake;
            const canAfford = balance >= stake;
            const payout = stake * 2 - Math.round(stake * 2 * (feePct / 100));
            return (
              <button key={stake} onClick={() => canAfford && setSelectedStake(stake)} disabled={!canAfford}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  isSelected ? "border-ccb-primary bg-ccb-primary/10"
                    : canAfford ? "border-ccb-border bg-ccb-surface hover:border-ccb-primary/50"
                    : "border-ccb-border bg-ccb-surface/50 opacity-50 cursor-not-allowed"
                }`}>
                <Coins className={`w-5 h-5 mx-auto mb-2 ${isSelected ? "text-ccb-primary" : "text-ccb-muted"}`} />
                <p className={`font-bold text-lg ${isSelected ? "text-ccb-primary" : ""}`}>{formatMKK(stake)}</p>
                <p className="text-xs text-ccb-muted mt-1">Win {formatMKK(payout)}</p>
                {!canAfford && <p className="text-xs text-red-400 mt-1">Insufficient</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      {selectedStake !== null && (
        <div className="p-4 rounded-xl bg-ccb-card border border-ccb-border">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Your stake</span>
            <span className="font-semibold">{formatMKK(selectedStake)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Time control</span>
            <span className="font-semibold">{TIME_CONTROLS.find((t) => t.id === selectedTC)?.desc}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Total pot</span>
            <span className="font-semibold">{formatMKK(selectedStake * 2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Platform fee ({feePct}%)</span>
            <span className="font-semibold text-red-400">−{formatMKK(Math.round(selectedStake * 2 * (feePct / 100)))}</span>
          </div>
          <div className="flex items-center justify-between text-sm pt-2 border-t border-ccb-border">
            <span className="text-ccb-muted">Winner receives</span>
            <span className="font-bold text-ccb-primary text-lg">
              {formatMKK(selectedStake * 2 - Math.round(selectedStake * 2 * (feePct / 100)))}
            </span>
          </div>
        </div>
      )}

      {/* Big battle button */}
      <button onClick={handleEnterBattle} disabled={selectedStake === null}
        className="btn-primary w-full text-base py-4 text-lg">
        <Swords className="w-5 h-5 mr-2" /> Enter Battle
      </button>

      <p className="text-xs text-ccb-muted text-center">
        No opponent found in 20s? Admin gets notified. Cancel anytime for a full refund.
      </p>

      {/* Divider */}
      <div className="relative pt-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-ccb-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-ccb-dark px-3 text-xs text-ccb-muted">or</span>
        </div>
      </div>

      {/* Secondary action */}
      <button
        onClick={() => setView("challenge")}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-ccb-border bg-ccb-card px-4 py-3 text-sm font-medium text-ccb-text hover:border-ccb-accent/50 hover:bg-ccb-surface transition-colors"
      >
        <Link2 className="w-4 h-4 text-ccb-accent" />
        Challenge a Friend
      </button>

      {/* How it works — compact */}
      <div className="p-4 rounded-xl bg-ccb-surface border border-ccb-border">
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Target className="w-4 h-4 text-ccb-primary" /> How it works
        </h3>
        <div className="space-y-1.5 text-xs text-ccb-muted">
          <p>1. Pick stake + time — both players lock funds in escrow</p>
          <p>2. Win the game, take the pot (minus {feePct}% platform fee)</p>
          <p>3. Draw triggers Armageddon tiebreak — winner takes the pot</p>
        </div>
      </div>
    </div>
  );
}
