import { NextRequest, NextResponse } from "next/server";
import { detectCountryCode } from "@/lib/geo/country-detect";
import { currencyForCountry } from "@/lib/geo/currency-map";
import { getExchangeRate } from "@/lib/geo/fx";

export const dynamic = "force-dynamic";

/**
 * Returns the visitor's detected country + currency, plus the live
 * exchange rate to convert MWK amounts into that currency. Client
 * components (e.g. the homepage stats) call this to display prize
 * pools and prices in the visitor's local currency.
 */
export async function GET(request: NextRequest) {
  const countryCode = await detectCountryCode(request);
  const currencyCode = currencyForCountry(countryCode);
  const rate = await getExchangeRate("MWK", currencyCode);

  return NextResponse.json(
    { countryCode, currencyCode, rate },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
