"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Swords, X, Clock, CheckCircle2 } from "lucide-react";

export default function BattleChallengeWaiting({
  challengeId,
  url,
  stakeLabel,
  expiresAt,
}: {
  challengeId: string;
  url: string;
  stakeLabel: string;
  expiresAt?: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const refundingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch("/api/battles/challenge/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (pollRef.current) clearInterval(pollRef.current);
        setRefunded(true);
      } else {
        setError(data.error || "Failed to cancel challenge");
      }
    } catch {
      setError("Failed to cancel challenge");
    }
    setCancelling(false);
  };

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();

    const triggerRefund = async () => {
      if (refundingRef.current) return;
      refundingRef.current = true;
      try {
        const res = await fetch("/api/battles/challenge/refund-expired", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId }),
        });
        const data = await res.json();
        if (res.ok && (data.refunded || data.alreadyRefunded)) {
          setRefunded(true);
        } else if (!res.ok && data.error) {
          setError(data.error);
        }
      } catch {
        // Network error — the server-side expiry handler will still refund
      }
    };

    const tick = () => {
      const diff = Math.floor((target - Date.now()) / 1000);
      if (diff <= 0) {
        setRemainingSec(0);
        if (pollRef.current) clearInterval(pollRef.current);
        triggerRefund();
        return;
      }
      setRemainingSec(diff);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, challengeId]);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/battles/challenge/status?challengeId=${challengeId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "accepted" && data.battleId) {
          if (pollRef.current) clearInterval(pollRef.current);
          const startRes = await fetch("/api/battles/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ battleId: data.battleId }),
          });
          const startData = await startRes.json();
          if (startRes.ok && startData.gameId) {
            router.push(`/game/${startData.gameId}`);
          } else {
            setError(startData.error || "Failed to start the game.");
          }
        } else if (data.status === "expired" || data.status === "cancelled") {
          if (pollRef.current) clearInterval(pollRef.current);
          setRefunded(true);
        }
      } catch {}
    }, 2500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [challengeId, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-ccb-border bg-ccb-card shadow-2xl p-5">
        {/* Status badge */}
        <div className="flex items-center justify-center mb-4">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-ccb-primary/10 text-ccb-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-ccb-primary animate-pulse" />
            Waiting for Opponent
          </span>
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-3">
          <div className="w-14 h-14 rounded-full bg-ccb-primary/10 flex items-center justify-center">
            <Swords className="w-6 h-6 text-ccb-primary" />
          </div>
        </div>

        <h1 className="text-base font-bold text-ccb-text text-center mb-1">Battle Challenge Sent</h1>
        <p className="text-xs text-ccb-muted text-center mb-4">
          Stake <span className="font-bold text-ccb-text">{stakeLabel}</span> each — share this link with your friend
        </p>

        {/* Link field */}
        <div className="flex items-center gap-2 mb-3">
          <input
            readOnly
            value={url}
            className="flex-1 min-w-0 rounded-xl bg-ccb-surface border border-ccb-border px-3 py-2.5 text-xs text-ccb-text truncate"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            onClick={handleCopy}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-ccb-surface border border-ccb-border text-ccb-text hover:bg-ccb-surface/70 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        {copied && <p className="text-[10px] text-emerald-400 text-center mb-2">Copied to clipboard!</p>}

        {error && (
          <p className="text-xs text-ccb-danger bg-ccb-danger/10 border border-ccb-danger/20 rounded-xl p-2.5 text-center mb-3">
            {error}
          </p>
        )}

        {remainingSec !== null && remainingSec > 0 && !refunded && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-ccb-muted mb-4">
            <Clock className="w-3 h-3" />
            <span>Link expires in</span>
            <span className="font-bold text-ccb-primary tabular-nums">
              {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </span>
          </div>
        )}

        {refunded ? (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-center space-y-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-sm font-bold text-emerald-400">Stake Refunded</p>
            <p className="text-xs text-ccb-muted">Your challenge was cancelled and your stake has been returned to your wallet.</p>
            <a href="/wallet" className="inline-block text-xs font-bold text-ccb-primary hover:text-ccb-primary/80 mt-1.5">View Wallet →</a>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-ccb-muted text-center mb-4">
              Your stake is locked. The battle starts automatically once they accept.
            </p>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-ccb-danger/30 bg-ccb-danger/5 text-ccb-danger text-sm font-bold py-3 transition-colors hover:bg-ccb-danger/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
              {cancelling ? "Cancelling..." : "Cancel Challenge & Refund Stake"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
