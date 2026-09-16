"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrency } from "@/hooks/use-currency";
import {
  Swords, Clock, Coins, Zap, AlertCircle, Loader2, Link2, Copy, Check,
  RefreshCw, XCircle, ChevronRight, Users, Target, Sparkles, ArrowRight,
} from "lucide-react";
import Link from "next/link";

// Single fixed stake for matchmaking battles: MK 1,000
const BATTLE_STAKE = 1000;

// Time controls available for both matchmaking battles and challenges
const BATTLE_TIME_CONTROLS = [
  { id: "bullet", label: "Bullet", desc: "1+0" },
  { id: "blitz3", label: "Blitz", desc: "3+2" },
  { id: "blitz", label: "Blitz", desc: "5+0" },
  { id: "rapid", label: "Rapid", desc: "10+0" },
  { id: "rapid15", label: "Rapid", desc: "15+10" },
  { id: "classical", label: "Classical", desc: "30+0" },
];

// Keep for backward compat with any references
const CHALLENGE_TIME_CONTROLS = BATTLE_TIME_CONTROLS;

// Currency formatting is handled by the useCurrency hook inside the component.

interface BattleConfig {
  enabled: boolean;
  stake_levels: number[];
  platform_fee_pct: number;
  rating_range: number;
  initial_minutes: number;
  increment_seconds: number;
  queue_timeout_s?: number;
}

type View = "main" | "challenge";

// Auto-matchmaking (fixed-stake queue) is hidden until the player base is
// large enough (~10,000 players). Challenges are the default battles flow.
// Flip this to true to bring back the find-match landing view.
const FIND_MATCH_ENABLED = false;
type BattleState = "select" | "searching" | "matched" | "playing";

