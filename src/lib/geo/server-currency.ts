import { createAdminClient } from "@/lib/supabase/admin";
import { currencyForCountry } from "@/lib/geo/currency-map";
import { getCurrencySymbol } from "@/lib/geo/fx";

/**
 * Server-side currency context for a given country code.
 * Reads the cached exchange rate from the database and provides
 * a formatMoney function that converts MWK → the user's currency.
 *
 * Use this in server components (page.tsx files) where you can't
 * use the useCurrency client hook.
 */
export async function getServerCurrency(countryCode: string | null | undefined) {
  const code = currencyForCountry(countryCode || "");
  let rate = 1;

  if (code !== "MWK") {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("exchange_rates")
        .select("rate")
        .eq("base_currency", "MWK")
        .eq("target_currency", code)
        .single();
      if (data?.rate) rate = Number(data.rate);
    } catch {}
  }

  const symbol = getCurrencySymbol(code);

  function formatMoney(amountMWK: number): string {
    const value = Math.floor(amountMWK ?? 0);
    if (code === "MWK" || rate === 1) {
      return `${symbol} ${value.toLocaleString("en-US")}`;
    }
    const converted = Math.round(value * rate);
    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      }).format(converted);
    } catch {
      return `${symbol} ${converted.toLocaleString("en-US")}`;
    }
  }

  return { currencyCode: code, currencySymbol: symbol, rate, formatMoney };
}
