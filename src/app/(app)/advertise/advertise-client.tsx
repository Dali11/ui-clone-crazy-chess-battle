"use client";

// Self-serve direct advertising. Players (and outside businesses, once
// they have a wallet) buy flat weekly banner campaigns from wallet
// balance; admin approves; campaigns rotate through every ad slot with
// live impression/click stats.
//
// Backend: GET /api/ads/config (pricing), GET/POST /api/ads/campaigns.

import { useCallback, useEffect, useState } from "react";
import { BarChart3, ExternalLink, Eye, Loader2, MousePointerClick } from "lucide-react";
import { adTiers, type AdWeeks } from "@/lib/ads/direct-pricing";
import { useCurrency } from "@/hooks/use-currency";

interface Campaign {
  id: string;
  business_name: string;
  headline: string;
  body: string | null;
  image_url: string | null;
  target_url: string;
  weeks: number;
  price_mwk: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  clicks: number;
  reject_reason: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_review: { label: "In review", cls: "bg-yellow-500/15 text-yellow-500" },
  active: { label: "Live", cls: "bg-emerald-500/15 text-emerald-500" },
  paused: { label: "Paused", cls: "bg-orange-500/15 text-orange-500" },
  rejected: { label: "Not approved", cls: "bg-red-500/15 text-red-500" },
  ended: { label: "Finished", cls: "bg-ccb-muted/15 text-ccb-muted" },
  refunded: { label: "Refunded", cls: "bg-ccb-muted/15 text-ccb-muted" },
};

