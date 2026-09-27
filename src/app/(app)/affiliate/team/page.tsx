export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { redirect } from "next/navigation";
import { getReferrals } from "@/lib/affiliate/data";
import { pageMetadata } from "@/lib/seo/metadata";
import TeamClient from "../_components/team-client";

export const metadata = pageMetadata({
  title: "My Affiliate Team",
  description: "Everyone who joined through your referral link, and their status.",
  path: "/affiliate/team",
  noIndex: true,
});

export default async function AffiliateTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/affiliate/team");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, referral_code")
    .eq("id", user.id)
    .single();

  const referrals = await getReferrals(admin, user.id);

  // Enrich with referred profiles (fetchByIdChunks: .in() with 200+ ids
  // blows the ~8KB URL limit)
  const referredIds = referrals.map((r) => r.referred_id).filter(Boolean) as string[];
  const referredProfiles = referredIds.length
    ? await fetchByIdChunks(
        () =>
          admin
            .from("profiles")
            .select("id, username, display_name, avatar_url, rating"),
        referredIds,
        "id"
      )
    : [];
  const byId = new Map(referredProfiles.map((p: any) => [p.id, p]));

  const { filter } = await searchParams;
  const refCode = profile?.referral_code || profile?.username || "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://crazychessbattles.live";

  return (
    <TeamClient
      referrals={referrals.map((r) => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        activated_at: r.activated_at,
        activation_condition: r.activation_condition,
        commission_amount: r.commission_amount || 0,
        referred: r.referred_id ? byId.get(r.referred_id) || null : null,
      }))}
      baseUrl={baseUrl}
      refCode={refCode}
      initialFilter={filter}
    />
  );
}
