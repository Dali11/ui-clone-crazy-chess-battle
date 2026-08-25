"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Swords, X } from "lucide-react";

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
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="card max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-ccb-primary/10 flex items-center justify-center mx-auto">
          <span className="w-3 h-3 rounded-full bg-ccb-primary animate-pulse" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <Swords className="w-5 h-5 text-ccb-primary" />
          <h1 className="text-xl font-bold">Waiting for opponent...</h1>
        </div>
        <p className="text-sm text-ccb-muted">
          Stake: <span className="font-semibold text-ccb-text">{stakeLabel}</span> each — share this link with your friend:
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            className="input-field flex-1 text-xs"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button onClick={handleCopy} className="btn-secondary px-3">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        {copied && <p className="text-xs text-green-400">Copied to clipboard!</p>}
        {error && (
          <p className="text-xs text-ccb-danger bg-ccb-danger/10 border border-ccb-danger/20 rounded-lg p-2">
            {error}
          </p>
        )}
        {remainingSec !== null && remainingSec > 0 && !refunded && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-ccb-muted">
            <span>Link expires in </span>
            <span className="font-bold text-ccb-primary tabular-nums">
              {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </span>
          </div>
        )}
        {refunded && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-1">
            <p className="text-sm font-semibold text-emerald-400">Stake Refunded</p>
            <p className="text-xs text-ccb-muted">Your challenge was cancelled and your stake has been returned to your wallet.</p>
            <a href="/wallet" className="inline-block text-xs font-semibold text-ccb-primary hover:text-ccb-primary/80 mt-1">View Wallet →</a>
          </div>
        )}
        {!refunded && (
          <>
            <p className="text-xs text-ccb-muted">
              Your stake is locked. The battle starts automatically once they accept.
            </p>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="inline-flex items-center justify-center gap-1.5 w-full rounded-lg border border-ccb-danger/30 bg-ccb-danger/5 text-ccb-danger text-sm font-semibold py-2.5 px-4 transition-colors hover:bg-ccb-danger/10 disabled:opacity-50 disabled:cursor-not-allowed"
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
