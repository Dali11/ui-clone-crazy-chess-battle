"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Users, Trophy, TrendingUp, AlertCircle, Gamepad2, DollarSign,
  ArrowDownUp, Wallet, Swords, Coins, RefreshCw, ChevronRight, Clock, MapPin,
  UserPlus, PieChart as PieChartIcon, BarChart3,
} from "lucide-react";
import { COUNTRY_FLAGS } from "./country-flags";

const RANGES = [
  { id: "1d", label: "1D" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "All" },
] as const;

interface CountryInfo { code: string; count: number; }

interface SeriesPoint {
  label: string;
  deposits: number;
  withdrawals: number;
  revenue: number;
  games: number;
}

interface StatsResponse {
  totalUsers: number;
  gamesToday: number;
  totalGames?: number;
  activeTournaments: number;
  pendingWithdrawals: number;
  pendingDeposits: number;
  pendingTournamentApprovals?: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalPrizePools: number;
  walletLiquidity: number;
  totalBattleVolume?: number;
  platformRevenue?: number;
  creatorEarningsAllTime?: number;
  range: string;
  country: string;
  availableCountries: CountryInfo[];
  rangeStats: {
    newUsers: number;
    games: number;
    deposits: number;
    withdrawals: number;
    battleVolume: number;
    battleRevenue: number;
    tournamentRevenue: number;
    platformRevenue: number;
    creatorEarnings: number;
    netFlow: number;
  };
  revenueBreakdown: { battleRevenue: number; tournamentRevenue: number; total: number };
  series: SeriesPoint[];
}

