// Live currency conversion helper. Fetches exchange rates from a free,
// no-key FX API and caches the result for an hour to stay well within
// rate limits and keep pages fast.
interface FxResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
}

/**
 * Get the exchange rate to convert 1 unit of `base` into `target`.
 * Returns 1 if base === target, or on any failure (safe fallback —
 * caller should treat the amount as unconverted in that case).
 */
export async function getExchangeRate(base: string, target: string): Promise<number> {
  if (!base || !target || base === target) return 1;

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      // Cache for an hour — FX rates don't need to be more real-time than that,
      // and it keeps us comfortably under the free API's rate limits.
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return 1;
    const data: FxResponse = await res.json();
    if (data.result !== "success") return 1;
    return data.rates[target] ?? 1;
  } catch {
    return 1;
  }
}

/**
 * Convert an amount in minor units (cents) from one currency to another.
 */
export async function convertAmount(cents: number, base: string, target: string): Promise<number> {
  const rate = await getExchangeRate(base, target);
  return Math.round(cents * rate);
}

/**
 * Get a display symbol/prefix for a currency code (e.g. "$" for USD,
 * "MK" for MWK). Falls back to the currency code itself.
 */
export function getCurrencySymbol(currencyCode: string): string {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value || currencyCode;
  } catch {
    return currencyCode;
  }
}

/**
 * Get the MWK -> currencyCode rate from the exchange_rates table, falling
 * back to the live FX API when no row exists. Returns 0 when unavailable
 * (callers must reject the transaction rather than guess a rate).
 * Server-side only: takes the admin Supabase client.
 */
export async function getMwkToLocalRate(
  admin: { from: (table: string) => any },
  currencyCode: string
): Promise<number> {
  if (!currencyCode || currencyCode === "MWK") return 1;
  try {
    const { data } = await admin
      .from("exchange_rates")
      .select("rate")
      .eq("base_currency", "MWK")
      .eq("target_currency", currencyCode)
      .single();
    const rate = Number(data?.rate || 0);
    if (rate > 0) return rate;
  } catch {}
  // Live fallback. Every real MWK->X rate is < 1 (MWK is a weak currency),
  // so a live result of >= 1 means the API failed and returned its
  // safe-default of 1 — treat that as "unavailable", never as a real rate.
  const live = await getExchangeRate("MWK", currencyCode);
  return live > 0 && live < 1 ? live : 0;
}
