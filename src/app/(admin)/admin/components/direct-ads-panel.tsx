"use client";

// Direct-ad campaign moderation. Lists every campaign with advertiser +
// creative + stats; approve/reject/pause/resume/refund via
// GET/PATCH /api/admin/ads.

import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, MousePointerClick, Pause, Play, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";

interface AdCampaign {
  id: string;
  business_name: string;
  headline: string;
  body: string | null;
  image_url: string | null;
  target_url: string;
  weeks: number;
  price_mwk: number;
  target_country: string | null;
  target_gender: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  clicks: number;
  reject_reason: string | null;
  created_at: string;
  advertiser?: { username?: string; email?: string } | null;
}

const fmtMK = (n: number) => `MK${(n || 0).toLocaleString("en-MW")}`;

export default function DirectAdsPanel() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/ads", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Failed to load campaigns"); return; }
      setCampaigns(d.campaigns || []);
      setError(null);
    } catch {
      setError("Network error loading campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: string, reject_reason?: string) => {
    setBusy(id + action);
    try {
      const r = await fetch("/api/admin/ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reject_reason ? { id, action, reject_reason } : { id, action }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || `Failed to ${action}`); return; }
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="pt-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-ccb-muted" /></div>;
  }

  return (
    <div className="pt-4 space-y-3">
      {error && <p className="text-sm text-red-500">{error}</p>}
      {campaigns.length === 0 && (
        <p className="text-sm text-ccb-muted py-2">No campaigns yet. Players buy them at /advertise.</p>
      )}
      {campaigns.map((c) => (
        <div key={c.id} className="rounded-lg border border-ccb-border bg-ccb-surface p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-ccb-text truncate">{c.headline}</p>
              <p className="text-xs text-ccb-muted truncate">
                {c.business_name} · by {c.advertiser?.username || "?"} ({c.advertiser?.email || "no email"}) · Audience: {(c.target_country ? c.target_country : "all countries") + (c.target_gender ? ` · ${c.target_gender}` : "")}
              </p>
              {c.body && <p className="text-xs text-ccb-muted truncate mt-0.5">{c.body}</p>}
              <a href={c.target_url} target="_blank" rel="noopener noreferrer nofollow" className="text-[11px] text-ccb-primary break-all hover:underline">
                {c.target_url}
              </a>
            </div>
            <div className="text-right shrink-0">
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                c.status === "active" ? "bg-emerald-500/15 text-emerald-500"
                : c.status === "pending_review" ? "bg-yellow-500/15 text-yellow-500"
                : c.status === "rejected" ? "bg-red-500/15 text-red-500"
                : "bg-ccb-muted/15 text-ccb-muted"
              }`}>{c.status.replace("_", " ")}</span>
              <p className="text-xs text-ccb-muted mt-1">{c.weeks}w · {fmtMK(c.price_mwk)}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-ccb-muted">
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {c.impressions.toLocaleString()}</span>
            <span className="flex items-center gap-1"><MousePointerClick className="w-3.5 h-3.5" /> {c.clicks.toLocaleString()}</span>
            {c.image_url && (
              <a href={c.image_url} target="_blank" rel="noopener noreferrer" className="text-ccb-primary hover:underline">banner image</a>
            )}
          </div>

          {c.status === "pending_review" && (
            <div className="flex gap-2">
              <button
                onClick={() => act(c.id, "approve")} disabled={busy === c.id + "approve"}
                className="flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Approve — go live
              </button>
              <button
                onClick={() => {
                  const reason = prompt("Reject reason (shown to the advertiser):", "Not approved");
                  if (reason !== null) act(c.id, "reject", reason || "Not approved");
                }}
                disabled={busy === c.id + "reject"}
                className="flex items-center gap-1.5 rounded-md bg-red-600/90 hover:bg-red-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                <ThumbsDown className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          )}
          {c.status === "active" && (
            <button
              onClick={() => act(c.id, "pause")} disabled={busy === c.id + "pause"}
              className="flex items-center gap-1.5 rounded-md bg-orange-600 hover:bg-orange-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          )}
          {(c.status === "paused" || c.status === "rejected") && (
            <button
              onClick={() => act(c.id, "resume")} disabled={busy === c.id + "resume"}
              className="flex items-center gap-1.5 rounded-md bg-ccb-primary hover:bg-ccb-primary/90 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> {c.status === "paused" ? "Resume" : "Activate"}
            </button>
          )}
          {(c.status === "pending_review" || c.status === "rejected" || c.status === "paused") && (
            <button
              onClick={() => { if (confirm(`Refund ${fmtMK(c.price_mwk)} to the advertiser's wallet?`)) act(c.id, "refund"); }}
              disabled={busy === c.id + "refund"}
              className="flex items-center gap-1.5 rounded-md border border-ccb-border hover:bg-ccb-bg px-3 py-1.5 text-xs font-bold text-ccb-muted disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Refund
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
