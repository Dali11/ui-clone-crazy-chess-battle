/**
 * USD conversion layer for the Admin Command Centre.
 *
 * Platform rule (Phase 1): USD is THE admin reporting currency. Every
 * figure the Command Centre shows is converted to USD; the original
 * local amount rides alongside it for display.
 *
 * Conversion sources, in priority order:
 *   1. exchange_rates table (refreshed daily by /api/cron/refresh-fx)
 *      — single consistent MWK→USD rate for all rows in a report.
 *   2. Live FX API fallback (open.er-api.com, cached 1h) if the table
 *      has no usable MWK→USD row.
 *
 * Amount conventions in this codebase:
 *   - deposits.amount       → MWK-normalized at pay time (transaction
 *                              already used the rate recorded on it)
 *   - withdrawals.amount/fee → player's wallet currency (currency col)
 *   - battles.pot/stake      → stake currency (challenge creator's wallet)
 *   - exchange_rates.rate    → units of target per 1 MWK (MWK is weak,
 *                              so e.g. MWK→KES ≈ 0.05, MWK→USD ≈ 0.0006)
 */

export interface FxRates {
  /** units of USD per 1 MWK */
  mwkToUsd: number;
  /** units of local currency per 1 MWK, keyed by ISO code */
  mwkToLocal: Record<string, number>;
  /** currencies we could not resolve (caller may display local-only) */
  unavailable: Set<string>;
}

export interface UsdConverter {
  /** Convert an amount in `currency` (whole units) → USD. Returns null when no rate is known. */
  toUsd(amount: number, currency: string | null | undefined): number | null;
  /** Convert an MWK-normalized amount → USD (deposits rows). */
  usdFromMwk(amountMwk: number): number | null;
  /**
   * Convert an amount denominated in `currency` to its MWK equivalent.
   * null when the rate for that currency is unavailable.
   */
  toMwk(amount: number, currency: string | null | undefined): number | null;
  /** Same as toUsd but floored at 0 for summation safety. */
  toUsdOrZero(amount: number, currency: string | null | undefined): number;
  /**
   * Convert an MWK-normalized amount → the player's local wallet currency.
   * null when the rate for that currency is unavailable.
   */
  mwkToLocal(amountMwk: number, currency: string | null | undefined): number | null;
  readonly unavailable: Set<string>;
}

/**
 * Build a converter from a flat rate map. Pure — unit-testable.
 *
 * @param mwkToUsd units of USD per 1 MWK (0/null = unavailable)
 * @param mwkToLocal units of local currency per 1 MWK
 */
export function makeUsdConverter(
  mwkToUsd: number | null | undefined,
  mwkToLocal: Record<string, number>
): UsdConverter {
  const usd = Number(mwkToUsd) || 0;
  const local: Record<string, number> = {};
  for (const [code, rate] of Object.entries(mwkToLocal || {})) {
    const r = Number(rate);
    if (r > 0) local[code.toUpperCase()] = r;
  }
  const unavailable = new Set<string>();

  const usdFromMwk = (amountMwk: number): number | null => {
    if (usd <= 0) {
      unavailable.add("MWK");
      return null;
    }
    return amountMwk * usd;
  };

  const toUsd = (amount: number, currency: string | null | undefined): number | null => {
    const code = (currency || "MWK").toUpperCase();
    if (!Number.isFinite(amount)) return null;
    if (code === "USD") return amount;
    if (code === "MWK") return usdFromMwk(amount);
    const rate = local[code];
    if (!rate || usd <= 0) {
      unavailable.add(code);
      return null;
    }
    // amount in C → MWK is amount / rate(C) → USD is that × rate(USD)
    return (amount / rate) * usd;
  };

  const toMwk = (amount: number, currency: string | null | undefined): number | null => {
    const code = (currency || "MWK").toUpperCase();
    if (!Number.isFinite(amount)) return null;
    if (code === "MWK") return amount;
    if (code === "USD") return usd > 0 ? amount / usd : null;
    const rate = local[code];
    if (!rate) {
      unavailable.add(code);
      return null;
    }
    // local rates are MWK->C, so C->MWK is amount / rate
    return amount / rate;
  };

  const convertMwkToLocal = (amountMwk: number, currency: string | null | undefined): number | null => {
    const code = (currency || "MWK").toUpperCase();
    if (!Number.isFinite(amountMwk)) return null;
    if (code === "MWK") return amountMwk;
    const rate = local[code];
    if (!rate) {
      unavailable.add(code);
      return null;
    }
    // local rates are MWK->C
    return amountMwk * rate;
  };

  return {
    toUsd,
    usdFromMwk,
    toMwk,
    mwkToLocal: convertMwkToLocal,
    toUsdOrZero: (amount, currency) => toUsd(amount, currency) ?? 0,
    unavailable,
  };
}

/** Whole-unit amounts as stored in DB → 2-decimal USD cents-safe rounding. */
export function roundUsd(usd: number): number {
  return Math.round(usd * 100) / 100;
}

/**
 * Load exchange rates from the exchange_rates table and build the converter.
 * Falls back to the live FX API when MWK→USD is missing.
 * Server-side only (takes the admin Supabase client).
 */
export async function loadUsdConverter(
  admin: { from: (table: string) => any },
  liveFallback?: () => Promise<number>
): Promise<UsdConverter> {
  let mwkToUsd = 0;
  const mwkToLocal: Record<string, number> = {};

  try {
    const { data } = await admin.from("exchange_rates").select("target_currency, rate, fetched_at");
    for (const row of data || []) {
      const rate = Number(row?.rate);
      if (!rate || rate <= 0) continue;
      const code = String(row.target_currency || "").toUpperCase();
      if (!code) continue;
      if (code === "USD") {
        mwkToUsd = rate;
      } else {
        mwkToLocal[code] = rate;
      }
    }
  } catch {
    // table unreadable — fall through to live fallback
  }

  if (mwkToUsd <= 0 && liveFallback) {
    try {
      const live = await liveFallback();
      if (Number(live) > 0) mwkToUsd = Number(live);
    } catch {
      // keep 0 — converter will mark USD unavailable
    }
  }

  return makeUsdConverter(mwkToUsd, mwkToLocal);
}
