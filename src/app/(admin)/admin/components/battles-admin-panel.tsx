"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Swords, Search, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Play, Gavel, ChevronLeft, ChevronRight, MapPin, Clock,
  TrendingUp, DollarSign, Hourglass, Ban, Trophy, ExternalLink,
} from "lucide-react";

interface BattleRow {
  id: string;
  status: string;
  stake: number;
  pot: number;
  platform_fee: number;
  winner_payout: number;
  result: string | null;
  white_player_id: string;
  black_player_id: string;
  winner_id: string | null;
  white_rating: number | null;
  black_rating: number | null;
  game_id: string | null;
  armageddon_game_id: string | null;
  armageddon_round: number;
  settled: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  time_control: string | null;
  notes: string | null;
  white_player: { id: string; username: string | null; display_name: string | null; country: string | null } | null;
  black_player: { id: string; username: string | null; display_name: string | null; country: string | null } | null;
  winner: { id: string; username: string | null; display_name: string | null; country?: string | null } | null;
  stuck: boolean;
  pending_age_seconds: number | null;
}

interface BattleStats {
  total: number;
  pending: number;
  stuck: number;
  playing: number;
  completed: number;
  disputed: number;
  cancelled: number;
  totalVolume: number;
  totalRevenue: number;
}

interface CountryInfo {
  code: string;
  count: number;
}

const RANGES = [
  { id: "1d", label: "1D" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "All" },
] as const;

const STATUS_FILTERS = [
  { id: "all", label: "All", color: "text-ccb-text" },
  { id: "stuck", label: "Stuck", color: "text-ccb-danger" },
  { id: "pending", label: "Pending", color: "text-ccb-muted" },
  { id: "playing", label: "Playing", color: "text-ccb-accent" },
  { id: "completed", label: "Completed", color: "text-ccb-success" },
  { id: "disputed", label: "Disputed", color: "text-ccb-danger" },
  { id: "cancelled", label: "Cancelled", color: "text-ccb-muted" },
] as const;

const COUNTRY_FLAGS: Record<string, string> = {
  MW: "🇲🇼", ZM: "🇿🇲", KE: "🇰🇪", GH: "🇬🇭", NG: "🇳🇬", UG: "🇺🇬", TZ: "🇹🇿",
  RW: "🇷🇼", SN: "🇸🇳", CI: "🇨🇮", CM: "🇨🇲", CD: "🇨🇩", BJ: "🇧🇯", ZA: "🇿🇦",
};

