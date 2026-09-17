"use client";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, CircleDot, Megaphone, Percent, Star, Swords, Trophy, type LucideIcon } from "lucide-react";

/**
 * Command Centre building blocks: KPI cards, revenue tiles, the
 * markets table + market modal, the transaction feed and the
 * Needs Attention strip. Presentation only — data flows in via props.
 */

import { useState } from "react";
import type {
  AttentionItem,
  FeedRow,
  Kpi,
  MarketRow,
  OverviewResponse,
  RangePresetUi,
} from "./types";
import { COUNTRY_FLAGS } from "@/lib/geo/flags";

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LOCAL_SYMBOLS: Record<string, string> = {
  MWK: "MK", ZMW: "ZK", KES: "KSh", NGN: "₦", ZAR: "R", GHS: "GH₵",
  TZS: "TSh", UGX: "USh", ZWL: "Z$", BWP: "P", NAD: "N$", RWF: "RF",
  XAF: "FCFA", XOF: "CFA", EGP: "E£", ETB: "Br", MAD: "DH", USD: "$",
};

export function formatLocal(amount: number | null, currency: string | null): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const code = currency || "";
  const symbol = LOCAL_SYMBOLS[code] || code;
  return `${Math.round(amount).toLocaleString("en-US")} ${symbol}`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS_DOT: Record<string, string> = {
  completed: "bg-emerald-500",
  pending: "bg-amber-400",
  failed: "bg-red-500",
  cancelled: "bg-zinc-500",
};

const KIND_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  battle_fee: "Battle fee",
  tournament: "Tournament payment",
  membership: "Membership payment",
  ad: "Ad purchase",
  withdrawal_fee: "Withdrawal fee",
};

// Transaction-kind icons (lucide) — sized by the badge they render in.
const KIND_ICON: Record<string, LucideIcon> = {
  deposit: ArrowDownLeft,
  withdrawal: ArrowUpRight,
  battle_fee: Swords,
  tournament: Trophy,
  membership: Star,
  ad: Megaphone,
  withdrawal_fee: Percent,
};

const COUNTRY_NAMES: Record<string, string> = {
  MW: "Malawi", ZM: "Zambia", KE: "Kenya", NG: "Nigeria", ZA: "South Africa",
  GH: "Ghana", TZ: "Tanzania", UG: "Uganda", ZW: "Zimbabwe", BW: "Botswana",
  NA: "Namibia", RW: "Rwanda", CM: "Cameroon", EG: "Egypt", ET: "Ethiopia",
  MA: "Morocco", SN: "Senegal", ZZ: "Other / Unknown",
};

export function countryName(code: string | null): string {
  return code ? COUNTRY_NAMES[code] || code : "Unknown";
}

// ── KPI cards ──────────────────────────────────────────────────────────────

export function DeltaBadge({ kpi }: { kpi: Kpi }) {
  if (kpi.snapshot) {
    return <span className="text-[11px] font-medium text-ccb-muted">live snapshot</span>;
  }
  if (kpi.changePct == null) {
    return <span className="text-[11px] font-medium text-ccb-muted">no baseline</span>;
  }
  const up = kpi.changePct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(kpi.changePct).toFixed(1)}%
      <span className="font-normal text-ccb-muted">vs prev</span>
    </span>
  );
}