export default function OverviewPanel({
  formatMWK,
  onNavigate,
}: {
  formatMWK: (n: number) => string;
  onNavigate?: (tab: string) => void;
}) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<string>("30d");
  const [country, setCountry] = useState<string>("all");

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams({ range, country });
      const res = await fetch(`/api/admin/stats?${params}`);
      if (!res.ok) throw new Error("Fetch failed");
      const json = await res.json();
      setData(json);
    } catch { /* keep previous data on failure */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [range, country]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
      </div>
    );
  }
  if (!data) return null;

  const rs = data.rangeStats;
  const rb = data.revenueBreakdown;
  const battlePct = rb.total > 0 ? Math.round((rb.battleRevenue / rb.total) * 100) : 0;
  const tournamentPct = rb.total > 0 ? 100 - battlePct : 0;

  return (
    <div className="space-y-4">
      {/* Time range + country filters */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-ccb-primary" />
          <h3 className="font-medium text-sm">Time Range</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                range === r.id ? "bg-ccb-primary text-white" : "bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border"
              }`}>{r.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-ccb-muted" />
            <select value={country} onChange={(e) => setCountry(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-sm">
              <option value="all">All Countries</option>
              {data.availableCountries.map((c) => (
                <option key={c.code} value={c.code}>{COUNTRY_FLAGS[c.code] || "🏳"} {c.code} ({c.count})</option>
              ))}
            </select>
          </div>
          <button onClick={() => fetchStats()} disabled={refreshing}
            className="px-2.5 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted hover:text-ccb-text text-sm flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh
          </button>
        </div>
      </div>

      {/* Platform totals — all-time snapshot, unaffected by range/country filters */}
      <div>
        <h3 className="font-medium text-xs text-ccb-muted uppercase tracking-wide mb-2">Platform Totals (All Time)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <StatCard icon={Users} label="Total Users" value={data.totalUsers || 0} color="text-ccb-primary" />
          <StatCard icon={Trophy} label="Active Tournaments" value={data.activeTournaments || 0} color="text-ccb-accent" />
          <StatCard icon={Gamepad2} label="Total Games" value={data.totalGames || 0} color="text-ccb-primary" />
          <StatCard icon={AlertCircle} label="Pending Withdrawals" value={data.pendingWithdrawals || 0} color="text-ccb-danger" />
        </div>
      </div>

      {/* Range-scoped performance */}
      <div>
        <h3 className="font-medium text-xs text-ccb-muted uppercase tracking-wide mb-2">
          In This Period ({RANGES.find((r) => r.id === range)?.label}{country !== "all" ? ` · ${COUNTRY_FLAGS[country] || ""} ${country}` : ""})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <StatCard icon={UserPlus} label="New Users" value={rs.newUsers} color="text-ccb-primary" />
          <StatCard icon={TrendingUp} label="Games Played" value={rs.games} color="text-ccb-success" />
          <StatCard icon={DollarSign} label="Deposits" value={formatMWK(rs.deposits)} color="text-ccb-success" />
          <StatCard icon={ArrowDownUp} label="Withdrawals" value={formatMWK(rs.withdrawals)} color="text-ccb-accent" />
          <StatCard icon={Swords} label="Battle Volume" value={formatMWK(rs.battleVolume)} color="text-ccb-accent" />
          <StatCard icon={Coins} label="Revenue" value={formatMWK(rs.platformRevenue)} color="text-ccb-success" />
          <StatCard icon={Wallet} label="Net Flow" value={formatMWK(rs.netFlow)} color={rs.netFlow >= 0 ? "text-ccb-success" : "text-ccb-danger"} />
          <StatCard icon={Wallet} label="Wallet Liquidity" value={formatMWK(data.walletLiquidity)} color="text-ccb-primary" />
        </div>
      </div>

      {/* Revenue breakdown */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <PieChartIcon className="w-4 h-4 text-ccb-primary" />
          <h3 className="font-medium text-sm">Revenue Breakdown</h3>
        </div>
        {rb.total === 0 ? (
          <p className="text-sm text-ccb-muted py-2">No revenue in this period yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="w-full h-3 rounded-full bg-ccb-surface overflow-hidden flex">
              <div className="h-full bg-ccb-accent" style={{ width: `${battlePct}%` }} />
              <div className="h-full bg-ccb-primary" style={{ width: `${tournamentPct}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-ccb-accent shrink-0" />
                <div>
                  <p className="text-ccb-muted text-xs">Battle Revenue</p>
                  <p className="font-medium">{formatMWK(rb.battleRevenue)} <span className="text-ccb-muted text-xs">({battlePct}%)</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-ccb-primary shrink-0" />
                <div>
                  <p className="text-ccb-muted text-xs">Tournament Revenue</p>
                  <p className="font-medium">{formatMWK(rb.tournamentRevenue)} <span className="text-ccb-muted text-xs">({tournamentPct}%)</span></p>
                </div>
              </div>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-ccb-border">
              <span className="text-ccb-muted">Total Platform Revenue</span>
              <span className="font-bold text-ccb-success">{formatMWK(rb.total)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Graphs */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-ccb-primary" />
          <h3 className="font-medium text-sm">Deposits vs Withdrawals</h3>
        </div>
        <GroupedBarChart
          series={data.series}
          bars={[
            { key: "deposits", color: "bg-ccb-success", label: "Deposits" },
            { key: "withdrawals", color: "bg-ccb-accent", label: "Withdrawals" },
          ]}
          formatValue={formatMWK}
        />
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-ccb-primary" />
          <h3 className="font-medium text-sm">Platform Revenue Over Time</h3>
        </div>
        <GroupedBarChart
          series={data.series}
          bars={[{ key: "revenue", color: "bg-ccb-success", label: "Revenue" }]}
          formatValue={formatMWK}
        />
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-ccb-primary" />
          <h3 className="font-medium text-sm">Games Played</h3>
        </div>
        <GroupedBarChart
          series={data.series}
          bars={[{ key: "games", color: "bg-ccb-primary", label: "Games" }]}
          formatValue={(n) => n.toLocaleString()}
        />
      </div>

      {/* Platform summary */}
      <div className="card">
        <h3 className="font-medium text-sm text-ccb-muted uppercase tracking-wide mb-3">Platform Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-ccb-muted">Total Tournament Prize Pools</span>
            <span className="font-medium">{formatMWK(data.totalPrizePools)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ccb-muted">Net Flow (All Time)</span>
            <span className="font-medium text-ccb-success">{formatMWK(data.totalDeposits - data.totalWithdrawals)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ccb-muted">Tournament Creator Earnings (All Time)</span>
            <span className="font-medium">{formatMWK(data.creatorEarningsAllTime || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ccb-muted">Creator Earnings (This Period)</span>
            <span className="font-medium">{formatMWK(rs.creatorEarnings || 0)}</span>
          </div>
        </div>
      </div>

      {data.pendingWithdrawals > 0 && onNavigate && (
        <button
          onClick={() => onNavigate("withdrawals")}
          className="card w-full flex items-center justify-between p-4 border-ccb-accent/30 hover:border-ccb-accent/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-ccb-accent" />
            <span className="font-medium">{data.pendingWithdrawals} pending withdrawal{data.pendingWithdrawals !== 1 ? "s" : ""} need review</span>
          </div>
          <ChevronRight className="w-5 h-5 text-ccb-muted" />
        </button>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-ccb-muted">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function GroupedBarChart({
  series,
  bars,
  formatValue,
}: {
  series: SeriesPoint[];
  bars: { key: keyof SeriesPoint; color: string; label: string }[];
  formatValue: (n: number) => string;
}) {
  if (!series || series.length === 0) {
    return <p className="text-sm text-ccb-muted py-6 text-center">No data for this period.</p>;
  }

  const max = Math.max(1, ...series.flatMap((s) => bars.map((b) => Number(s[b.key]) || 0)));
  // Show every Nth label if there are many buckets, to avoid crowding the x-axis.
  const labelStep = series.length > 20 ? Math.ceil(series.length / 10) : series.length > 10 ? 2 : 1;

  return (
    <div>
      {bars.length > 1 && (
        <div className="flex items-center gap-4 mb-3 text-xs">
          {bars.map((b) => (
            <div key={String(b.key)} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${b.color}`} />
              <span className="text-ccb-muted">{b.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1 h-36">
        {series.map((point, i) => (
          <div key={i} className="flex-1 h-full flex items-end justify-center gap-0.5 group relative">
            {bars.map((b) => {
              const v = Number(point[b.key]) || 0;
              const pct = Math.max(v > 0 ? 2 : 0, (v / max) * 100);
              return (
                <div
                  key={String(b.key)}
                  className={`flex-1 rounded-t-sm ${b.color} transition-all`}
                  style={{ height: `${pct}%` }}
                  title={`${point.label}: ${b.label} ${formatValue(v)}`}
                />
              );
            })}
            {/* Tooltip on hover */}
            <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center bg-ccb-dark border border-ccb-border rounded px-2 py-1 text-[10px] whitespace-nowrap z-10 shadow-lg">
              <span className="text-ccb-muted">{point.label}</span>
              {bars.map((b) => (
                <span key={String(b.key)}>{b.label}: {formatValue(Number(point[b.key]) || 0)}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1.5">
        {series.map((point, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-ccb-muted truncate">
            {i % labelStep === 0 ? point.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
