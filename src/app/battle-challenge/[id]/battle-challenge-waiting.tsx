"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Swords } from "lucide-react";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const diff = Math.floor((target - Date.now()) / 1000);
      if (diff <= 0) {
        setRemainingSec(0);
        if (pollRef.current) clearInterval(pollRef.current);
        setError("This challenge has expired.");
        return;
      }
      setRemainingSec(diff);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

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
          setError(`This challenge has ${data.status}.`);
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
        {remainingSec !== null && remainingSec > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-ccb-muted">
            <span>Link expires in </span>
            <span className="font-bold text-ccb-primary tabular-nums">
              {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </span>
          </div>
        )}
        <p className="text-xs text-ccb-muted">
          Your stake is locked. The battle starts automatically once they accept.
        </p>
      </div>
    </div>
  );
}
