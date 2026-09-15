import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { isMember, daysRemaining } from "@/lib/membership/membership";
import { getExchangeRate, getMwkToLocalRate } from "@/lib/geo/fx";
import { currencyCodeForCountry } from "@/lib/geo/format";

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

    // USD $10/month pricing (owner decision 2026-09-15), converted to what
    // the player's own rails will charge: MWK (PayChangu) for Malawi, the
    // player's local currency (PawaPay) everywhere else.
    const priceUsd = cfg.price_usd || 10;
    let priceMwk: number | null = null;
    let priceLocal: number | null = null;
    let localCurrency: string | null = null;
    if (cfg.enabled) {
      let usdToMwk = await getExchangeRate("USD", "MWK");
      if (usdToMwk >= 500 && usdToMwk <= 5000) {
        const amountMwk = Math.round(priceUsd * usdToMwk);
        if (country === "MW") {
          priceMwk = amountMwk;
        } else if (country) {
          localCurrency = currencyCodeForCountry(country);
          const mwkRate = await getMwkToLocalRate(admin, localCurrency);
          if (mwkRate) priceLocal = Math.round(amountMwk * mwkRate);
        }
      }
    }

    return NextResponse.json({
      member,
      until,
      daysLeft,
      country,
      enabled: !!cfg.enabled,
      currency: "USD",
      priceUsd: priceUsd,
      priceMwk,
      priceLocal,
      localCurrency,
      periodDays: cfg.period_days || 30,
      // Available in every country: Malawi on PayChangu, worldwide on PawaPay
      available: true,
    });
  } catch {
    return NextResponse.json({ member: false }, { status: 200 });
  }
}
