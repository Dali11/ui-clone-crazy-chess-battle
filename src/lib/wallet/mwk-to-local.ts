import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Converts a MWK-denominated amount (stakes, entry fees — the platform's
 * internal ledger unit) into the player's own wallet currency, using the
 * exact same rate + rounding as the `credit_wallet`/`debit_wallet` SQL
 * functions (migration 080: `round(amount * mwk_rate(user))`).
 *
 * Use this BEFORE any `wallet_balance < X` comparison in API routes.
 * `wallet_balance` is stored in the player's LOCAL currency (KES, ZMW,
 * ...) since the local-currency wallet migration — comparing it directly
 * against a raw MWK stake/entryFee number mixes units and makes the check
 * reject perfectly good balances for every non-Malawi player (a MWK
 * amount is numerically much larger than the equivalent local amount).
 *
 * `debit_wallet` itself already converts and guards insufficient balance
 * correctly — this helper exists only so routes can show a correct
 * pre-flight error message instead of a generic failure from a rejected
 * RPC call.
 */
export async function mwkToLocal(
  userId: string,
  amountMWK: number,
  admin: ReturnType<typeof createAdminClient> = createAdminClient()
): Promise<number> {
  const { data: rate, error } = await admin.rpc("mwk_rate", { p_user_id: userId });
  if (error || rate == null || Number(rate) < 0) {
    // No FX rate available — fall back to treating the wallet as MWK
    // (matches mwk_rate()'s own "MWK wallet" default of rate=1).
    return Math.round(amountMWK);
  }
  return Math.round(amountMWK * Number(rate));
}
