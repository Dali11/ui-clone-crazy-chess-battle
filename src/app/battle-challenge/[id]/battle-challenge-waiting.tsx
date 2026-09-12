"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Swords, X, Clock, CheckCircle2, MessageCircle, Search, Send, Loader2, ChevronDown, ChevronUp } from "lucide-react";

type InvitablePlayer = {
  id: string;
  username: string;
  avatarUrl: string | null;
  rating: number | null;
  gamesPlayed: number;
  lastPlayed: string;
  invited: boolean;
};

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

  // ===== Invite past opponents via DM =====
  const [showInvites, setShowInvites] = useState(false);
  const [opponents, setOpponents] = useState<InvitablePlayer[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const loadOpponents = useCallback(async () => {
    setLoadingInvites(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/battles/challenge/invitable?challengeId=${challengeId}`);
      const data = await res.json();
      if (res.ok) {
        setOpponents(data.opponents || []);
      } else {
        setInviteError(data.error || "Failed to load players");
      }
    } catch {
      setInviteError("Failed to load players");
    } finally {
      setLoadingInvites(false);
    }
  }, [challengeId]);

  const handleToggleInvites = () => {
    if (!showInvites && opponents.length === 0 && !loadingInvites) {
      loadOpponents();
    }
    setShowInvites(!showInvites);
  };

  const togglePlayer = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = search.trim()
    ? opponents.filter((o) => o.username?.toLowerCase().includes(search.trim().toLowerCase()))
    : opponents;
  const selectable = filtered.filter((o) => !o.invited);
  const allSelected = selectable.length > 0 && selectable.every((o) => selected.has(o.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        selectable.forEach((o) => next.delete(o.id));
      } else {
        selectable.forEach((o) => next.add(o.id));
      }
      return next;
    });
  };

  const handleSendInvites = async () => {
    if (sending || selected.size === 0) return;
    setSending(true);
    setInviteError(null);
    setSentNotice(null);
    try {
      const res = await fetch("/api/battles/challenge/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, userIds: [...selected] }),
      });
      const data = await res.json();
      if (res.ok) {
        const sentIds = new Set([...selected]);
        setOpponents((prev) => prev.map((o) => (sentIds.has(o.id) ? { ...o, invited: true } : o)));
        setSelected(new Set());
        setSentNotice(`Invites sent to ${data.sent} player${data.sent === 1 ? "" : "s"}`);
      } else {
        setInviteError(data.error || "Failed to send invites");
      }
    } catch {
      setInviteError("Failed to send invites");
    } finally {
      setSending(false);
    }
  };

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

        {/* Invite past opponents via DM */}
        {!refunded && (
          <div className="mb-3 rounded-xl border border-ccb-border bg-ccb-surface/50 overflow-hidden">
            <button
              onClick={handleToggleInvites}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left hover:bg-ccb-surface/80 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-ccb-text">
                <MessageCircle className="w-4 h-4 text-ccb-primary" />
                Invite players you&apos;ve battled before
              </span>
              {showInvites ? (
                <ChevronUp className="w-4 h-4 text-ccb-muted shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-ccb-muted shrink-0" />
              )}
            </button>

            {showInvites && (
              <div className="border-t border-ccb-border">
                {/* Search + select all */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-ccb-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search username..."
                      className="w-full rounded-lg bg-ccb-surface border border-ccb-border pl-8 pr-2.5 py-1.5 text-xs text-ccb-text focus:outline-none focus:border-ccb-primary"
                    />
                  </div>
                  {selectable.length > 0 && (
                    <button
                      onClick={toggleAll}
                      className="shrink-0 text-[11px] font-semibold text-ccb-primary hover:underline"
                    >
                      {allSelected ? "Deselect all" : "Select all"}
                    </button>
                  )}
                </div>

                {/* Player list */}
                {loadingInvites ? (
                  <div className="flex items-center justify-center gap-2 py-5 text-xs text-ccb-muted">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading players...
                  </div>
                ) : opponents.length === 0 ? (
                  <p className="px-4 pb-4 pt-1 text-[11px] text-ccb-muted text-center">
                    Play some games first — players you&apos;ve faced will show up here for quick invites.
                  </p>
                ) : (
                  <>
                    <div className="max-h-52 overflow-y-auto divide-y divide-ccb-border/60">
                      {filtered.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => !o.invited && togglePlayer(o.id)}
                          disabled={o.invited}
                          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
                            o.invited
                              ? "opacity-60 cursor-default"
                              : selected.has(o.id)
                                ? "bg-ccb-primary/10"
                                : "hover:bg-ccb-surface/70"
                          }`}
                        >
                          {o.invited ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <span
                              className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                                selected.has(o.id)
                                  ? "border-ccb-primary bg-ccb-primary"
                                  : "border-ccb-border"
                              }`}
                            >
                              {selected.has(o.id) && <Check className="w-2.5 h-2.5 text-white" />}
                            </span>
                          )}
                          {o.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={o.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <span className="w-7 h-7 rounded-full bg-ccb-primary/15 text-ccb-primary text-xs font-bold flex items-center justify-center shrink-0">
                              {(o.username || "?").charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs font-semibold text-ccb-text truncate">{o.username}</span>
                            <span className="block text-[10px] text-ccb-muted">
                              {o.gamesPlayed} game{o.gamesPlayed === 1 ? "" : "s"} together
                            </span>
                          </span>
                          {o.rating != null && (
                            <span className="text-[10px] font-semibold text-ccb-muted shrink-0">{o.rating}</span>
                          )}
                        </button>
                      ))}
                      {filtered.length === 0 && (
                        <p className="px-4 py-5 text-[11px] text-ccb-muted text-center">No players match &quot;{search}&quot;</p>
                      )}
                    </div>

                    {/* Send button */}
                    <div className="px-3 py-3 bg-ccb-surface/70">
                      <button
                        onClick={handleSendInvites}
                        disabled={sending || selected.size === 0}
                        className="btn-primary w-full text-xs py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        {sending
                          ? "Sending..."
                          : selected.size === 0
                            ? "Select players to invite"
                            : `Send invite to ${selected.size} player${selected.size === 1 ? "" : "s"}`}
                      </button>
                    </div>
                  </>
                )}

                {sentNotice && (
                  <p className="px-3.5 pb-3 text-[11px] text-emerald-400 text-center">{sentNotice}</p>
                )}
                {inviteError && (
                  <p className="px-3.5 pb-3 text-[11px] text-ccb-danger text-center">{inviteError}</p>
                )}
              </div>
            )}
          </div>
        )}

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
