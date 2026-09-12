export interface Withdrawal {
  id: string;
  amount: number;
  phone: string;
  operator_name: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  user_id: string;
  profiles: { username: string; display_name: string; email: string } | null;
}

export interface Stats {
  totalUsers: number;
  gamesToday: number;
  totalGames?: number;
  activeTournaments: number;
  pendingWithdrawals: number;
  pendingDeposits: number;
  openIntegrityFlags?: number;
  pendingTournamentApprovals?: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalPrizePools: number;
  walletLiquidity: number;
  totalBattleVolume?: number;
  platformRevenue?: number;
}

export interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  email: string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  wallet_balance: number;
  is_admin: boolean;
  is_banned: boolean;
  phone: string | null;
  created_at: string;
}

export interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  method: string;
  charge_id: string | null;
  tx_ref: string | null;
  phone: string | null;
  operator: string | null;
  reference: string | null;
  created_at: string;
  admin_notes?: string | null;
  credited_by?: string | null;
  paychangu_ref?: string | null;
  profiles?: { username: string; display_name: string; email: string } | null;
}

export interface Tournament {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  time_control: string;
  initial_minutes: number;
  increment_seconds: number;
  entry_fee: number;
  prize_pool: number;
  pool_source: string | null;
  creator_profit_percent: number | null;
  prize_distribution: any;
  max_players: number | null;
  min_rating: number;
  max_rating: number | null;
  current_round: number;
  rounds: number | null;
  duration_minutes: number | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  participant_count: number;
  paid_count?: number;
  revenue?: number;
}

export interface GameInfo {
  id: string;
  status: string;
  time_control: string;
  rated: boolean;
  white_username: string;
  black_username: string;
  white_rating: number;
  black_rating: number;
  winner: string | null;
  created_at: string;
  move_count: number;
}

export interface AdminLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: any;
  created_at: string;
  profiles: { username: string; display_name: string } | null;
}

export type Tab = "overview" | "users" | "withdrawals" | "tournaments" | "games" | "deposits" | "battles" | "integrity" | "logs" | "leagues" | "seasons" | "membership" | "verification" | "settings";

/** Convert datetime-local (user's local TZ) to UTC ISO string for API */
export function localToUTC(localValue: string): string {
  if (!localValue) return localValue;
  return new Date(localValue).toISOString();
}

/** Convert UTC ISO string to datetime-local format for the input (user's local TZ) */
export function utcToLocalInput(utcValue: string): string {
  if (!utcValue) return "";
  const d = new Date(utcValue);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
