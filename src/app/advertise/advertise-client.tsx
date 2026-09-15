"use client";

// Self-serve direct advertising — organized as a tabbed panel:
//   Overview (how it works, reach, pricing) · New Campaign (3-step
//   order wizard) · My Campaigns (stats, filters, management).
//
// Backend: GET /api/ads/config (pricing), GET/POST /api/ads/campaigns,
// GET /api/ads/audience. Wallet balance is passed in from the server page.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Megaphone, PlusCircle, BarChart3 } from "lucide-react";
import { type AudienceStats, type Campaign } from "./_components/shared";
import OverviewTab from "./_components/overview-tab";
import OrderTab from "./_components/order-tab";
import CampaignsTab from "./_components/campaigns-tab";

type TabKey = "overview" | "order" | "campaigns";

export default function AdvertiseClient({
  walletBalance,
}: {
  walletBalance: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("overview");
  const [enabled, setEnabled] = useState(false);
  const [pricePerWeekMwk, setPricePerWeekMwk] = useState(5000);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [audience, setAudience] = useState<AudienceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [cfgR, mineR, audR] = await Promise.all([
        fetch("/api/ads/config", { cache: "no-store" }),
        fetch("/api/ads/campaigns", { cache: "no-store" }),
        fetch("/api/ads/audience", { cache: "no-store" }),
      ]);
      if (audR.ok) setAudience(await audR.json());
      const cfg = await cfgR.json();
      setEnabled(!!cfg.directAds?.enabled);
      setPricePerWeekMwk(Number(cfg.directAds?.pricePerWeekMwk) || 5000);
      if (mineR.ok) {
        const d = await mineR.json();
        setCampaigns(d.campaigns || []);
      }
    } catch {
      setError("Couldn't load ad data. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onOrdered = () => {
    // New campaign purchased — refresh wallet + campaigns, land on campaigns
    router.refresh();
    refresh();
    setTab("campaigns");
  };

  const TABS: { key: TabKey; label: string; icon: typeof Megaphone }[] = [
    { key: "overview", label: "Overview", icon: Info },
    ...(enabled
      ? [{ key: "order" as TabKey, label: "New Campaign", icon: PlusCircle }]
      : []),
    { key: "campaigns", label: "My Campaigns", icon: BarChart3 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-ccb-border border-t-ccb-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 sm:pb-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-ccb-text">Advertise on Crazy Chess Battles</h1>
        <p className="text-sm text-ccb-muted">
          Flat weekly rates. No bidding, no bots — real players, real clicks.
        </p>
      </div>

      {!enabled ? (
        <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4 text-sm text-ccb-muted">
          Self-serve ads are not open right now. Check back soon — or message us in the community
          chat and we&apos;ll set you up manually.
        </div>
      ) : (
        <>
          {/* Tabs — horizontally scrollable so it never overflows/pushes
              the page width on narrow screens (3 tabs don't all fit at
              once on small phones). */}
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1.5 rounded-xl border border-ccb-border bg-ccb-surface p-1 w-max min-w-full sm:min-w-0">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                    tab === t.key
                      ? "bg-ccb-primary text-white"
                      : "text-ccb-muted hover:text-ccb-text"
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {tab === "overview" && (
            <OverviewTab
              audience={audience}
              campaigns={campaigns}
              walletBalance={walletBalance}
              pricePerWeekMwk={pricePerWeekMwk}
              onStart={() => setTab("order")}
            />
          )}
          {tab === "order" && (
            <OrderTab
              audience={audience}
              walletBalance={walletBalance}
              pricePerWeekMwk={pricePerWeekMwk}
              onOrdered={onOrdered}
            />
          )}
          {tab === "campaigns" && <CampaignsTab campaigns={campaigns} loading={false} onRefresh={refresh} />}
        </>
      )}
    </div>
  );
}
