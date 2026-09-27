export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getReferrals, getCommissionLedger, computeStats, chartMonthLabels } from "@/lib/affiliate/data";
import { groupByMonth, referralLink } from "@/lib/affiliate/labels";
import { getPlatformConfig } from "@/lib/platform-config";
import { pageMetadata } from "@/lib/seo/metadata";
import { fetchByIdChunks } from "@/lib/supabase/fetch-all";
import DashboardView from "../_components/dashboard-view";

export const metadata = pageMetadata({
  title: "Affiliate Dashboard",
  description: "Your referral stats, commission chart and recent activity.",
  path: "/affiliate/dashboard",
  noIndex: true,
});

export default async function AffiliateDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/affiliate/dashboard");

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
  const labels = chartMonthLabels(6);

  // Recent sign-ups (5): enriched with referred profiles
  const recent = referrals.slice(0, 5);
  const recentIds = recent.map((r) => r.referred_id).filter(Boolean) as string[];
  const profiles = recentIds.length
    ? await fetchByIdChunks(
        () => admin.from("profiles").select("id, username, display_name"),
        recentIds,
        "id"
      )
    : [];
  const nameById = new Map(profiles.map((p: any) => [p.id, p.display_name || p.username || "Player"]));

  const recentReferrals = recent.map((r) => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    activated_at: r.activated_at,
    name: (r.referred_id && nameById.get(r.referred_id)) || "Player",
  }));

  // Recent commissions grouped by month (dashboard shows the newest month(s))
  const recentLedger = groupByMonth(ledger).slice(0, 2).map(({ ym, entries }) => ({
    ym,
    entries: entries.map((e) => ({ id: e.id, amount: e.amount, created_at: e.created_at })),
  }));

  const affConfig = await getPlatformConfig(admin, "affiliate");
  const refCode = profile?.referral_code || profile?.username || "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://crazychessbattles.live";

  return (
    <DashboardView
      affiliateEnabled={!!affConfig.enabled}
      refCode={refCode}
      referralLink={referralLink(baseUrl, refCode)}
      walletBalance={profile?.wallet_balance || 0}
      stats={stats}
      chartLabels={labels}
      recentReferrals={recentReferrals}
      recentLedger={recentLedger}
    />
  );
}
