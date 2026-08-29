export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import AffiliateClient from "./affiliate-client";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Affiliate Program — Earn MK500 Per Referral",
  description: "Invite friends to Crazy Chess Battles and earn MK500 cash when they become active players. Share your referral link and grow the community.",
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

  // Get referral stats
  const { data: referrals } = await admin
    .from("referrals")
    .select("id, referred_id, status, created_at, activated_at, reward_paid, activation_action")
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false });

  // Enrich referrals with referred user info
  const referredIds = (referrals || []).map((r: any) => r.referred_id).filter(Boolean);
  let referredProfiles: Record<string, any> = {};
  if (referredIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url, rating, created_at")
      .in("id", referredIds);
    for (const p of profiles || []) {
      referredProfiles[p.id] = p;
    }
  }

  const refCode = profile?.referral_code || profile?.username || "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://crazychessbattles.live";

  return (
    <AffiliateClient
      refCode={refCode}
      baseUrl={baseUrl}
      walletBalance={profile?.wallet_balance || 0}
      referrals={(referrals || []).map((r: any) => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        activated_at: r.activated_at,
        reward_paid: r.reward_paid,
        activation_action: r.activation_action,
        referred: r.referred_id ? referredProfiles[r.referred_id] : null,
      }))}
    />
  );
}
