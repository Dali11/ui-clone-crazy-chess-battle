"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Disc3, Loader2, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function DraughtsChallengeWaiting({ url, challengeId, expiresAt }: { url: string; challengeId: string; expiresAt?: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      try {
        const res = await fetch("/api/draughts/challenge/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId }),
        });
        const data = await res.json();
        if (!active) return;
        if (data.status === "accepted" && data.gameId) {
          router.push(`/draughts/game/${data.gameId}`);
          return;
        }
        if (data.status === "expired" || data.status === "cancelled") {
          setExpired(true);
          return;
        }
      } catch {}
    };
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => { active = false; clearInterval(interval); };
  }, [challengeId, router]);

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const diff = Math.floor((target - Date.now()) / 1000);
      if (diff <= 0) { setRemainingSec(0); setExpired(true); return; }
      setRemainingSec(diff);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`draughts_challenge:${challengeId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "draughts_challenges", filter: `id=eq.${challengeId}` }, (payload: any) => {
        const n = payload.new;
        if (n.status === "accepted" && n.game_id) router.push(`/draughts/game/${n.game_id}`);
        else if (n.status === "expired" || n.status === "cancelled") setExpired(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [challengeId, router]);

  if (expired) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-ccb-border bg-ccb-card shadow-2xl p-5 text-center">
          <h1 className="text-base font-bold text-ccb-text mb-1">Challenge Expired</h1>
          <p className="text-xs text-ccb-muted mb-4">This challenge was not accepted in time.</p>
          <button
            onClick={() => router.push("/draughts")}
            className="w-full rounded-xl py-3 text-sm font-bold bg-ccb-primary text-white hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Back to Draughts
          </button>
        </div>
      </div>
    );
  }

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
            <Disc3 className="w-6 h-6 text-ccb-primary" />
          </div>
        </div>

        <h1 className="text-base font-bold text-ccb-text text-center mb-1">Challenge Sent</h1>
        <p className="text-xs text-ccb-muted text-center mb-4">Share this link with your friend</p>

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

        {remainingSec !== null && remainingSec > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-ccb-muted mb-4">
            <Clock className="w-3 h-3" />
            <span>Link expires in</span>
            <span className="font-bold text-ccb-primary tabular-nums">
              {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-[11px] text-ccb-muted mb-4">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Waiting for opponent to accept...</span>
        </div>

        <button
          onClick={() => router.push("/draughts")}
          className="w-full text-xs font-semibold text-ccb-muted hover:text-ccb-text transition-colors"
        >
          Back to Draughts
        </button>
      </div>
    </div>
  );
}
