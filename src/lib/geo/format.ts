/**
 * Client-safe currency formatting utilities.
 *
 * Uses the user's country code (from their profile) to determine the
 * correct currency symbol. Falls back to MWK (Malawian Kwacha) if the
 * country is unknown or not mapped.
 *
 * This module has no server-only imports so it's safe to use in
 * client components directly.
 */

import { COUNTRY_CURRENCY, DEFAULT_CURRENCY } from "./currency-map";

/**
 * Get the ISO 4217 currency code for a country code.
 */
export function currencyCodeForCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return DEFAULT_CURRENCY;
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] || DEFAULT_CURRENCY;
}

/**
 * Get a display symbol for a currency (e.g. "MK" for MWK, "$" for USD,
 * "ZK" for ZMW). Uses Intl.NumberFormat's narrow symbol where available.
 */
export function currencySymbolForCountry(countryCode: string | null | undefined): string {
  const code = currencyCodeForCountry(countryCode);
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value || code;
  } catch {
    return code;
  }
}

/**
 * Format a money amount with the correct currency symbol for the user's country.
 *
 * @param amount  - The amount in the platform's base currency
 * @param countryCode - ISO 3166-1 alpha-2 country code from the user's profile
 * @returns e.g. "MK 5,000" or "ZK 1,200" or "$10"
 */
export function formatMoney(
  amount: number | null | undefined,
  countryCode: string | null | undefined,
): string {
  const value = Math.floor(amount ?? 0);
  const symbol = currencySymbolForCountry(countryCode);
  return `${symbol} ${value.toLocaleString("en-US")}`;
}

/**
 * Just the currency symbol string for a country (e.g. "MK", "ZK", "$").
 * Convenience wrapper for components that build their own strings.
 */
export function moneySymbol(countryCode: string | null | undefined): string {
  return currencySymbolForCountry(countryCode);
}
