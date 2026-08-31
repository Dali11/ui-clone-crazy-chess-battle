import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectCountryCode } from "@/lib/geo/country-detect";
import { currencyForCountry } from "@/lib/geo/currency-map";

export const dynamic = "force-dynamic";

/**
 * Returns the user's currency info:
 *  1. For authenticated users: reads their profile.country (most reliable)
 *  2. For unauthenticated visitors: falls back to IP-based geo-detection
 *
 * The exchange rate comes from the daily-cached exchange_rates table.
 * If no cached rate exists, falls back to a live API call.
 */
export async function GET(request: NextRequest) {
  let countryCode: string | null = null;

  // Try authenticated user's profile country first
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("country")
        .eq("id", user.id)
        .single();
      if (profile?.country) {
        countryCode = profile.country;
      }
    }
  } catch {}

  // Fall back to IP detection for unauthenticated visitors
  if (!countryCode) {
    countryCode = await detectCountryCode(request);
  }

  const currencyCode = currencyForCountry(countryCode);

  // Get the exchange rate from the cached table (updated daily by cron)
  let rate = 1;
  if (currencyCode !== "MWK") {
    try {
      const admin = createAdminClient();
      const { data: rateRow } = await admin
        .from("exchange_rates")
        .select("rate, fetched_at")
        .eq("base_currency", "MWK")
        .eq("target_currency", currencyCode)
        .single();

      if (rateRow?.rate) {
        rate = Number(rateRow.rate);
        // If the cached rate is older than 48 hours, refresh in the background
        const ageHours = (Date.now() - new Date(rateRow.fetched_at).getTime()) / (1000 * 60 * 60);
        if (ageHours > 48) {
          // Fire-and-forget refresh
          fetch("https://open.er-api.com/v6/latest/MWK")
            .then((r) => r.json())
            .then((data) => {
              if (data.result === "success" && data.rates?.[currencyCode]) {
                admin
                  .from("exchange_rates")
                  .upsert({
                    base_currency: "MWK",
                    target_currency: currencyCode,
                    rate: data.rates[currencyCode],
                    fetched_at: new Date().toISOString(),
                  }, { onConflict: "base_currency,target_currency" })
                  .then(() => {}, () => {});
              }
            })
            .catch(() => {});
        }
      } else {
        // No cached rate — fetch live as a fallback
        const res = await fetch(`https://open.er-api.com/v6/latest/MWK`, {
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.result === "success" && data.rates?.[currencyCode]) {
            rate = data.rates[currencyCode];
            // Cache it for next time
            const admin = createAdminClient();
            admin
              .from("exchange_rates")
              .upsert({
                base_currency: "MWK",
                target_currency: currencyCode,
                rate: rate,
                fetched_at: new Date().toISOString(),
              }, { onConflict: "base_currency,target_currency" })
              .then(() => {}, () => {});
          }
        }
      }
    } catch {}
  }

  return NextResponse.json(
    { countryCode, currencyCode, rate },
    {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