export default function BattlesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [view, setView] = useState<View>(FIND_MATCH_ENABLED ? "main" : "challenge");
  const [config, setConfig] = useState<BattleConfig | null>(null);
  const [balance, setBalance] = useState(0);
  const [userCountry, setUserCountry] = useState<string | null>(null);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  // Battles unlocked for all players — no minimum game requirement
  const [state, setState] = useState<BattleState>("select");
  const [battleId, setBattleId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<{ username: string; display_name: string; rating: number } | null>(null);
  const [myRating, setMyRating] = useState(1200);
  const [error, setError] = useState<string | null>(null);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [challengeUrl, setChallengeUrl] = useState<string | null>(null);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [challengeCopied, setChallengeCopied] = useState(false);
  const [selectedBattleTC, setSelectedBattleTC] = useState("rapid15");
  const [selectedChallengeTC, setSelectedChallengeTC] = useState("rapid15");
  const [adminNotified, setAdminNotified] = useState(false);
  const [checkingActive, setCheckingActive] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [activeBattle, setActiveBattle] = useState<{
    battleId: string;
    gameId?: string;
    status: string;
    stuck?: boolean;
    stake?: number;
  } | null>(null);
  const [cancellingStuck, setCancellingStuck] = useState(false);

  // Live currency conversion — all money displayed to the user uses this
  const { formatMoney: fmtCurrency, formatRewardMoney: fmtFee, convert: convertCurrency, formatWallet, toMWK, currencySymbol: _curSym, rate: fxRate, currencyCode: currencyCode, loaded: currencyLoaded } = useCurrency(userCountry);

  // Currency state
  // Currency via shared hook — provides formatMoney(), convert(), rate, etc.

  // Challenge a Friend — custom stake
  const [customStake, setCustomStake] = useState<string>("");
  const [stakeError, setStakeError] = useState<string | null>(null);

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
        if (data.gameId && (data.status === "playing" || data.status === "draw_armageddon")) {
          router.push(`/game/${data.gameId}`);
          return;
        }
      } else if (data.queued) {
        // Resume a battle search that was already in progress (e.g. the
        // player backgrounded or closed the app mid-search) instead of
        // leaving them stuck on the select screen with no way to leave.
        setState("searching");
        setSearchSeconds(data.ageSeconds || 0);
        if ((data.ageSeconds || 0) >= 20) setAdminNotified(true);
      } else if (data.queueExpired) {
        setError(data.message || "Your previous search timed out and was refunded.");
        loadProfile();
      }
    } catch {}
    setCheckingActive(false);
  }, [router]);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("rating, wallet_balance, games_played, country")
      .eq("id", user.id)
      .single();
    if (profile) {
      setMyRating(profile.rating ?? 1200);
      setBalance(profile.wallet_balance ?? 0);
      setGamesPlayed(profile.games_played ?? 0);
      setUserCountry(profile.country);
    }
    setProfileLoaded(true);
  };

  useEffect(() => {
    checkActiveBattle();
    loadProfile();
    fetch("/api/battles/challenge/cleanup-expired", { method: "POST" }).catch(() => {});
    fetch("/api/battles/config")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d?.error) return;
        setConfig(d);
      })
      .catch(() => {});
    // Currency is loaded via useCurrency hook — no manual fetch needed.
  }, [checkActiveBattle]);

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
      if (data.corrected && data.gameId) {
        // Battle status was corrected (game was still live) — redirect to the game.
        router.push(`/game/${data.gameId}`);
        return;
      }
      setActiveBattle(null);
      loadProfile();
    } catch { setError("Failed to cancel"); }
    setCancellingStuck(false);
  };

  useEffect(() => {
    if (state !== "searching") return;

    searchIntervalRef.current = setInterval(() => {
      setSearchSeconds((s) => s + 1);
    }, 1000);

    pollRef.current = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;

      const { data: queueEntry } = await supabase
        .from("battle_queue")
        .select("status, battle_id, created_at")
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
        return;
      }

      // Queue entry was cleared/expired externally (e.g. self-healed by
      // another tab or the /api/battles/active check) — return to select.
      if (!queueEntry || queueEntry.status !== "waiting") {
        setState("select");
        setSearchSeconds(0);
        loadProfile();
        return;
      }

      // Enforce the configured queue timeout client-side too — no opponent
      // found in time, auto-leave and refund instead of searching forever.
      const timeoutS = config?.queue_timeout_s ?? 120;
      const ageS = Math.floor((Date.now() - new Date(queueEntry.created_at).getTime()) / 1000);
      if (ageS >= timeoutS) {
        await fetch("/api/battles/leave", { method: "POST" });
        setState("select");
        setSearchSeconds(0);
        setAdminNotified(false);
        setError("No opponent found in time — your stake was refunded. Try again!");
        loadProfile();
      }
    }, 2000);

    adminNotifyRef.current = setTimeout(async () => {
      try {
        await fetch("/api/notify-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timeControl: selectedBattleTC,
            rated: true,
            context: "battle",
            stake: BATTLE_STAKE,
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
  }, [state, supabase]);

  const handleEnterBattle = async () => {
    setError(null);

    if (balance < convertCurrency(BATTLE_STAKE)) {
      setError(`Insufficient balance. You need ${fmtCurrency(BATTLE_STAKE)}. Deposit funds first.`);
      return;
    }

    try {
      const res = await fetch("/api/battles/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stake: BATTLE_STAKE, timeControl: selectedBattleTC }),
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
    setStakeError(null);
    const stakeValue = parseInt(customStake, 10); // entered in the PLAYER'S OWN currency

    if (!customStake || isNaN(stakeValue) || stakeValue <= 0) {
      setStakeError("Enter a valid stake amount");
      return;
    }

    // Non-MWK players: don't let a request through before we know the real
    // FX rate — toMWK() would otherwise silently treat their local amount
    // as if it were already MWK.
    if (currencyCode !== "MWK" && !currencyLoaded) {
      setStakeError("Loading exchange rate — try again in a moment");
      return;
    }

    const stake = toMWK(stakeValue); // convert to MWK, the wallet's internal ledger unit

    if (balance < convertCurrency(stake)) {
      setStakeError(`Insufficient balance. You need ${fmtCurrency(stake)}.`);
      return;
    }

    setError(null);
    setChallengeUrl(null);
    setCreatingChallenge(true);
    try {
      const res = await fetch("/api/battles/challenge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stake, timeControl: selectedChallengeTC }),
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
        body: JSON.stringify({ battleId, timeControl: selectedBattleTC }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to start game"); return; }
      router.push(`/game/${data.gameId}`);
    } catch { setError("Failed to start battle game"); }
  };

  const feePct = config?.platform_fee_pct ?? 10;
  // Owner decision 2026-09-15: mirror the server's calcPayout floor — a
  // non-zero fee rate never rounds down to 0 MWK, even on small stakes.
  const feeAmount = feePct > 0 ? Math.max(1, Math.round(BATTLE_STAKE * 2 * (feePct / 100))) : 0;
  const payout = BATTLE_STAKE * 2 - feeAmount;

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

  if (!profileLoaded) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-ccb-primary animate-spin mb-3" />
        <p className="text-sm text-ccb-muted">Loading battles...</p>
      </div>
    );
  }
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
      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-6 pb-28 sm:py-10 sm:pb-10">
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
      <div className="max-w-2xl lg:max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[70vh] space-y-6 animate-slide-up px-4">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-ccb-primary/10 flex items-center justify-center animate-pulse-glow">
            <Coins className="w-14 h-14 text-ccb-primary" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-ccb-primary/20 border-t-ccb-primary animate-spin" style={{ animationDuration: "1.5s" }} />
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">{fmtCurrency(BATTLE_STAKE)} Battle</h2>
          <p className="text-sm text-ccb-muted">
            {(BATTLE_TIME_CONTROLS.find(tc => tc.id === selectedBattleTC)?.desc || "15+10")} · Searching for opponent...
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
            <span className="font-semibold">{fmtCurrency(BATTLE_STAKE)}</span>
          </div>
          {currencyCode !== "MWK" && (
            <div className="flex items-center justify-between text-xs text-ccb-muted mb-2">
              <span>≈ in your currency</span>
              <span>{fmtCurrency(BATTLE_STAKE)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-ccb-muted">Win potential</span>
            <span className="font-bold text-ccb-primary">
              {fmtCurrency(payout)}
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
      <div className="max-w-2xl lg:max-w-5xl mx-auto text-center py-8 animate-slide-up">
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
            <span className="font-semibold">{fmtCurrency(BATTLE_STAKE)} each</span>
          </div>
          {currencyCode !== "MWK" && (
            <div className="flex items-center justify-between text-xs text-ccb-muted mb-2">
              <span>≈ in your currency</span>
              <span>{fmtCurrency(BATTLE_STAKE)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-ccb-muted">Winner receives</span>
            <span className="font-bold text-ccb-primary">
              {fmtCurrency(payout)}
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
      <div className="max-w-2xl lg:max-w-5xl mx-auto space-y-6 px-4 sm:px-0 pb-20 sm:pb-0 animate-slide-up">
        {/* Balance + rating header */}
        <div className="pt-2 sm:pt-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-ccb-muted">Balance: <span className="font-semibold text-ccb-text">{formatWallet(balance)}</span></span>
            <span className="text-ccb-muted">Rating: <span className="font-semibold text-ccb-text">{myRating}</span></span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-ccb-accent/15 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-ccb-accent" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Challenge a Friend</h1>
              <p className="text-sm text-ccb-muted">Set a custom stake, share the link, winner takes the pot</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Time Control — selectable for challenges */}
        <div>
          <h3 className="text-sm font-medium text-ccb-muted mb-3">Time Control</h3>
          <div className="grid grid-cols-3 gap-2">
            {CHALLENGE_TIME_CONTROLS.map((tc) => (
              <button
                key={tc.id}
                onClick={() => setSelectedChallengeTC(tc.id)}
                className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 transition-all ${
                  selectedChallengeTC === tc.id
                    ? "border-ccb-accent bg-ccb-accent/10"
                    : "border-ccb-border bg-ccb-surface hover:border-ccb-accent/50"
                }`}
              >
                <Clock className={`w-4 h-4 ${selectedChallengeTC === tc.id ? "text-ccb-accent" : "text-ccb-muted"}`} />
                <span className={`text-sm font-semibold ${selectedChallengeTC === tc.id ? "text-ccb-accent" : "text-ccb-text"}`}>{tc.label}</span>
                <span className="text-xs text-ccb-muted">{tc.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Stake Input — amount is always in the PLAYER'S OWN currency */}
        <div>
          <h3 className="text-sm font-medium text-ccb-muted mb-3">Custom Stake Amount ({currencyCode})</h3>
          <div className="relative">
            <input
              type="number"
              value={customStake}
              onChange={(e) => { setCustomStake(e.target.value); setStakeError(null); }}
              placeholder="e.g. 1000"
              min="1"
              className="w-full px-4 py-4 rounded-xl bg-ccb-surface border-2 border-ccb-border text-lg font-bold focus:outline-none focus:border-ccb-accent transition-colors"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ccb-muted text-sm font-medium">{currencyCode}</span>
          </div>
          {stakeError && (
            <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {stakeError}
            </p>
          )}
          {customStake && !isNaN(parseInt(customStake)) && parseInt(customStake) > 0 && (
            <div className="mt-3 p-4 rounded-xl bg-ccb-card border border-ccb-border">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-ccb-muted">Your stake</span>
                <span className="font-semibold">{_curSym} {parseInt(customStake).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-ccb-muted">Time control</span>
                <span className="font-semibold">{CHALLENGE_TIME_CONTROLS.find(tc => tc.id === selectedChallengeTC)?.desc || "15+10"}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-ccb-border">
                <span className="text-ccb-muted">Winner receives</span>
                <span className="font-bold text-ccb-accent text-lg">
                  {_curSym} {(parseInt(customStake) * 2 - Math.round(parseInt(customStake) * 2 * (feePct / 100))).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleChallengeFriend} disabled={!customStake || creatingChallenge}
          className="btn-primary w-full text-base py-3.5">
          {creatingChallenge ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5 mr-2" />}
          {creatingChallenge ? "Creating..." : "Create Challenge Link"}
        </button>

        {/* How challenges work */}
        <div className="p-4 rounded-xl bg-ccb-surface/50 border border-ccb-border">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-ccb-muted" /> How Battles Work
          </h3>
          <ol className="space-y-2 text-xs text-ccb-muted">
            <li className="flex gap-2">
              <span className="font-semibold text-ccb-text">1.</span>
              <span>Set any stake you like and share the challenge link with a friend</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-ccb-text">2.</span>
              <span>When they accept, both stakes lock in escrow</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-ccb-text">3.</span>
              <span>Play the game — winner takes the pot (platform keeps {feePct}%)</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-ccb-text">4.</span>
              <span>Unaccepted or expired challenges are always fully refunded</span>
            </li>
          </ol>
          <Link
            href="/how-battles-work"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ccb-accent hover:underline"
          >
            Learn how battles work <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // ===== MAIN VIEW — simplified, fixed stake + time control =====
  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-4 pb-28 sm:py-6 sm:pb-10 space-y-5">
      {/* Header with balance + rating */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Swords className="w-6 h-6 text-ccb-primary" />
          <h1 className="text-2xl font-bold">Chess Battles</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-ccb-muted">Balance: <span className="font-semibold text-ccb-text">{formatWallet(balance)}</span></span>
          <span className="text-ccb-muted">Rating: <span className="font-semibold text-ccb-text">{myRating}</span></span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          {error.toLowerCase().includes("battle queue") && (
            <button
              onClick={async () => {
                await fetch("/api/battles/leave", { method: "POST" });
                setError(null);
                loadProfile();
              }}
              className="text-red-300 hover:text-red-200 font-semibold underline shrink-0 ml-2"
            >
              Leave Queue
            </button>
          )}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300 shrink-0">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Battle configuration card — fixed stake + time control */}
      <div className="p-5 rounded-2xl bg-ccb-card border border-ccb-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-ccb-muted">Battle Configuration</h3>
          <span className="px-2.5 py-1 rounded-full bg-ccb-primary/10 text-ccb-primary text-xs font-medium">Standard</span>
        </div>

        {/* Time control — selectable */}
        <div className="mb-4 pb-4 border-b border-ccb-border">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-ccb-primary" />
            <p className="text-xs font-medium text-ccb-muted">Time Control</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {BATTLE_TIME_CONTROLS.map((tc) => (
              <button
                key={tc.id}
                onClick={() => setSelectedBattleTC(tc.id)}
                className={`flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-lg border-2 transition-all ${
                  selectedBattleTC === tc.id
                    ? "border-ccb-primary bg-ccb-primary/10"
                    : "border-ccb-border bg-ccb-surface hover:border-ccb-primary/50"
                }`}
              >
                <span className={`text-xs font-semibold ${selectedBattleTC === tc.id ? "text-ccb-primary" : "text-ccb-text"}`}>{tc.label}</span>
                <span className="text-[10px] text-ccb-muted">{tc.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Stake */}
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-ccb-border">
          <div className="w-10 h-10 rounded-xl bg-ccb-accent/10 flex items-center justify-center">
            <Coins className="w-5 h-5 text-ccb-accent" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-ccb-muted">Stake</p>
            <p className="text-sm font-semibold">{fmtCurrency(BATTLE_STAKE)}</p>
            {currencyCode !== "MWK" && (
              <p className="text-xs text-ccb-muted mt-0.5">≈ {fmtCurrency(BATTLE_STAKE)}</p>
            )}
          </div>
        </div>

        {/* Payout summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ccb-muted">Total pot</span>
            <span className="font-semibold">{fmtCurrency(BATTLE_STAKE * 2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ccb-muted">Platform fee ({feePct}%)</span>
            <span className="font-semibold text-red-400">−{fmtFee(feeAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-sm pt-2 border-t border-ccb-border">
            <span className="text-ccb-muted">Winner receives</span>
            <span className="font-bold text-ccb-primary text-lg">
              {fmtCurrency(payout)}
            </span>
          </div>
        </div>
      </div>

      {/* Insufficient balance warning */}
      {balance < convertCurrency(BATTLE_STAKE) && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Insufficient balance. You need {fmtCurrency(BATTLE_STAKE)}.
            <a href="/wallet" className="underline font-medium ml-1">Deposit funds →</a>
          </span>
        </div>
      )}

      {/* Big battle button */}
      <button
        onClick={handleEnterBattle}
        disabled={balance < convertCurrency(BATTLE_STAKE)}
        className="btn-primary w-full text-base py-4 disabled:opacity-50 disabled:cursor-not-allowed">
        <Swords className="w-5 h-5 mr-2" /> Find Battle · {fmtCurrency(BATTLE_STAKE)}
      </button>

      {/* Challenge a friend */}
      <button
        onClick={() => setView("challenge")}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-ccb-accent bg-ccb-accent/10 border border-ccb-accent/30 hover:bg-ccb-accent/20 transition-colors text-sm">
        <Link2 className="w-4 h-4" /> Challenge a Friend — Custom Stake
      </button>

      {/* How it works */}
      <div className="p-4 rounded-xl bg-ccb-surface/50 border border-ccb-border">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-ccb-muted" /> How Battles Work
        </h3>
        <ol className="space-y-2 text-xs text-ccb-muted">
          <li className="flex gap-2">
            <span className="font-semibold text-ccb-text">1.</span>
            <span>Both players lock {fmtCurrency(BATTLE_STAKE)} in escrow</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-ccb-text">2.</span>
            <span>Play a {(BATTLE_TIME_CONTROLS.find(tc => tc.id === selectedBattleTC)?.desc || "15+10")} {(BATTLE_TIME_CONTROLS.find(tc => tc.id === selectedBattleTC)?.label || "Rapid")} game — winner takes the pot</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-ccb-text">3.</span>
            <span>Platform takes {feePct}% fee. Winner receives {fmtCurrency(payout)}</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-ccb-text">4.</span>
            <span>Players worldwide can match up — stake shown in your currency</span>
          </li>
        </ol>
        <Link
          href="/how-battles-work"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ccb-accent hover:underline"
        >
          Learn how battles work <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
