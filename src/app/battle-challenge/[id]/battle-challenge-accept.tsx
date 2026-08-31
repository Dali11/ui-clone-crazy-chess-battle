"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Swords, Loader2, Wallet, Smartphone, Check, AlertCircle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { detectOperator } from "@/lib/operator";
import { moneySymbol } from "@/lib/geo/format";

let _sym = "MK";
function setSym(s: string) { _sym = s; }
function formatMKK(amount: number): string {
  return `${_sym} ${Math.floor(amount).toLocaleString("en-US")}`;
}

const TIME_CONTROL_LABELS: Record<string, string> = {
  bullet: "Bullet · 1+0",
  blitz3: "Blitz · 3+2",
  blitz: "Blitz · 5+0",
  rapid: "Rapid · 10+0",
  rapid15: "Rapid · 15+10",
  classical: "Classical · 30+0",
};

interface Props {
  challengeId: string;
  challengerName: string;
  challengerRating: number;
  stake: number;
  timeControl: string;
  feePct: number;
  initialBalance: number;
  email: string;
  phone: string;
}

export default function BattleChallengeAccept({
  challengeId,
  challengerName,
  challengerRating,
  stake,
  timeControl,
  feePct,
  initialBalance,
  email,
  phone: savedPhone,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [balance, setBalance] = useState(initialBalance);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shortfall = Math.max(0, stake - balance);
  const canAfford = shortfall === 0;

  const pot = stake * 2;
  const fee = Math.round(pot * (feePct / 100));
  const payout = pot - fee;

  // Deposit widget state
  const [depositAmount, setDepositAmount] = useState(Math.max(500, Math.ceil(shortfall)));
  const [phone, setPhone] = useState(savedPhone || "");
  const [depositing, setDepositing] = useState(false);
  const [pendingChargeId, setPendingChargeId] = useState<string | null>(null);
  const [depositMsg, setDepositMsg] = useState<string | null>(null);
  const [depositErr, setDepositErr] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_balance, country")
      .eq("id", user.id)
      .single();
    if (profile) { setBalance(profile.wallet_balance ?? 0); setSym(moneySymbol(profile.country)); }
  }, [supabase]);

  // Poll deposit verification once a mobile money payment is initiated
  useEffect(() => {
    if (!pendingChargeId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chargeId: pendingChargeId }),
        });
        const data = await res.json();

        if (data.status === "success") {
          clearInterval(interval);
          setPendingChargeId(null);
          setDepositMsg("Deposit confirmed! You can now accept the challenge.");
          await refreshBalance();
        } else if (data.status === "failed") {
          clearInterval(interval);
          setPendingChargeId(null);
          setDepositErr("Deposit failed or timed out. Please try again.");
        }
      } catch {}
    }, 4000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (pendingChargeId) {
        setPendingChargeId(null);
        setDepositErr("Deposit verification timed out. If you completed the payment, your balance will update shortly — try refreshing.");
      }
    }, 180000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pendingChargeId, refreshBalance]);

  const handleDeposit = async () => {
    setDepositing(true);
    setDepositErr(null);
    setDepositMsg(null);

    try {
      if (!phone || phone.length < 9) {
        setDepositErr("Enter a valid phone number (e.g., 0991234567)");
        setDepositing(false);
        return;
      }
      if (depositAmount < shortfall) {
        setDepositErr(`Deposit at least ${_sym} ${Math.ceil(shortfall).toLocaleString()} to cover the stake.`);
        setDepositing(false);
        return;
      }

      const res = await fetch("/api/payments/deposit/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: depositAmount,
          phone,
          operatorRefId: detectOperator(phone),
          email,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Payment failed. Please try again.");

      setPendingChargeId(data.chargeId);
      setDepositMsg("Check your phone to authorize the payment. Waiting for confirmation...");
    } catch (err: any) {
      setDepositErr(err.message || "Something went wrong. Please try again.");
    } finally {
      setDepositing(false);
    }
  };

  const handleAccept = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/battles/challenge/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        if (data.insufficientFunds) {
          setBalance(data.balance ?? balance);
        }
        throw new Error(data.error || "Failed to accept challenge");
      }

      // Battle created — now start the actual chess game.
      // Retry once on transient failure before surfacing an error — accept is
      // idempotent so re-calling /start with the same battleId is always safe.
      const tryStart = async () => {
        const startRes = await fetch("/api/battles/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ battleId: data.battleId, timeControl }),
        });
        return { ok: startRes.ok, data: await startRes.json() };
      };

      let { ok, data: startData } = await tryStart();
      if (!ok || !startData.gameId) {
        await new Promise((r) => setTimeout(r, 1200));
        ({ ok, data: startData } = await tryStart());
      }
      if (!ok || !startData.gameId) {
        throw new Error(
          (startData.error || "Failed to start the game") + " Your stake is safely locked — tap Accept Battle to try again."
        );
      }

      router.push(`/game/${startData.gameId}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4 py-8">
      <div className="card max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-ccb-primary/10 flex items-center justify-center">
            <Swords className="w-8 h-8 text-ccb-primary" />
          </div>
          <h1 className="text-xl font-bold">You've Been Challenged to a Battle!</h1>
          <p className="text-sm text-ccb-muted">
            <span className="font-semibold text-foreground">{challengerName}</span> ({challengerRating}) staked{" "}
            <span className="font-semibold text-foreground">{formatMKK(stake)}</span> and wants to battle
          </p>
        </div>

        <div className="p-4 rounded-xl bg-ccb-surface border border-ccb-border">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Stake (each)</span>
            <span className="font-semibold text-ccb-text">{formatMKK(stake)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Time control</span>
            <span className="font-semibold text-ccb-text">{TIME_CONTROL_LABELS[timeControl] || timeControl}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Platform fee ({feePct}%)</span>
            <span className="font-semibold text-red-400">−{formatMKK(fee)}</span>
          </div>
          <div className="flex items-center justify-between text-sm pt-2 border-t border-ccb-border">
            <span className="text-ccb-muted">Winner receives</span>
            <span className="font-bold text-ccb-primary text-lg">{formatMKK(payout)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm px-1">
          <span className="text-ccb-muted">Your balance</span>
          <span className={`font-semibold ${canAfford ? "text-ccb-text" : "text-red-400"}`}>{formatMKK(balance)}</span>
        </div>

        {error && (
          <div className="text-sm text-ccb-danger bg-ccb-danger/10 border border-ccb-danger/20 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!canAfford && (
          <div className="space-y-4 p-4 rounded-xl bg-ccb-primary/5 border border-ccb-primary/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="w-4 h-4 text-ccb-primary" />
              <span>You need {formatMKK(shortfall)} more to accept</span>
            </div>
            <p className="text-xs text-ccb-muted">Top up now — your balance updates automatically the moment payment confirms.</p>

            <div>
              <label className="text-xs text-ccb-muted mb-1 block">Amount (MWK)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                className="input-field w-full"
                min={Math.ceil(shortfall)}
              />
            </div>

            <div>
              <label className="text-xs text-ccb-muted mb-1 block">Phone Number</label>
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-ccb-muted" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0991234567"
                  className="input-field flex-1"
                />
              </div>
            </div>

            {depositMsg && (
              <p className="text-xs text-green-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> {depositMsg}
              </p>
            )}
            {depositErr && <p className="text-xs text-ccb-danger">{depositErr}</p>}

            <button
              onClick={handleDeposit}
              disabled={depositing || !!pendingChargeId}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {depositing || pendingChargeId ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{pendingChargeId ? "Waiting for confirmation..." : "Processing..."}</span>
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  <span>Deposit {_sym} {depositAmount.toLocaleString()}</span>
                </>
              )}
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => router.push("/battles")} className="btn-secondary flex-1">
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={loading || !canAfford}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Swords className="w-4 h-4" />
                <span>Accept Battle</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