export default function AdvertiseClient() {
  const { formatMoney } = useCurrency();
  const [enabled, setEnabled] = useState(false);
  const [tiers, setTiers] = useState<{ weeks: number; priceMwk: number }[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // form
  const [businessName, setBusinessName] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [weeks, setWeeks] = useState<AdWeeks>(1);

  const refresh = useCallback(async () => {
    try {
      const [cfgR, mineR] = await Promise.all([
        fetch("/api/ads/config", { cache: "no-store" }),
        fetch("/api/ads/campaigns", { cache: "no-store" }),
      ]);
      const cfg = await cfgR.json();
      setEnabled(!!cfg.directAds?.enabled);
      setTiers(adTiers(Number(cfg.directAds?.pricePerWeekMwk) || 5000));
      if (mineR.ok) {
        const d = await mineR.json();
        setCampaigns(d.campaigns || []);
      }
    } catch {
      setError("Couldn't load ad pricing. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null); setSubmitting(true);
    try {
      const res = await fetch("/api/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          headline,
          body: body || null,
          image_url: imageUrl || null,
          target_url: targetUrl,
          weeks,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Couldn't create the campaign. Try again.");
      } else {
        const charged = d.campaign.currency_code && d.campaign.currency_code !== "MWK"
          ? new Intl.NumberFormat("en", { style: "currency", currency: d.campaign.currency_code, maximumFractionDigits: 0 }).format(d.campaign.charged_local)
          : `MK${d.campaign.price_mwk.toLocaleString()}`;
        setSuccess(`Campaign submitted — paid ${charged} from your wallet. We'll review it shortly.`);
        setBusinessName(""); setHeadline(""); setBody(""); setImageUrl(""); setTargetUrl(""); setWeeks(1);
        refresh();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ccb-text">Advertise on Crazy Chess Battles</h1>
        <p className="text-sm text-ccb-muted">Flat weekly rates. No bidding, no bots — real players, real clicks.</p>
      </div>

      {!enabled ? (
        <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4 text-sm text-ccb-muted">
          Self-serve ads are not open right now. Check back soon — or message us in the community chat and we&apos;ll set you up manually.
        </div>
      ) : (
        <>
          {/* Pricing */}
          <div className="grid grid-cols-3 gap-2">
            {tiers.map((t) => (
              <button
                key={t.weeks}
                type="button"
                onClick={() => setWeeks(t.weeks as AdWeeks)}
                className={`rounded-lg border p-3 text-center transition-colors ${
                  weeks === t.weeks
                    ? "border-ccb-primary bg-ccb-primary/10"
                    : "border-ccb-border bg-ccb-surface hover:border-ccb-muted/50"
                }`}
              >
                <p className="text-sm font-bold text-ccb-text">{t.weeks} {t.weeks === 1 ? "week" : "weeks"}</p>
                <p className="text-xs text-ccb-muted">{t.weeks === 1 ? "full price" : t.weeks === 2 ? "5% off" : "12.5% off"}</p>
                <p className="mt-1 text-base font-bold text-ccb-primary">{formatMoney(t.priceMwk)}</p>
              </button>
            ))}
          </div>

          {/* Buy form */}
          <form onSubmit={submit} className="rounded-lg border border-ccb-border bg-ccb-surface p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-ccb-muted">Business name *</label>
              <input
                value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={60} required
                placeholder="e.g. Chibondo Hardware"
                className="mt-1 w-full rounded-md border border-ccb-border bg-ccb-bg px-3 py-2 text-sm text-ccb-text placeholder:text-ccb-muted/50 focus:border-ccb-primary outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ccb-muted">Headline *</label>
              <input
                value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={60} required
                placeholder="e.g. Quality building materials, wholesale prices"
                className="mt-1 w-full rounded-md border border-ccb-border bg-ccb-bg px-3 py-2 text-sm text-ccb-text placeholder:text-ccb-muted/50 focus:border-ccb-primary outline-none"
              />
              <p className="mt-0.5 text-[11px] text-ccb-muted">{headline.length}/60</p>
            </div>
            <div>
              <label className="text-xs font-medium text-ccb-muted">Body text (optional)</label>
              <input
                value={body} onChange={(e) => setBody(e.target.value)} maxLength={120}
                placeholder="One short supporting line"
                className="mt-1 w-full rounded-md border border-ccb-border bg-ccb-bg px-3 py-2 text-sm text-ccb-text placeholder:text-ccb-muted/50 focus:border-ccb-primary outline-none"
              />
              <p className="mt-0.5 text-[11px] text-ccb-muted">{body.length}/120</p>
            </div>
            <div>
              <label className="text-xs font-medium text-ccb-muted">Banner image URL (optional)</label>
              <input
                value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} type="url"
                placeholder="https://… (wide banner, e.g. 1200×300)"
                className="mt-1 w-full rounded-md border border-ccb-border bg-ccb-bg px-3 py-2 text-sm text-ccb-text placeholder:text-ccb-muted/50 focus:border-ccb-primary outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ccb-muted">Destination link * (https only)</label>
              <input
                value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} type="url" required
                placeholder="https://your-site.com or a WhatsApp link"
                className="mt-1 w-full rounded-md border border-ccb-border bg-ccb-bg px-3 py-2 text-sm text-ccb-text placeholder:text-ccb-muted/50 focus:border-ccb-primary outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && <p className="text-sm text-emerald-500">{success}</p>}

            <button
              type="submit" disabled={submitting}
              className="w-full rounded-md bg-ccb-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Buy {weeks} {weeks === 1 ? "week" : "weeks"} — {formatMoney(tiers.find((t) => t.weeks === weeks)?.priceMwk || 0)} from wallet
            </button>
            <p className="text-[11px] text-ccb-muted">
              Paid from your CCB wallet balance. Every campaign is reviewed before it goes live — usually same day.
            </p>
          </form>
        </>
      )}

      {/* My campaigns */}
      {campaigns.length > 0 && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ccb-text">
            <BarChart3 className="w-4 h-4 text-ccb-primary" /> My campaigns
          </h2>
          {campaigns.map((c) => {
            const badge = STATUS_BADGE[c.status] || { label: c.status, cls: "bg-ccb-muted/15 text-ccb-muted" };
            return (
              <div key={c.id} className="rounded-lg border border-ccb-border bg-ccb-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ccb-text truncate">{c.headline}</p>
                    <p className="text-xs text-ccb-muted truncate">{c.business_name} · {c.weeks}w · {formatMoney(c.price_mwk)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
                </div>
                {c.reject_reason && <p className="mt-1 text-xs text-red-500">{c.reject_reason}</p>}
                {c.status === "active" && c.ends_at && (
                  <p className="mt-1 text-[11px] text-ccb-muted">Runs until {new Date(c.ends_at).toLocaleDateString()}</p>
                )}
                <div className="mt-2 flex items-center gap-4 text-xs text-ccb-muted">
                  <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {c.impressions.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><MousePointerClick className="w-3.5 h-3.5" /> {c.clicks.toLocaleString()}</span>
                  <a href={c.target_url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-ccb-primary">
                    <ExternalLink className="w-3.5 h-3.5" /> View
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