export default function BattlesAdminPanel({ formatMWK, formatDate }: { formatMWK: (n: number) => string; formatDate: (d: string) => string }) {
  const [battles, setBattles] = useState<BattleRow[]>([]);
  const [stats, setStats] = useState<BattleStats | null>(null);
  const [countries, setCountries] = useState<CountryInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [range, setRange] = useState<string>("7d");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchBattles = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams({ range, status: statusFilter, country, page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/battles?${params}`);
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      setBattles(data.battles || []);
      setStats(data.stats || null);
      setCountries(data.availableCountries || []);
      setTotal(data.total || 0);
    } catch { setBattles([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [range, statusFilter, country, page, limit, search]);

  useEffect(() => { fetchBattles(); }, [fetchBattles]);
  useEffect(() => { setPage(1); }, [range, statusFilter, country, search]);

  useEffect(() => {
    if (statusFilter === "all" || statusFilter === "stuck" || statusFilter === "pending" || statusFilter === "playing") {
      const t = setInterval(() => fetchBattles(true), 15000);
      return () => clearInterval(t);
    }
  }, [statusFilter, fetchBattles]);

  const handleAction = async (battleId: string, action: string, extra?: Record<string, any>) => {
    setActionLoading(`${battleId}:${action}`);
    try {
      const res = await fetch(`/api/admin/battles/${battleId}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      showToast(
        action === "cancel_refund" ? "Battle cancelled — both players refunded" :
        action === "retry_game" ? "Game created — battle is now playing" :
        action === "force_settle" ? "Battle settled — winner paid" : "Done"
      );
      setExpandedRow(null);
      fetchBattles(true);
    } catch (e: any) { showToast(e.message || "Action failed"); }
    finally { setActionLoading(null); }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-ccb-success text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* Time range selector */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
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
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile icon={Swords} label="Total Battles" value={stats.total} color="text-ccb-primary" />
          <StatTile icon={CheckCircle2} label="Completed" value={stats.completed} color="text-ccb-success" />
          <StatTile icon={Play} label="Playing" value={stats.playing} color="text-ccb-accent" />
          <StatTile icon={Hourglass} label="Pending" value={stats.pending} color="text-ccb-muted" />
          <StatTile icon={AlertTriangle} label="Stuck" value={stats.stuck} color="text-ccb-danger" highlight={stats.stuck > 0} />
          <StatTile icon={Ban} label="Cancelled" value={stats.cancelled} color="text-ccb-muted" />
          <StatTile icon={TrendingUp} label="Volume" value={formatMWK(stats.totalVolume)} color="text-ccb-accent" />
          <StatTile icon={DollarSign} label="Revenue" value={formatMWK(stats.totalRevenue)} color="text-ccb-success" />
        </div>
      )}

      {/* Filters bar */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((s) => (
            <button key={s.id} onClick={() => setStatusFilter(s.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s.id ? "bg-ccb-primary text-white" : `bg-ccb-surface ${s.color} hover:bg-ccb-border border border-ccb-border`
              }`}>
              {s.label}
              {stats && s.id !== "all" && (stats as any)[s.id] > 0 && (
                <span className="ml-1 opacity-60">({(stats as any)[s.id]})</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-ccb-muted" />
            <select value={country} onChange={(e) => setCountry(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-sm">
              <option value="all">All Countries</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{COUNTRY_FLAGS[c.code] || "🏳"} {c.code} ({c.count})</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-ccb-muted" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by player name..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
              onKeyDown={(e) => e.key === "Enter" && fetchBattles()} />
          </div>
          <button onClick={() => fetchBattles()} disabled={refreshing}
            className="px-2.5 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted hover:text-ccb-text text-sm flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh
          </button>
        </div>
      </div>

      {/* Stuck battles alert */}
      {stats && stats.stuck > 0 && statusFilter !== "stuck" && (
        <div className="bg-ccb-danger/10 border border-ccb-danger/30 rounded-lg p-3 flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-ccb-danger shrink-0" />
          <span className="text-ccb-danger font-medium">{stats.stuck} battle{stats.stuck > 1 ? "s" : ""} stuck in pending</span>
          <button onClick={() => setStatusFilter("stuck")} className="ml-auto text-ccb-danger underline text-xs font-medium">View stuck →</button>
        </div>
      )}

      {/* Battles table */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-ccb-muted" /></div>
      ) : battles.length === 0 ? (
        <div className="card text-center py-12 text-ccb-muted text-sm">
          <Swords className="w-8 h-8 mx-auto mb-2 opacity-30" />No battles found for these filters
        </div>
      ) : (
        <div className="space-y-2">
          {battles.map((b) => (
            <BattleCard key={b.id} battle={b} expanded={expandedRow === b.id}
              onToggle={() => setExpandedRow(expandedRow === b.id ? null : b.id)}
              formatMWK={formatMWK} formatDate={formatDate}
              actionLoading={actionLoading} onAction={handleAction} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ccb-muted">Page {page} of {totalPages} — {total} battles</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="p-1.5 rounded-lg bg-ccb-surface border border-ccb-border disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-ccb-surface border border-ccb-border disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, label, value, color, highlight }: { icon: any; label: string; value: any; color: string; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? "ring-2 ring-ccb-danger/40" : ""}`}>
      <div className="flex items-center gap-2 mb-1"><Icon className={`w-4 h-4 ${color}`} /><span className="text-xs text-ccb-muted">{label}</span></div>
      <p className={`text-lg font-bold ${highlight ? "text-ccb-danger" : ""}`}>{value}</p>
    </div>
  );
}

function statusBadge(status: string, stuck: boolean) {
  if (stuck) return "bg-ccb-danger/15 text-ccb-danger border-ccb-danger/30";
  switch (status) {
    case "completed": return "bg-ccb-success/10 text-ccb-success";
    case "playing": return "bg-ccb-accent/10 text-ccb-accent";
    case "draw_armageddon": return "bg-ccb-accent/10 text-ccb-accent";
    case "pending": return "bg-ccb-muted/10 text-ccb-muted";
    case "disputed": return "bg-ccb-danger/10 text-ccb-danger";
    case "cancelled": return "bg-ccb-muted/10 text-ccb-muted";
    default: return "bg-ccb-muted/10 text-ccb-muted";
  }
}

function playerName(p: { id: string; username: string | null; display_name: string | null } | null) {
  if (!p) return "?";
  return p.username || p.display_name || p.id.slice(0, 8);
}

function BattleCard({ battle: b, expanded, onToggle, formatMWK, formatDate, actionLoading, onAction }: {
  battle: BattleRow; expanded: boolean; onToggle: () => void;
  formatMWK: (n: number) => string; formatDate: (d: string) => string;
  actionLoading: string | null; onAction: (id: string, action: string, extra?: Record<string, any>) => void;
}) {
  const isLoading = (a: string) => actionLoading === `${b.id}:${a}`;
  const isStuck = b.stuck;
  const canCancel = b.status === "pending";
  const canRetry = b.status === "pending" && !b.game_id;
  const canSettle = !b.settled && b.status !== "completed" && b.status !== "cancelled";
  const viewableGameId = b.armageddon_game_id || b.game_id;
  const isWhiteWinner = b.winner_id === b.white_player_id;
  const isBlackWinner = b.winner_id === b.black_player_id;

  return (
    <div className={`card overflow-hidden ${isStuck ? "border-ccb-danger/40" : ""}`}>
      <div className="p-3">
        {/* Row 1: status + time control + date */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 border ${statusBadge(b.status, isStuck)}`}>
              {isStuck ? "⚠ STUCK" : b.status}
            </span>
            {b.time_control && <span className="text-xs text-ccb-muted shrink-0">{b.time_control}</span>}
            {b.armageddon_round > 0 && <span className="text-xs text-ccb-accent shrink-0">AG{b.armageddon_round}</span>}
            {b.stuck && b.pending_age_seconds != null && (
              <span className="text-xs text-ccb-danger font-medium shrink-0">{b.pending_age_seconds > 60 ? `${Math.floor(b.pending_age_seconds / 60)}m` : `${b.pending_age_seconds}s`} stuck</span>
            )}
          </div>
          <span className="text-xs text-ccb-muted shrink-0">{formatDate(b.created_at)}</span>
        </div>

        {/* Row 2: players */}
        <div className="flex items-center gap-1.5 text-sm font-medium mb-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 ${isWhiteWinner ? "text-ccb-success" : ""}`}>
            {isWhiteWinner && <Trophy className="w-3.5 h-3.5" />}{playerName(b.white_player)}
          </span>
          <span className="text-ccb-muted text-xs">vs</span>
          <span className={`inline-flex items-center gap-1 ${isBlackWinner ? "text-ccb-success" : ""}`}>
            {isBlackWinner && <Trophy className="w-3.5 h-3.5" />}{playerName(b.black_player)}
          </span>
        </div>

        {/* Row 3: stake/pot + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-ccb-muted">
            {formatMWK(b.stake)} stake <span className="mx-1">·</span> <span className="font-semibold text-foreground">{formatMWK(b.pot)}</span> pot
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {viewableGameId && (
              <a
                href={`/game/${viewableGameId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-ccb-accent/10 text-ccb-accent hover:bg-ccb-accent/20 text-xs font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View Game
              </a>
            )}
            <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-ccb-surface transition-colors">
              <ChevronRight className={`w-4 h-4 text-ccb-muted transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-ccb-border p-3 space-y-3 bg-ccb-surface/30">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <Detail label="Battle ID" value={b.id.slice(0, 8) + "…"} />
            <Detail label="Status" value={b.status} />
            <Detail label="Settled" value={b.settled ? "Yes" : "No"} />
            <Detail label="Stake" value={formatMWK(b.stake)} />
            <Detail label="Pot" value={formatMWK(b.pot)} />
            <Detail label="Platform Fee" value={formatMWK(b.platform_fee)} />
            <Detail label="Winner Payout" value={formatMWK(b.winner_payout)} />
            <Detail label="White Rating" value={b.white_rating ?? "—"} />
            <Detail label="Black Rating" value={b.black_rating ?? "—"} />
            <Detail label="Game ID" value={b.game_id ? b.game_id.slice(0, 8) + "…" : "—"} />
            <Detail label="Created" value={formatDate(b.created_at)} />
            <Detail label="Completed" value={b.completed_at ? formatDate(b.completed_at) : "—"} />
            {b.result && <Detail label="Result" value={b.result} />}
            {b.notes && <Detail label="Notes" value={b.notes} />}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-ccb-surface rounded-lg p-2.5">
              <p className="text-xs text-ccb-muted mb-1">White</p>
              <p className="text-sm font-medium">{playerName(b.white_player)}</p>
              {b.white_player?.country && <p className="text-xs text-ccb-muted">{COUNTRY_FLAGS[b.white_player.country] || ""} {b.white_player.country}</p>}
            </div>
            <div className="bg-ccb-surface rounded-lg p-2.5">
              <p className="text-xs text-ccb-muted mb-1">Black</p>
              <p className="text-sm font-medium">{playerName(b.black_player)}</p>
              {b.black_player?.country && <p className="text-xs text-ccb-muted">{COUNTRY_FLAGS[b.black_player.country] || ""} {b.black_player.country}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {canRetry && (
              <button onClick={() => onAction(b.id, "retry_game")} disabled={isLoading("retry_game")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ccb-accent/10 text-ccb-accent hover:bg-ccb-accent/20 text-xs font-medium disabled:opacity-50">
                {isLoading("retry_game") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}Retry Game
              </button>
            )}
            {canCancel && (
              <button onClick={() => onAction(b.id, "cancel_refund")} disabled={isLoading("cancel_refund")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ccb-danger/10 text-ccb-danger hover:bg-ccb-danger/20 text-xs font-medium disabled:opacity-50">
                {isLoading("cancel_refund") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}Cancel & Refund
              </button>
            )}
            {canSettle && (
              <>
                <button onClick={() => onAction(b.id, "force_settle", { winnerId: b.white_player_id })} disabled={isLoading("force_settle")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ccb-success/10 text-ccb-success hover:bg-ccb-success/20 text-xs font-medium disabled:opacity-50">
                  {isLoading("force_settle") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5" />}White Wins
                </button>
                <button onClick={() => onAction(b.id, "force_settle", { winnerId: b.black_player_id })} disabled={isLoading("force_settle")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ccb-success/10 text-ccb-success hover:bg-ccb-success/20 text-xs font-medium disabled:opacity-50">
                  {isLoading("force_settle") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5" />}Black Wins
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (<div><p className="text-xs text-ccb-muted mb-0.5">{label}</p><p className="text-sm font-medium">{value}</p></div>);
}
