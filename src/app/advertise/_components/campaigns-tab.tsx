"use client";

import { useState } from "react";
import { BarChart3, Eye, MousePointerClick, Megaphone, ExternalLink, Pencil } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { type Campaign, STATUS_BADGE, audienceLabel, ctr } from "./shared";
import EditCampaignModal from "./edit-campaign-modal";

/** Statuses where the advertiser may still edit their campaign. */
const EDITABLE = new Set(["pending_review", "rejected", "active", "paused"]);

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending_review", label: "In review" },
  { key: "active", label: "Live" },
  { key: "ended", label: "Finished" },
  { key: "rejected", label: "Not approved" },
];

export default function CampaignsTab({
  campaigns,
  loading,
  onRefresh,
}: {
  campaigns: Campaign[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  const { formatMoney } = useCurrency();
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered =
    filter === "all" ? campaigns : campaigns.filter((c) => c.status === filter);

  const totalSpend = campaigns.reduce((a, c) => a + c.price_mwk, 0);
  const totalImpressions = campaigns.reduce((a, c) => a + c.impressions, 0);
  const totalClicks = campaigns.reduce((a, c) => a + c.clicks, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-ccb-muted text-sm">
        Loading campaigns…
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ccb-border bg-ccb-surface p-8 text-center">
        <Megaphone className="w-8 h-8 text-ccb-muted mx-auto mb-3" />
        <p className="text-sm font-semibold text-ccb-text">No campaigns yet</p>
        <p className="text-xs text-ccb-muted mt-1">
          Your campaigns and their live stats will appear here once you place your first order.
        </p>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 rounded-full bg-ccb-surface border border-ccb-border px-4 py-2 text-xs font-semibold text-emerald-500 shadow-lg">
          {toast}
        </div>
      )}
      {editing && (
        <EditCampaignModal
          campaign={editing}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            setToast(message);
            setTimeout(() => setToast(null), 4000);
            await onRefresh();
          }}
        />
      )}
    <div className="space-y-4">
      {/* Aggregate stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3 text-center">
          <p className="text-base font-bold text-ccb-text">{formatMoney(totalSpend)}</p>
          <p className="text-[11px] text-ccb-muted">Total spend</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3 text-center">
          <p className="text-base font-bold text-ccb-text">
            {totalImpressions.toLocaleString()}
          </p>
          <p className="text-[11px] text-ccb-muted">Impressions</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3 text-center">
          <p className="text-base font-bold text-ccb-text">{ctr(totalClicks, totalImpressions)}</p>
          <p className="text-[11px] text-ccb-muted">Click rate</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const n =
            f.key === "all" ? campaigns.length : campaigns.filter((c) => c.status === f.key).length;
          if (f.key !== "all" && n === 0) return null;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.key
                  ? "bg-ccb-primary text-white"
                  : "bg-ccb-border/40 text-ccb-muted hover:text-ccb-text"
              }`}
            >
              {f.label} {n > 0 && <span className="opacity-70">({n})</span>}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-ccb-muted text-center py-6">No campaigns in this view.</p>
        ) : (
          filtered.map((c) => {
            const badge = STATUS_BADGE[c.status] || {
              label: c.status,
              cls: "bg-ccb-muted/15 text-ccb-muted",
            };
            // Run progress for live campaigns
            let progress: number | null = null;
            if (c.status === "active" && c.starts_at && c.ends_at) {
              const start = new Date(c.starts_at).getTime();
              const end = new Date(c.ends_at).getTime();
              const now = Date.now();
              progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
            }
            return (
              <div key={c.id} className="rounded-xl border border-ccb-border bg-ccb-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ccb-text truncate">{c.headline}</p>
                    <p className="text-xs text-ccb-muted truncate">
                      {c.business_name} · {c.weeks}w · {formatMoney(c.price_mwk)} ·{" "}
                      {audienceLabel(c.target_country, c.target_gender)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </div>

                {/* Creative thumbnail */}
                {c.image_url && (
                  <div className="mt-2 rounded-md border border-ccb-border overflow-hidden bg-ccb-bg/60 max-h-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image_url} alt="" className="w-full max-h-20 object-contain" />
                  </div>
                )}

                {c.reject_reason && (
                  <p className="mt-1 text-xs text-red-500">{c.reject_reason}</p>
                )}

                {progress !== null && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-ccb-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-ccb-primary"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-ccb-muted">
                      Runs until {new Date(c.ends_at!).toLocaleDateString()} · {Math.round(progress)}%
                      complete
                    </p>
                  </div>
                )}
                {(c.status === "pending_review" || c.status === "ended") && c.ends_at && (
                  <p className="mt-1 text-[11px] text-ccb-muted">
                    {c.status === "pending_review"
                      ? `Submitted ${new Date(c.created_at).toLocaleDateString()}`
                      : `Ran ${new Date(c.starts_at || c.created_at).toLocaleDateString()} – ${new Date(c.ends_at).toLocaleDateString()}`}
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-ccb-muted">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> {c.impressions.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="w-3.5 h-3.5" /> {c.clicks.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 className="w-3.5 h-3.5" /> {ctr(c.clicks, c.impressions)} CTR
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {EDITABLE.has(c.status) && (
                      <button
                        type="button"
                        onClick={() => { setEditing(c); setToast(null); }}
                        className="flex items-center gap-1 text-[11px] font-semibold text-ccb-muted hover:text-ccb-primary"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )}
                    <a
                      href={c.target_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-ccb-muted hover:text-ccb-primary"
                    >
                      <ExternalLink className="w-3 h-3" /> Link
                    </a>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
    </>
  );
}
