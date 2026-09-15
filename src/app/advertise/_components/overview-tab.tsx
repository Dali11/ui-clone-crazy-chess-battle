"use client";

import { Megaphone, Eye, ShieldCheck, Rocket, ArrowRight, Wallet, MapPin } from "lucide-react";
import { adTiers } from "@/lib/ads/direct-pricing";
import { useCurrency } from "@/hooks/use-currency";
import { type AudienceStats, type Campaign, ctr } from "./shared";

const PLACEMENTS = [
  "Home dashboard",
  "Cash battles lobby",
  "Live matches page",
  "League pages",
  "Tournament pages",
  "Game screens (before & after)",
];

export default function OverviewTab({
  audience,
  campaigns,
  walletBalance,
  pricePerWeekMwk,
  onStart,
}: {
  audience: AudienceStats | null;
  campaigns: Campaign[];
  walletBalance: number;
  pricePerWeekMwk: number;
  onStart: () => void;
}) {
  const { formatWallet, formatMoney } = useCurrency();
  const tiers = adTiers(pricePerWeekMwk || 5000);

  const liveCount = campaigns.filter((c) => c.status === "active").length;
  const totalImpressions = campaigns.reduce((a, c) => a + c.impressions, 0);
  const totalClicks = campaigns.reduce((a, c) => a + c.clicks, 0);

  return (
    <div className="space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3">
          <p className="text-[11px] text-ccb-muted flex items-center gap-1">
            <Eye className="w-3 h-3" /> Players reached
          </p>
          <p className="text-lg font-bold text-ccb-text">
            {audience ? audience.total.toLocaleString() : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3">
          <p className="text-[11px] text-ccb-muted flex items-center gap-1">
            <Megaphone className="w-3 h-3" /> Your live ads
          </p>
          <p className="text-lg font-bold text-ccb-text">{liveCount}</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3">
          <p className="text-[11px] text-ccb-muted flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Ad placements
          </p>
          <p className="text-lg font-bold text-ccb-text">{PLACEMENTS.length}</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface p-3">
          <p className="text-[11px] text-ccb-muted flex items-center gap-1">
            <Wallet className="w-3 h-3" /> Wallet balance
          </p>
          <p className="text-lg font-bold text-ccb-text">{formatWallet(walletBalance)}</p>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-ccb-border bg-ccb-surface p-5">
        <h2 className="text-sm font-bold text-ccb-text mb-4">How advertising works here</h2>
        <div className="space-y-4">
          {[
            {
              icon: Megaphone,
              title: "1 · Design your ad",
              text: "Write your headline, add an optional image, and pick who sees it — by country and gender.",
            },
            {
              icon: ShieldCheck,
              title: "2 · We review it",
              text: "Every campaign is checked before it goes live — usually the same day. No bots, no fake clicks.",
            },
            {
              icon: Rocket,
              title: "3 · It goes live",
              text: "Your ad rotates through every placement in the app, with impressions and clicks tracked in real time.",
            },
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ccb-primary/10 flex items-center justify-center shrink-0">
                <s.icon className="w-4 h-4 text-ccb-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ccb-text">{s.title}</p>
                <p className="text-xs text-ccb-muted leading-relaxed">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Placements */}
        <div className="rounded-2xl border border-ccb-border bg-ccb-surface p-5">
          <h2 className="text-sm font-bold text-ccb-text mb-3">Where players see your ad</h2>
          <ul className="space-y-2">
            {PLACEMENTS.map((p) => (
              <li key={p} className="flex items-center gap-2 text-xs text-ccb-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-ccb-primary shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Pricing + specs */}
        <div className="rounded-2xl border border-ccb-border bg-ccb-surface p-5">
          <h2 className="text-sm font-bold text-ccb-text mb-3">Flat weekly rates</h2>
          <div className="space-y-2 mb-4">
            {tiers.map((t) => (
              <div key={t.weeks} className="flex items-center justify-between text-xs">
                <span className="text-ccb-muted">
                  {t.weeks} {t.weeks === 1 ? "week" : "weeks"}
                  {t.weeks === 2 && <span className="text-emerald-500 font-semibold"> · 5% off</span>}
                  {t.weeks === 4 && <span className="text-emerald-500 font-semibold"> · 12.5% off</span>}
                </span>
                <span className="font-bold text-ccb-text">{formatMoney(t.priceMwk)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ccb-muted leading-relaxed">
            Best image sizes: <span className="text-ccb-text">1200×628</span> (link ad) or{" "}
            <span className="text-ccb-text">1080×1080</span> (square). JPG, PNG or WebP. Links must
            be https. Paid straight from your CCB wallet.
          </p>
        </div>
      </div>

      {/* Your performance snapshot */}
      {campaigns.length > 0 && (
        <div className="rounded-2xl border border-ccb-border bg-ccb-surface p-5">
          <h2 className="text-sm font-bold text-ccb-text mb-3">Your performance so far</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-ccb-text">{totalImpressions.toLocaleString()}</p>
              <p className="text-[11px] text-ccb-muted">Impressions</p>
            </div>
            <div>
              <p className="text-lg font-bold text-ccb-text">{totalClicks.toLocaleString()}</p>
              <p className="text-[11px] text-ccb-muted">Clicks</p>
            </div>
            <div>
              <p className="text-lg font-bold text-ccb-text">{ctr(totalClicks, totalImpressions)}</p>
              <p className="text-[11px] text-ccb-muted">Click rate</p>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={onStart}
        className="w-full rounded-xl bg-ccb-primary px-4 py-3 text-sm font-bold text-white flex items-center justify-center gap-2"
      >
        Start a campaign <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
