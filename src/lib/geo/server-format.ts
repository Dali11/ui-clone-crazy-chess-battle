/**
 * Server-side currency formatting with proper conversion.
 *
 * Unlike the client-safe `format.ts` (which only swaps the symbol),
 * this module fetches the cached exchange rate from the DB and converts
 * the MWK amount to the user's local currency before formatting.
 *
 * This is used by API routes for error messages and notifications where
 * showing a raw MWK number with a foreign symbol would be misleading
 * (e.g. "ZK 1,000" when the actual amount is ~ZK 20).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  COUNTRY_CURRENCY,
  DEFAULT_CURRENCY,
  currencyForCountry,
} from "./currency-map";
import { moneySymbol } from "./format";

// In-memory rate cache to avoid hitting the DB on every API call.
// Rates are daily-cached in the exchange_rates table, so a 5-minute
// in-memory cache is more than safe.
let rateCache: Map<string, { rate: number; fetchedAt: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getRate(currencyCode: string): Promise<number> {
  if (currencyCode === DEFAULT_CURRENCY) return 1;

  const cached = rateCache.get(currencyCode);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rate;
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("exchange_rates")
      .select("rate")
      .eq("base_currency", "MWK")
      .eq("target_currency", currencyCode)
      .single();

    const rate = data?.rate ? Number(data.rate) : 1;
    rateCache.set(currencyCode, { rate, fetchedAt: Date.now() });
    return rate;
  } catch {
    return 1; // Fallback: no conversion (show MWK)
  }
}

/**
 * Convert an MWK amount to the user's local currency using the cached
 * exchange rate, and format with the correct symbol.
 *
 * @param amountMWK     - Amount in MWK (platform base currency)
 * @param countryCode   - User's ISO 3166-1 alpha-2 country code
 * @returns Formatted string e.g. "ZK 20" or "MK 1,000"
 */
export async function formatMoneyConverted(
  amountMWK: number | null | undefined,
  countryCode: string | null | undefined,
): Promise<string> {
  const value = Math.floor(amountMWK ?? 0);
  const currencyCode = currencyForCountry(countryCode);

  if (currencyCode === DEFAULT_CURRENCY) {
    return `MK ${value.toLocaleString("en-US")}`;
  }

  const rate = await getRate(currencyCode);
  if (!rate || rate === 1) {
    // No rate available — show honest MWK, don't fake a foreign amount
    return `MK ${value.toLocaleString("en-US")}`;
  }

  const converted = Math.round(value * rate);
  const symbol = moneySymbol(countryCode);

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(converted);
  } catch {
    return `${symbol} ${converted.toLocaleString("en-US")}`;
  }
}
