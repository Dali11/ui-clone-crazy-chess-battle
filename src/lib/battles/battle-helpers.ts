/**
 * Chess Battles — settlement, matchmaking, and escrow logic.
 * All server-side, authoritative, no client trust.
 */

export interface BattleConfig {
  enabled: boolean;
  stake_levels: number[]; // in MWK (actual kwacha)
  platform_fee_pct: number;
  rating_range: number;
  queue_timeout_s: number;
  initial_minutes: number;
  increment_seconds: number;
  armageddon_pct: number;
  max_armageddon_rounds: number;
  disconnect_timeout_s: number;
  min_games_for_battles: number;
}

export const DEFAULT_CONFIG: BattleConfig = {
  enabled: true,
  stake_levels: [500, 1000, 2500, 5000, 10000], // MK500, MK1K, MK2.5K, MK5K, MK10K
  platform_fee_pct: 5,
  rating_range: 200,
  queue_timeout_s: 120,
  initial_minutes: 5,
  increment_seconds: 2,
  armageddon_pct: 50,
  max_armageddon_rounds: 3,
  disconnect_timeout_s: 30,
  min_games_for_battles: 5,
};

export function formatMKK(amount: number): string {
  return `MK ${Math.floor(amount).toLocaleString("en-US")}`;
}

/**
 * Owner decision 2026-09-15: with a non-zero fee rate configured, the
 * platform's take can never round down to zero on a real battle —
 * percentage math on tiny stakes can round to 0 MWK, silently skipping
 * revenue. Floor at 1 MWK whenever feePct > 0. An explicit 0% fee (e.g.
 * a promo) is a deliberate admin choice and stays exactly 0.
 */
export function calcPayout(stake: number, feePct: number): { pot: number; fee: number; payout: number } {
  const pot = stake * 2;
  const fee = feePct > 0 && pot > 0 ? Math.max(1, Math.round(pot * (feePct / 100))) : 0;
  const payout = pot - fee;
  return { pot, fee, payout };
}

export function isArmageddonTime(baseMinutes: number, pct: number): number {
  return Math.max(1, Math.round(baseMinutes * pct / 100));
}
