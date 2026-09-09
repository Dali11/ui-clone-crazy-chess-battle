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

  // Resolve Tailwind bg classes to hex fills for SVG rects.
  const FILL: Record<string, string> = {
    "bg-ccb-primary": "#7c3aed",
    "bg-ccb-accent": "#f59e0b",
    "bg-ccb-success": "#10b981",
    "bg-ccb-danger": "#ef4444",
    "bg-ccb-gold": "#fbbf24",
  };

  const W = 800;
  const H = 300;
  const M = { top: 12, right: 12, bottom: 46, left: 76 }; // margins
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const rawMax = Math.max(1, ...series.flatMap((s) => bars.map((b) => Number(s[b.key]) || 0)));
  // "Nice" axis max: round up to 1/2/2.5/5 × 10^k so tick labels are readable.
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const norm = rawMax / mag;
  const niceMax = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const TICKS = 4; // gridlines at 0/25/50/75/100%

  const n = series.length;
  const slotW = plotW / n;
  const barGroupW = slotW * 0.7;
  const barW = barGroupW / bars.length;

  const y = (v: number) => M.top + plotH - (v / niceMax) * plotH;

  const labelStep = n > 20 ? Math.ceil(n / 10) : n > 10 ? 2 : 1;
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div>
      {bars.length > 1 && (
        <div className="flex items-center gap-4 mb-2 text-xs">
          {bars.map((b) => (
            <div key={String(b.key)} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: FILL[b.color] || "#7c3aed" }} />
              <span className="text-ccb-muted">{b.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img">
          {/* gridlines + Y axis tick labels */}
          {Array.from({ length: TICKS + 1 }).map((_, t) => {
            const v = (niceMax / TICKS) * t;
            const yy = y(v);
            return (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={yy} y2={yy} stroke="#2a2a3e" strokeWidth={t === 0 ? 1.5 : 1} />
                <text x={M.left - 8} y={yy + 4} textAnchor="end" fontSize={12} fill="#9ca3af">
                  {t === 0 ? "0" : formatValue(v)}
                </text>
              </g>
            );
          })}
          {/* Y axis line */}
          <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + plotH} stroke="#3a3a4e" strokeWidth={1.5} />

          {/* bars */}
          {series.map((point, i) => {
            const cx = M.left + slotW * i + slotW / 2;
            const isHover = hover === i;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* hover slot background */}
                <rect
                  x={M.left + slotW * i} y={M.top} width={slotW} height={plotH}
                  fill={isHover ? "#ffffff08" : "transparent"}
                />
                {bars.map((b, bi) => {
                  const v = Number(point[b.key]) || 0;
                  const h = Math.max(v > 0 ? 2 : 0, (v / niceMax) * plotH);
                  const bx = cx - barGroupW / 2 + barW * bi;
                  return (
                    <rect
                      key={String(b.key)}
                      x={bx} y={y(v)} width={Math.max(1, barW - 2)} height={h}
                      rx={2}
                      fill={FILL[b.color] || "#7c3aed"}
                      opacity={hover === null || isHover ? 1 : 0.45}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* X axis tick labels */}
          {series.map((point, i) =>
            i % labelStep === 0 ? (
              <text
                key={i}
                x={M.left + slotW * i + slotW / 2}
                y={M.top + plotH + 20}
                textAnchor="middle" fontSize={12} fill="#9ca3af"
              >
                {point.label}
              </text>
            ) : null
          )}
        </svg>

        {/* Hover tooltip (HTML, positioned over the hovered slot) */}
        {hover !== null && (
          <div
            className="absolute -translate-x-1/2 pointer-events-none z-10 bg-ccb-dark border border-ccb-border rounded px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-lg"
            style={{
              left: `${((M.left + slotW * hover + slotW / 2) / W) * 100}%`,
              top: 8,
            }}
          >
            <div className="text-ccb-muted font-medium">{series[hover].label}</div>
            {bars.map((b) => (
              <div key={String(b.key)} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: FILL[b.color] || "#7c3aed" }} />
                {b.label}: <span className="font-semibold">{formatValue(Number(series[hover][b.key]) || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
