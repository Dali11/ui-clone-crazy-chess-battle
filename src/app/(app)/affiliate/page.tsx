export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { getPlatformConfig } from "@/lib/platform-config";
import { redirect } from "next/navigation";
import AffiliateClient from "./affiliate-client";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Affiliate Program — Earn 25% Commission",
  description: "Invite friends to Crazy Chess Battles and earn 25% of every battle fee, paid tournament entry, and membership fee they generate. Ongoing commissions, paid to your wallet.",
  path: "/affiliate",
  noIndex: true,
});

export default async function AffiliatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/affiliate");
  }

  const admin = createAdminClient();

  // Get profile with referral code
  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, referral_code, wallet_balance, created_at")
    .eq("id", user.id)
    .single();

  // Get referral stats — use correct column names (activation_condition, commission_amount, commission_paid)
  // fetchAll(): PostgREST silently caps responses at 1000 rows
  const referrals = await fetchAll(() =>
    admin
      .from("referrals")
      .select(`
        id, referred_id, status, created_at, activated_at,
        activation_condition, commission_amount, commission_paid
      `)
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false }));

  // Enrich referrals with referred user info
  const referredIds = referrals.map((r: any) => r.referred_id).filter(Boolean);
  let referredProfiles: Record<string, any> = {};
  if (referredIds.length > 0) {
    // fetchByIdChunks(): .in("id", [200+ uuids]) blows the ~8KB URL limit
    const profiles = await fetchByIdChunks(
      () => admin.from("profiles").select("id, username, display_name, avatar_url, rating, created_at"),
      referredIds, "id");
    for (const p of profiles) {
      referredProfiles[p.id] = p;
    }
  }

  // Get total commission earned from deposits ledger (more accurate than summing referrals)
  const commissionDeposits = await fetchAll(() =>
    admin
      .from("deposits")
      .select("amount")
      .eq("user_id", user.id)
      .eq("method", "affiliate_commission")
      .eq("status", "success"));
  const totalCommissionEarned = commissionDeposits.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);

  // Membership is a single $10/month USD-priced plan (owner decision
  // 2026-09-15) — no yearly tier. Read price_usd from platform settings
  // (admin-configurable) instead of the old MWK monthly/yearly fields.
  const mConfig = await getPlatformConfig(admin, "membership");
  const membershipPriceUsd = mConfig.price_usd ?? 10;
  const commissionRate = 0.25;
  const affConfig = await getPlatformConfig(admin, "affiliate");
  const affiliateEnabled = !!affConfig.enabled;

  const refCode = profile?.referral_code || profile?.username || "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://crazychessbattles.live";

  return (
    <AffiliateClient
      affiliateEnabled={affiliateEnabled}
      refCode={refCode}
      baseUrl={baseUrl}
      walletBalance={profile?.wallet_balance || 0}
      totalCommissionEarned={totalCommissionEarned}
      membershipPriceUsd={membershipPriceUsd}
      commissionRate={commissionRate}
      referrals={referrals.map((r: any) => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        activated_at: r.activated_at,
        activation_condition: r.activation_condition,
        commission_amount: r.commission_amount || 0,
        commission_paid: r.commission_paid || false,
        referred: r.referred_id ? referredProfiles[r.referred_id] : null,
      }))}
    />
  );
}
