import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface MarketConfig {
  countryCode: string;
  countryName: string;
  currency: string;
  currencySymbol: string;
  membershipPrice: number; // in cents
  membershipCurrency: string;
  membershipActive: boolean;
}

const DEFAULT_MARKET: MarketConfig = {
  countryCode: "MW",
  countryName: "Malawi",
  currency: "MWK",
  currencySymbol: "MK",
  membershipPrice: 1000000,
  membershipCurrency: "MWK",
  membershipActive: true,
};

/**
 * Detect the visitor's ISO 3166-1 alpha-2 country code from request headers.
 * On Vercel, uses the x-vercel-ip-country header (no API call needed).
 * Falls back to IP geolocation, then to Malawi ("MW") as the default.
 */
export async function detectCountryCode(request: NextRequest): Promise<string> {
  // 1. Try Vercel's IP country header (always available on Vercel deployments)
  const vercelCountry = request.headers.get("x-vercel-ip-country");
  let countryCode = vercelCountry?.toUpperCase() || "";

  // 2. If no Vercel header, try IP geolocation from x-forwarded-for
  if (!countryCode) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const ip = forwarded.split(",")[0].trim();
      if (ip && !ip.startsWith("127.") && !ip.startsWith("10.") && !ip.startsWith("192.168.")) {
        try {
          const res = await fetch(`https://ipapi.co/${ip}/country/`, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            countryCode = (await res.text()).trim().toUpperCase();
          }
        } catch {
          // Geolocation failed, fall through to default
        }
      }
    }
  }

  // 3. Fall back to Malawi
  if (!countryCode || countryCode.length !== 2) {
    countryCode = "MW";
  }

  return countryCode;
}

/**
 * Detect the visitor's country and fetch market config (membership pricing
 * setup) for it. Falls back to Malawi if the country has no dedicated
 * market_config row.
 */
export async function detectCountry(request: NextRequest): Promise<MarketConfig> {
  const countryCode = await detectCountryCode(request);

  // Fetch market config from Supabase
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("market_config")
      .select("*")
      .eq("country_code", countryCode)
      .single();

    if (error || !data) {
      // Try default market
      const { data: defaultData } = await supabase
        .from("market_config")
        .select("*")
        .eq("is_default", true)
        .single();

      if (defaultData) {
        return {
          countryCode: defaultData.country_code,
          countryName: defaultData.country_name,
          currency: defaultData.currency_code,
          currencySymbol: defaultData.currency_symbol || defaultData.currency_code,
          membershipPrice: defaultData.membership_price_cents,
          membershipCurrency: defaultData.membership_currency,
          membershipActive: defaultData.membership_active,
        };
      }
      return DEFAULT_MARKET;
    }

    return {
      countryCode: data.country_code,
      countryName: data.country_name,
      currency: data.currency_code,
      currencySymbol: data.currency_symbol || data.currency_code,
      membershipPrice: data.membership_price_cents,
      membershipCurrency: data.membership_currency,
      membershipActive: data.membership_active,
    };
  } catch {
    return DEFAULT_MARKET;
  }
}

/**
 * Format a membership price for display.
 * For currencies with no minor units (like MWK), shows whole numbers.
 */
export function formatMembershipPrice(priceCents: number, symbol: string): string {
  const wholeUnits = Math.floor(priceCents / 100);
  return `${symbol}${wholeUnits.toLocaleString()}/month`;
}
