export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Gift, LayoutDashboard, Users, BookOpen, ArrowRight, Crown, TrendingUp } from "lucide-react";
import { getReferrals, getCommissionLedger, computeStats } from "@/lib/affiliate/data";
import { referralLink } from "@/lib/affiliate/labels";
import { formatUsd } from "@/lib/geo/format";
import { getPlatformConfig } from "@/lib/platform-config";
import { pageMetadata } from "@/lib/seo/metadata";
import ShareCard from "./_components/share-card";
import EarningsCalculator from "./_components/earnings-calculator";
import MoneyValueClient from "./_components/money-value";

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
    .select("id, username, referral_code, wallet_balance")
    .eq("id", user.id)
    .single();

  const [referrals, ledger] = await Promise.all([
    getReferrals(admin, user.id),
    getCommissionLedger(admin, user.id),
  ]);
  const stats = computeStats(referrals, ledger);

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

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { value: stats.total, label: "Invited" },
          { value: stats.active, label: "Active" },
          { value: stats.lifetimeEarned, label: "Earned", money: true },
        ].map((s) => (
          <div key={s.label} className="bg-ccb-card border border-ccb-border rounded-2xl p-4">
            <p className={"text-xl sm:text-2xl font-extrabold leading-none " + (s.label === "Active" ? "text-ccb-success" : s.label === "Earned" ? "text-ccb-primary" : "")}>
              {s.money ? <MoneyValueClient amount={s.value} /> : s.value}
            </p>
            <p className="text-[10px] text-ccb-muted uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Share + calculator */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        <ShareCard refCode={refCode} referralLink={link} />
        <EarningsCalculator membershipPriceUsd={membershipPriceUsd} commissionRate={commissionRate} />
      </div>

      {/* How it works teaser */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ccb-muted">How it works</h3>
          <Link href="/affiliate/how-it-works" className="text-[10px] font-bold uppercase tracking-wider text-ccb-primary flex items-center gap-1">
            Full guide <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { n: 1, t: "Share your link", d: "Send it to friends, groups, anyone who plays chess." },
            { n: 2, t: "They join & play", d: "Sign-up is linked to you automatically — once, forever." },
            { n: 3, t: "You earn 25%", d: "Every fee they generate lands in your wallet instantly." },
          ].map((s) => (
            <div key={s.n} className="bg-ccb-surface/70 border border-ccb-border/70 rounded-xl p-3.5">
              <div className="w-6 h-6 rounded-full bg-ccb-primary/15 border border-ccb-primary/30 flex items-center justify-center text-[11px] font-extrabold text-ccb-primary mb-2">
                {s.n}
              </div>
              <p className="text-sm font-semibold">{s.t}</p>
              <p className="text-[11px] text-ccb-muted mt-1">{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Subpage shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { href: "/affiliate/dashboard", icon: LayoutDashboard, t: "Dashboard", d: "Charts, stats & activity" },
          { href: "/affiliate/team", icon: Users, t: "My Team", d: "Every friend & their status" },
          { href: "/affiliate/how-it-works", icon: BookOpen, t: "Guide", d: "Tips, templates & FAQ" },
        ].map(({ href, icon: Icon, t, d }) => (
          <Link
            key={href}
            href={href}
            className="bg-ccb-card border border-ccb-border rounded-2xl p-4 flex items-center gap-3 hover:border-ccb-primary/40 transition-colors group"
          >
            <div className="w-10 h-10 rounded-xl bg-ccb-primary/15 border border-ccb-primary/25 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-ccb-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t}</p>
              <p className="text-[11px] text-ccb-muted truncate">{d}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-ccb-muted group-hover:text-ccb-primary transition-colors shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