export function KpiCard({
  label,
  kpi,
  hint,
  highlight,
}: {
  label: string;
  kpi: Kpi;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        highlight
          ? "border-violet-500/40 bg-gradient-to-br from-violet-500/10 to-transparent"
          : "border-ccb-border bg-ccb-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ccb-muted">{label}</p>
        {kpi.count != null && (
          <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-400">
            {kpi.count} open
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
        {formatUsd(kpi.usd)}
        {label === "Pending Withdrawals" && kpi.oldest && (
          <span className="ml-2 text-xs font-normal text-ccb-muted">
            oldest {timeAgo(kpi.oldest)}
          </span>
        )}
      </p>
      <div className="mt-1.5">
        <DeltaBadge kpi={kpi} />
        {hint && <p className="mt-1 text-[11px] text-ccb-muted">{hint}</p>}
      </div>
    </div>
  );
}

// ── Revenue tiles ─────────────────────────────────────────────────────────

const STREAM_ORDER = ["battles", "tournaments", "memberships", "ads", "withdrawal_fees"] as const;
const STREAM_TITLES: Record<string, string> = {
  battles: "Battles", tournaments: "Tournaments", memberships: "Memberships",
  ads: "Ads", withdrawal_fees: "Withdrawal Fees",
};

export function StreamTiles({
  data,
  activeStreams,
  onToggle,
  onOpenStream,
}: {
  data: OverviewResponse | null;
  activeStreams: string[];
  onToggle: (s: string) => void;
  onOpenStream: (s: string) => void;
}) {
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {STREAM_ORDER.map((s) => {
        const usd = data.revenue.streams[s] ?? 0;
        const prev = data.revenue.streamsPrev[s] ?? 0;
        const pct = prev === 0 ? null : ((usd - prev) / prev) * 100;
        const on = activeStreams.length === 0 || activeStreams.includes(s);
        return (
          <button
            key={s}
            onClick={() => onToggle(s)}
            onDoubleClick={() => onOpenStream(s)}
            title="Click to filter the chart · double-click for the stream page"
            className={`rounded-xl border p-3 text-left transition-all ${
              on ? "border-ccb-border bg-ccb-card" : "border-ccb-border/40 bg-transparent opacity-45"
            } hover:border-violet-500/50`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ccb-muted">
                {STREAM_TITLES[s]}
              </p>
              <span className="h-2 w-2 rounded-full" style={{ background: chartColor(s) }} />
            </div>
            <p className="mt-1.5 text-lg font-semibold text-white">{formatUsd(usd)}</p>
            <p className={`text-[11px] ${pct == null ? "text-ccb-muted" : pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {pct == null ? "no baseline" : `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function chartColor(s: string): string {
  const map: Record<string, string> = {
    battles: "#7c3aed", tournaments: "#a78bfa", memberships: "#fbbf24",
    ads: "#34d399", withdrawal_fees: "#38bdf8",
  };
  return map[s] || "#7c3aed";
}

// ── Needs Attention ────────────────────────────────────────────────────────

export function AttentionStrip({
  items,
  onReview,
}: {
  items: AttentionItem[];
  onReview: (item: AttentionItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-400"><Check className="h-4 w-4" />All clear — nothing needs attention right now.</p>
        <p className="mt-0.5 text-xs text-ccb-muted">
          No pending withdrawals, failed payments, stuck deposits or open flags in view.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-ccb-border bg-ccb-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Needs Attention</h3>
        <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-400">
          {items.length} item{items.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.key}
            className={`rounded-lg border p-3 ${
              item.severity === "critical"
                ? "border-red-500/30 bg-red-500/5"
                : "border-amber-400/30 bg-amber-400/5"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <span
                className={`text-[11px] font-bold ${
                  item.severity === "critical" ? "text-red-400" : "text-amber-400"
                }`}
              >
                {item.count}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ccb-muted">{item.detail}</p>
            <button
              onClick={() => onReview(item)}
              className="mt-2 rounded-md border border-ccb-border bg-ccb-surface px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:border-violet-500/60"
            >
              Review →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Markets ───────────────────────────────────────────────────────────────

export function MarketsTable({
  markets,
  compact,
  onOpenMarket,
  onViewAll,
}: {
  markets: MarketRow[];
  compact?: boolean;
  onOpenMarket: (m: MarketRow) => void;
  onViewAll?: () => void;
}) {
  const rows = compact ? markets.filter((m) => m.volume > 0 || m.players > 0).slice(0, 6) : markets;
  return (
    <div className="overflow-hidden rounded-xl border border-ccb-border bg-ccb-card">
      <div className="flex items-center justify-between border-b border-ccb-border px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Markets</h3>
        {compact && onViewAll && (
          <button onClick={onViewAll} className="text-xs font-semibold text-violet-400 hover:text-violet-300">
            View all {markets.length} →
          </button>
        )}
        {!compact && (
          <p className="text-[11px] text-ccb-muted">All figures USD · click a row for market detail</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ccb-muted">
              <th className="px-4 py-2.5 font-medium">Country</th>
              <th className="px-4 py-2.5 text-right font-medium">Volume</th>
              <th className="px-4 py-2.5 text-right font-medium">Deposits</th>
              <th className="px-4 py-2.5 text-right font-medium">Withdrawals</th>
              <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
              <th className="px-4 py-2.5 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.code}
                onClick={() => onOpenMarket(m)}
                className="cursor-pointer border-t border-ccb-border/60 transition-colors hover:bg-ccb-surface"
              >
                <td className="whitespace-nowrap px-4 py-2.5 font-medium text-white">
                  {COUNTRY_FLAGS[m.code] || ""} {countryName(m.code)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-white">{formatUsd(m.volume)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">+{formatUsd(m.deposits)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-400">−{formatUsd(m.withdrawals)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-white">{formatUsd(m.revenue)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      m.status === "active" ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                    title={m.status === "active" ? "Active this period" : "No activity this period"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MarketModal({ market, onClose }: { market: MarketRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ccb-border bg-ccb-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xl font-semibold text-white">
              {COUNTRY_FLAGS[market.code] || ""} {countryName(market.code)}
            </p>
            <p className="mt-0.5 text-xs text-ccb-muted">
              Local currency: <span className="font-semibold text-white">{market.currency}</span>
              {market.currency !== "USD" && " · admin figures shown in USD"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-ccb-border px-2 py-1 text-xs text-ccb-muted hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            ["Transaction volume", formatUsd(market.volume), "text-white"],
            ["Deposits", `+${formatUsd(market.deposits)}`, "text-emerald-400"],
            ["Withdrawals", `−${formatUsd(market.withdrawals)}`, "text-red-400"],
            ["Revenue", formatUsd(market.revenue), "text-white"],
            ["Players", market.players.toLocaleString(), "text-white"],
            ["Status", market.status === "active" ? "Active" : "No activity", "text-white"],
          ].map(([label, value, cls]) => (
            <div key={label} className="rounded-lg border border-ccb-border bg-ccb-surface p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-ccb-muted">{label}</p>
              <p className={`mt-1 text-sm font-semibold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-ccb-muted">
          Figures cover the selected period only, converted to USD at each transaction&apos;s
          recorded rate. Underlying local-currency transaction values are never altered.
        </p>
      </div>
    </div>
  );
}

// ── Transaction feed ───────────────────────────────────────────────────────

export function TransactionFeed({
  rows,
  onOpen,
  dense,
}: {
  rows: FeedRow[];
  onOpen: (row: FeedRow) => void;
  dense?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-ccb-muted">
        No transactions match the current filters.
      </div>
    );
  }
  return (
    <div className="divide-y divide-ccb-border/60">
      {rows.map((r) => (
        <button
          key={r.id}
          onClick={() => onOpen(r)}
          className={`flex w-full items-center gap-3 text-left transition-colors hover:bg-ccb-surface ${
            dense ? "px-3 py-2" : "px-4 py-3"
          }`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ccb-border bg-ccb-surface text-sm ${
              r.kind === "deposit" || r.kind === "membership" ? "text-emerald-400"
              : r.kind === "withdrawal" || r.kind === "withdrawal_fee" ? "text-red-400"
              : "text-violet-400"
            }`}
          >
            {(() => {
              const KindIcon = KIND_ICON[r.kind] ?? CircleDot;
              return <KindIcon className="h-4 w-4" />;
            })()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-white">
                {r.playerName || "Unknown"}
                <span className="ml-1.5 text-ccb-muted">
                  {r.country ? `${COUNTRY_FLAGS[r.country] || ""}` : ""}
                </span>
              </p>
              <span className="rounded bg-ccb-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ccb-muted">
                {KIND_LABEL[r.kind] || r.kind}
              </span>
            </div>
            <p className="truncate text-[11px] text-ccb-muted">
              {r.id.slice(0, 8)}
              {r.reference ? ` · ref ${r.reference.slice(0, 14)}` : ""}
              {` · ${countryName(r.country)}`}
              {r.localAmount != null && r.localCurrency
                ? ` · ${formatLocal(r.localAmount, r.localCurrency)}`
                : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-white">
              {r.amountUsd != null ? `${formatUsd(r.amountUsd)} USD` : "—"}
            </p>
            <p className="flex items-center justify-end gap-1.5 text-[11px] text-ccb-muted">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[r.status]}`} />
              {" "}{timeAgo(r.time)}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

export function TypeChips({
  value,
  onChange,
}: {
  value: RangePresetUi | string;
  onChange: (v: string) => void;
}) {
  const chips: Array<[string, string]> = [
    ["all", "All"],
    ["deposit", "Deposits"],
    ["withdrawal", "Withdrawals"],
    ["battle_fee", "Battle fees"],
    ["tournament", "Tournaments"],
    ["membership", "Memberships"],
    ["ad", "Ads"],
    ["withdrawal_fee", "W/D fees"],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === k
              ? "bg-violet-600 text-white"
              : "border border-ccb-border bg-ccb-surface text-ccb-muted hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
