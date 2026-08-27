/**
 * Chess Battles — settlement, matchmaking, and escrow logic.
 * All server-side, authoritative, no client trust.
 */

export interface BattleConfig {
  enabled: boolean;
  stake_levels: number[]; // in cents
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
  stake_levels: [50000, 100000, 250000, 500000, 1000000], // MK500, MK1K, MK2.5K, MK5K, MK10K
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

export function calcPayout(stake: number, feePct: number): { pot: number; fee: number; payout: number } {
  const pot = stake * 2;
  const fee = Math.round(pot * (feePct / 100));
  const payout = pot - fee;
  return { pot, fee, payout };
}

export function isArmageddonTime(baseMinutes: number, pct: number): number {
  return Math.max(1, Math.round(baseMinutes * pct / 100));
}
