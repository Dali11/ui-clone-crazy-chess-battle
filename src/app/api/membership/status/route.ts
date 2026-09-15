import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { isMember, daysRemaining } from "@/lib/membership/membership";
import { getExchangeRate } from "@/lib/geo/fx";

export const dynamic = "force-dynamic";

/**
 * GET /api/membership/status
 * Lightweight membership state for the current player (wallet card + AdSlot
 * suppression). Returns { member, until, daysLeft, price, enabled } —
 * config is only included for the purchase UI, AdSlot callers ignore it.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const admin = createAdminClient();
    const cfg = await getPlatformConfig(admin, "membership");

    let member = false;
    let until: string | null = null;
    let daysLeft = 0;
    let country: string | null = null;

    if (user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("membership_until, country")
        .eq("id", user.id)
        .single();
      const now = new Date().toISOString();
      member = isMember(profile?.membership_until, now);
      until = member ? profile!.membership_until : null;
      daysLeft = daysRemaining(profile?.membership_until, now);
      country = profile?.country || null;
    }

    // USD $10/month pricing (owner decision 2026-09-15) — show both the
    // dollar price and the MWK figure the mobile-money rails will charge.
    let priceMwk: number | null = null;
    if (country === "MW" && cfg.enabled) {
      const rate = await getExchangeRate("USD", "MWK");
      if (rate >= 500 && rate <= 5000) priceMwk = Math.round((cfg.price_usd || 10) * rate);
    }

    return NextResponse.json({
      member,
      until,
      daysLeft,
      enabled: !!cfg.enabled,
      currency: "USD",
      priceUsd: cfg.price_usd || 10,
      priceMwk,
      periodDays: cfg.period_days || 30,
      // MW-only for now (PayChangu rails); ZM/other countries: coming soon
      available: country === "MW",
    });
  } catch {
    return NextResponse.json({ member: false }, { status: 200 });
  }
}
