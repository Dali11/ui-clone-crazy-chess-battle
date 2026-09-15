export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import AppShell from "@/components/layout/app-shell";
import AdvertiseClient from "./advertise-client";
import AdvertiseLanding from "./advertise-landing";

import { pageMetadata } from "@/lib/seo/metadata";

// Now a public marketing page for advertisers — indexable.
export const metadata = pageMetadata({
  title: "Advertise — Crazy Chess Battles",
  description:
    "Put your business in front of thousands of engaged chess players. Flat weekly banner rates, targeted by country and gender, with live impression and click stats.",
  path: "/advertise",
});

export default async function AdvertisePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Logged out → public landing selling the ad offer.
  if (!user) {
    const admin = createAdminClient();
    const cfg = await getPlatformConfig(admin, "direct_ads");
    return (
      <AdvertiseLanding
        pricePerWeekMwk={Number(cfg?.price_per_week_mwk || 5000)}
        enabled={Boolean(cfg?.enabled)}
      />
    );
  }

  // Logged in → the full advertiser dashboard inside the app shell.
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, rating, avatar_url, is_admin, wallet_balance, country")
    .eq("id", user.id)
    .single();

  return (
    <AppShell profile={profile}>
      <AdvertiseClient walletBalance={profile?.wallet_balance || 0} />
    </AppShell>
  );
}
