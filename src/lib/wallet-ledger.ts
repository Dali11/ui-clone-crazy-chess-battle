/**
 * Canonical wallet ledger classification.
 *
 * The `deposits` table is actually a general wallet ledger — it stores real
 * cash deposits (mobile_money, card, pawapay) AND internal wallet movements
 * (battle escrow/payouts/refunds, tournament entries/prizes/escrow, league
 * rewards, membership purchases, admin corrections) all under one table,
 * distinguished by `method`. The stored `amount` sign is
 * NOT reliable as a direction indicator (e.g. battle_escrow is stored as a
 * positive number even though it's money leaving the wallet). This module
 * is the single source of truth for direction + display label, used by
 * both the admin panel and the user-facing wallet page so the two never
 * disagree on what counts as inflow vs outflow.
 */

export type LedgerDirection = "in" | "out";

export interface LedgerMeta {
  label: string;
  direction: LedgerDirection;
}

export const LEDGER_METHOD_META: Record<string, LedgerMeta> = {
  // Real cash in
  mobile_money: { label: "Mobile Money Deposit", direction: "in" },
  card: { label: "Card Deposit", direction: "in" },
  pawapay: { label: "Mobile Money Deposit (PawaPay)", direction: "in" },

  // Battle economy
  battle_escrow: { label: "Battle Stake (Escrow)", direction: "out" },
  battle_challenge_escrow: { label: "Challenge Stake (Escrow)", direction: "out" },
  battle_payout: { label: "Battle Winnings", direction: "in" },
  battle_refund: { label: "Battle Refund", direction: "in" },
  battle_challenge_cancel: { label: "Challenge Stake Refund", direction: "in" },

  // Tournament economy
  tournament_entry: { label: "Tournament Entry Fee", direction: "out" },
  tournament_refund: { label: "Tournament Entry Refund", direction: "in" },
  tournament_escrow: { label: "Tournament Prize Pool Funding (Escrow)", direction: "out" },
  tournament_escrow_refund: { label: "Tournament Escrow Refund", direction: "in" },
  tournament_clawback: { label: "Tournament Creator Share Clawback", direction: "out" },
  // League & membership
  league_reward: { label: "League Reward", direction: "in" },
  membership_purchase: { label: "Membership Purchase", direction: "out" },

  // Ads
  ad_purchase: { label: "Ad Campaign Purchase", direction: "out" },
  ad_refund: { label: "Ad Campaign Refund", direction: "in" },

  // Platform accounting
  platform_revenue_sweep: { label: "Platform Revenue Sweep", direction: "in" },
  withdrawal_failed_refund: { label: "Withdrawal Failed — Refunded", direction: "in" },
  tournament_payout: { label: "Tournament Prize", direction: "in" },
  tournament_creator_profit: { label: "Tournament Creator Earnings", direction: "in" },
  tournament_payout_reversal: { label: "Admin Correction — Prize Reversed", direction: "out" },

  // Admin corrections / cleanup
  clawback_duplicate_refund: { label: "Admin Correction — Duplicate Clawed Back", direction: "out" },
  duplicate_payout_removal: { label: "Admin Correction — Duplicate Removed", direction: "out" },
};

/**
 * Methods whose stored amount SIGN is authoritative for direction — the
 * method alone can't tell inflow from outflow (e.g. apply_financial_adjustment
 * writes signed amounts: +credit / -debit; affiliate ad-commission reversals
 * write negative amounts with method 'affiliate_commission'). Callers MUST
 * pass the raw stored amount for these, otherwise a negative (money-out)
 * adjustment renders as a green "+amount".
 */
export const LEDGER_SIGNED_METHODS: Record<string, string> = {
  admin_adjustment: "Admin Adjustment",
  affiliate_commission: "Affiliate Commission",
};

export function getLedgerMeta(method: string | null | undefined, amount?: number | null): LedgerMeta {
  if (method && LEDGER_SIGNED_METHODS[method]) {
    return {
      label: LEDGER_SIGNED_METHODS[method],
      direction: (amount ?? 0) < 0 ? "out" : "in",
    };
  }
  if (method && LEDGER_METHOD_META[method]) return LEDGER_METHOD_META[method];
  return { label: method || "Wallet Activity", direction: "in" };
}

/** Returns the amount to display, signed by canonical direction (ignores stored sign quirks). */
export function ledgerDisplayAmount(amount: number, direction: LedgerDirection): number {
  const abs = Math.abs(amount || 0);
  const result = direction === "in" ? abs : -abs;
  return result === 0 ? 0 : result; // normalize -0 to +0
}

/** Withdrawals are always outflow — no method lookup needed. */
export const WITHDRAWAL_META: LedgerMeta = { label: "Withdrawal", direction: "out" };
