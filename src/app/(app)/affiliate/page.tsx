export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Gift, Crown, TrendingUp } from "lucide-react";
import { referralLink } from "@/lib/affiliate/labels";
import { formatUsd } from "@/lib/geo/format";
import { getPlatformConfig } from "@/lib/platform-config";
import { pageMetadata } from "@/lib/seo/metadata";
import ShareCard from "./_components/share-card";
import EarningsCalculator from "./_components/earnings-calculator";

export const metadata = pageMetadata({
  title: "Affiliate Program — Earn 25% Commission",
  description:
    "Invite friends to Crazy Chess Battles and earn 25% of every battle fee, paid tournament entry, and membership fee they generate. Ongoing commissions, paid to your wallet.",
  path: "/affiliate",
  noIndex: true,
});

export default async function AffiliatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/affiliate");

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, referral_code")
    .eq("id", user.id)
    .single();

  // Membership is a single USD-priced plan (owner decision 2026-09-15) —
  // price_usd comes from platform settings, not hardcoded.
  const mConfig = await getPlatformConfig(admin, "membership");
  const membershipPriceUsd = mConfig.price_usd ?? 10;
  const commissionRate = 0.25;
  const affConfig = await getPlatformConfig(admin, "affiliate");
  const affiliateEnabled = !!affConfig.enabled;

  const refCode = profile?.referral_code || profile?.username || "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://crazychessbattles.live";
  const link = referralLink(baseUrl, refCode);
  const commissionPct = Math.round(commissionRate * 100);
  const membershipEarn = formatUsd(membershipPriceUsd * commissionRate);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Paused notice — tracking still works, payouts wait for the switch */}
      {!affiliateEnabled && (
        <div className="rounded-xl border border-ccb-accent/30 bg-ccb-accent/10 p-4 text-center">
          <p className="text-sm font-semibold text-ccb-accent">Commissions are paused for a moment</p>
          <p className="text-xs text-ccb-muted mt-1">
            Your referral links still track every sign-up — commissions will be credited automatically when the program resumes.
          </p>
        </div>
      )}

      {/* HERO */}
      <div className="relative overflow-hidden bg-gradient-to-br from-ccb-primary/25 via-ccb-card to-ccb-card border border-ccb-primary/30 rounded-2xl p-5 sm:p-7">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-ccb-primary/20 rounded-full blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-ccb-primary/25 border border-ccb-primary/40 flex items-center justify-center shrink-0">
              <Gift className="w-4 h-4 text-ccb-primary" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-ccb-muted">Affiliate Program</p>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold leading-tight">
            Earn <span className="text-ccb-primary">{commissionPct}%</span> of every fee
            <br className="hidden sm:block" /> your friends generate
          </h1>
          <p className="text-sm sm:text-base text-ccb-muted mt-2 max-w-lg">
            Every cash battle they play, every paid tournament they enter, every membership renewal — paid to
            your wallet, forever. No limit.
          </p>

          <div className="mt-5 grid sm:grid-cols-[1fr_auto] gap-2 items-stretch">
            <div className="bg-ccb-surface/70 rounded-xl p-3.5 border border-ccb-border/70 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-ccb-accent/15 border border-ccb-accent/30 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4 text-ccb-accent" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">
                  Membership (per friend, per month)
                </p>
                <p className="text-sm font-bold">
                  {formatUsd(membershipPriceUsd)}
                  <span className="text-xs text-ccb-muted font-medium">/mo</span>
                  <span className="text-ccb-muted mx-1.5">×</span>
                  <span className="text-ccb-muted font-medium">{commissionPct}%</span>
                  <span className="text-ccb-muted mx-1.5">=</span>
                  <span className="text-ccb-success">{membershipEarn}</span>
                  <span className="text-ccb-muted"> to you</span>
                </p>
              </div>
            </div>
            <div className="bg-ccb-success/10 border border-ccb-success/25 rounded-xl px-4 py-3 flex items-center gap-2 justify-center">
              <TrendingUp className="w-4 h-4 text-ccb-success shrink-0" />
              <p className="text-xs font-semibold text-ccb-success">Recurring &amp; unlimited</p>
            </div>
          </div>
        </div>
      </div>

      {/* Referral link + calculator */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        <ShareCard refCode={refCode} referralLink={link} />
        <EarningsCalculator membershipPriceUsd={membershipPriceUsd} commissionRate={commissionRate} />
      </div>
    </div>
  );
}
