// Shared API shapes between the Command Centre routes and the UI.

export type FeedStatus = "completed" | "pending" | "failed" | "cancelled";

export type RevenueStream = "battles" | "tournaments" | "memberships" | "ads" | "withdrawal_fees";

export interface Kpi {
  usd: number;
  prevUsd: number | null;
  changePct: number | null;
  snapshot: boolean;
  count?: number;
  oldest?: string | null;
}

export interface AttentionItem {
  key: string;
  label: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  count: number;
  oldest?: string | null;
  action: "withdrawals" | "transactions" | "flags";
}

export interface MarketRow {
  code: string;
  currency: string;
  volume: number;
  deposits: number;
  withdrawals: number;
  revenue: number;
  players: number;
  status: "active" | "quiet";
}

export interface SeriesPoint {
  bucket: string;
  battles: number;
  tournaments: number;
  memberships: number;
  ads: number;
  withdrawal_fees: number;
}

export interface OverviewResponse {
  period: { from: string; to: string; preset: string; granularity: "day" | "month" };
  fx: { mwkToUsdSource: string; unavailableCurrencies: string[] };
  kpis: {
    totalRevenue: Kpi;
    transactionVolume: Kpi;
    deposits: Kpi;
    withdrawals: Kpi;
    playerBalances: Kpi;
    pendingWithdrawals: Kpi;
  };
  revenue: {
    streams: Record<RevenueStream, number>;
    streamsPrev: Record<RevenueStream, number>;
    total: number;
    totalPrev: number;
  };
  series: SeriesPoint[];
  markets: MarketRow[];
  attention: AttentionItem[];
}

export type FeedKind =
  | "deposit" | "withdrawal" | "battle_fee"
  | "tournament_entry" | "tournament_payout" | "tournament_creator_profit"
  | "membership" | "ad" | "withdrawal_fee";

export interface FeedRow {
  id: string;
  kind: FeedKind;
  playerId: string | null;
  playerName: string | null;
  country: string | null;
  amountUsd: number | null;
  localAmount: number | null;
  localCurrency: string | null;
  status: FeedStatus;
  time: string;
  reference: string | null;
}

export interface TransactionsResponse {
  rows: FeedRow[];
  nextCursor: string | null;
}

export type RangePresetUi = "today" | "7d" | "30d" | "90d" | "12m" | "custom";
