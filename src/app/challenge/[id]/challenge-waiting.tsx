"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Swords, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ChallengeWaiting({ url, challengeId, expiresAt }: { url: string; challengeId: string; expiresAt?: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const polledRef = useRef(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Poll for challenge status every 2 seconds
  useEffect(() => {
    let active = true;

    const checkStatus = async () => {
      try {
        const res = await fetch("/api/challenge/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId }),
        });
        const data = await res.json();

        if (!active) return;

        if (data.status === "accepted" && data.gameId) {
          router.push(`/game/${data.gameId}`);
          return;
        }
        if (data.status === "expired" || data.status === "cancelled") {
          setExpired(true);
          return;
        }
      } catch {
        // Network error — keep polling
      }
    };

    // Check immediately, then every 2 seconds
    checkStatus();
    const interval = setInterval(checkStatus, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [challengeId, router]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const diff = Math.floor((target - Date.now()) / 1000);
      if (diff <= 0) {
        setRemainingSec(0);
        setExpired(true);
        return;
      }
      setRemainingSec(diff);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Also try Supabase realtime (works if migration is applied)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`challenge:${challengeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `id=eq.${challengeId}`,
        },
        (payload: any) => {
          const newRecord = payload.new;
          if (newRecord.status === "accepted" && newRecord.game_id) {
            router.push(`/game/${newRecord.game_id}`);
          } else if (newRecord.status === "expired" || newRecord.status === "cancelled") {
            setExpired(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [challengeId, router]);

  if (expired) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <h1 className="text-2xl font-bold">Challenge Expired</h1>
          <p className="text-ccb-muted">This challenge was not accepted in time.</p>
          <button onClick={() => router.push("/play")} className="btn-primary">Back to Play</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="card max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-ccb-primary/10 flex items-center justify-center mx-auto relative">
          <span className="w-3 h-3 rounded-full bg-ccb-primary animate-pulse" />
        </div>
        <h1 className="text-xl font-bold">Waiting for opponent...</h1>
        <p className="text-sm text-ccb-muted">Share this link with your friend:</p>
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
        {remainingSec !== null && remainingSec > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-ccb-muted">
            <span>Link expires in </span>
            <span className="font-bold text-ccb-primary tabular-nums">
              {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </span>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 text-xs text-ccb-muted pt-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Waiting for opponent to accept...</span>
        </div>
        <p className="text-xs text-ccb-muted">
          The game will start automatically when they accept.
        </p>
      </div>
    </div>
  );
}
