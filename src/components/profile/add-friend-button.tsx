"use client";

import { useEffect, useState } from "react";
import { UserPlus, UserCheck, Loader2, Clock } from "lucide-react";

type Status = "none" | "pending_out" | "pending_in" | "accepted" | "self" | "loading";

export default function AddFriendButton({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/friends/status?userId=${userId}`)
      .then((r) => (r.ok ? r.json() : { status: "none" }))
      .then((d) => { if (alive) setStatus(d.status || "none"); })
      .catch(() => { if (alive) setStatus("none"); });
    return () => { alive = false; };
  }, [userId]);

  if (status === "self" || status === "loading") return null;

  if (status === "accepted")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
        <UserCheck className="w-4 h-4" /> Friends
      </span>
    );

  if (status === "pending_out")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ccb-muted">
        <Clock className="w-4 h-4" /> Request sent
      </span>
    );

  if (status === "pending_in")
    return (
      <a href="/friends" className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-emerald-600 text-white">
        <UserCheck className="w-4 h-4" /> Accept friend request
      </a>
    );

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setStatus(data.status === "accepted" ? "accepted" : "pending_out");
      else setErr(data.error || "Failed");
    } catch { setErr("Failed"); } finally { setBusy(false); }
  };

  return (
    <button
      onClick={send}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-ccb-accent text-white disabled:opacity-60"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
      {err ? "Try again" : "Add Friend"}
    </button>
  );
}
