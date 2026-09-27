"use client";

import { Users, CheckCircle, Clock, Wallet, TrendingUp, Gift } from "lucide-react";
import Link from "next/link";
import { useCurrency } from "@/hooks/use-currency";
import { shortDate, monthHeading } from "@/lib/affiliate/labels";
import EarningsChart from "./earnings-chart";
import ShareCard from "./share-card";

interface MiniReferral {
  id: string;
  status: string | null;
  created_at: string;
  activated_at: string | null;
  name: string;
}

interface MiniLedgerEntry {
  id: string;
  amount: number;
  created_at: string;
}

interface DashboardViewProps {
  affiliateEnabled: boolean;
  refCode: string;
  referralLink: string;
  walletBalance: number;
  stats: {
    total: number;
    active: number;
    pending: number;
    lifetimeEarned: number;
    earnedThisMonth: number;
    perMonth: number[];
  };
  chartLabels: string[];
  recentReferrals: MiniReferral[];
  recentLedger: { ym: string; entries: MiniLedgerEntry[] }[];
}

const Tile = ({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Users;
  value: string;
  label: string;
  accent?: "success" | "primary";
}) => (
  <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 flex items-center gap-3">
    <div
      className={
        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border " +
        (accent === "success"
          ? "bg-ccb-success/15 border-ccb-success/25 text-ccb-success"
          : accent === "primary"
            ? "bg-ccb-primary/15 border-ccb-primary/25 text-ccb-primary"
            : "bg-ccb-muted/15 border-ccb-border text-ccb-muted")
      }
    >
      <Icon className="w-5 h-5" />
    </div>
    <div className="min-w-0">
      <p className="text-xl font-extrabold leading-none truncate">{value}</p>
      <p className="text-[10px] text-ccb-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  </div>
);

export default function DashboardView({
  affiliateEnabled,
  refCode,
  referralLink,
  walletBalance,
  stats,
  chartLabels,
  recentReferrals,
  recentLedger,
}: DashboardViewProps) {
  const { formatWallet } = useCurrency();

  return (
    <div className="space-y-4 sm:space-y-6">
      {!affiliateEnabled && (
        <div className="rounded-xl border border-ccb-accent/30 bg-ccb-accent/10 p-4 text-center">
          <p className="text-sm font-semibold text-ccb-accent">Commissions are paused for a moment</p>
          <p className="text-xs text-ccb-muted mt-1">
            Your referral links still track every sign-up — commissions will be credited automatically when the program resumes.
          </p>
        </div>
      )}

      {/* Headline tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Tile icon={Users} value={String(stats.total)} label="Invited" />
        <Tile icon={CheckCircle} value={String(stats.active)} label="Active" accent="success" />
        <Tile icon={Wallet} value={formatWallet(stats.lifetimeEarned)} label="Earned" accent="primary" />
        <Tile icon={TrendingUp} value={formatWallet(stats.earnedThisMonth)} label="This month" accent="success" />
      </div>

      {stats.pending > 0 && (
        <Link
          href="/affiliate/team?filter=pending"
          className="flex items-center gap-3 rounded-xl border border-ccb-border bg-ccb-card p-3.5 hover:border-ccb-primary/40 transition-colors"
        >
          <Clock className="w-4 h-4 text-ccb-accent shrink-0" />
          <p className="text-xs text-ccb-muted">
            <span className="font-bold text-foreground">{stats.pending}</span> friend
            {stats.pending === 1 ? "" : "s"} still pending — a quick nudge usually does it.
          </p>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-ccb-primary">View team</span>
        </Link>
      )}

      {/* Chart + share */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <EarningsChart perMonth={stats.perMonth} labels={chartLabels} format={formatWallet} />
        <ShareCard refCode={refCode} referralLink={referralLink} compact />
      </div>

      {/* Recent activity */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ccb-muted">Recent sign-ups</h3>
            <Link href="/affiliate/team" className="text-[10px] font-bold uppercase tracking-wider text-ccb-primary">
              All
            </Link>
          </div>
          {recentReferrals.length === 0 ? (
            <p className="text-xs text-ccb-muted py-4 text-center">No sign-ups yet — share your link to start.</p>
          ) : (
            <ul className="divide-y divide-ccb-border">
              {recentReferrals.map((r) => {
                const active = r.status === "activated" || r.status === "rewarded" || !!r.activated_at;
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <div
                      className={
                        "w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 " +
                        (active ? "bg-ccb-success/15 border-ccb-success/30 text-ccb-success" : "bg-ccb-surface border-ccb-border text-ccb-muted")
                      }
                    >
                      {r.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{r.name}</p>
                      <p className="text-[10px] text-ccb-muted">joined {shortDate(r.created_at)}</p>
                    </div>
                    <span
                      className={
                        "text-[10px] font-bold px-2 py-1 rounded-md border shrink-0 " +
                        (active
                          ? "bg-ccb-success/10 border-ccb-success/25 text-ccb-success"
                          : "bg-ccb-accent/10 border-ccb-accent/25 text-ccb-accent")
                      }
                    >
                      {active ? "Active" : "Pending"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ccb-muted">Recent commissions</h3>
            <Link href="/affiliate/earnings" className="text-[10px] font-bold uppercase tracking-wider text-ccb-primary">
              All
            </Link>
          </div>
          {recentLedger.length === 0 ? (
            <p className="text-xs text-ccb-muted py-4 text-center">
              No commissions yet — they land here the moment a friend pays.
            </p>
          ) : (
            recentLedger.map(({ ym, entries }) => (
              <div key={ym} className="mb-3 last:mb-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted mb-1.5">{monthHeading(ym)}</p>
                <ul className="space-y-1.5">
                  {entries.slice(0, 5).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-ccb-muted flex items-center gap-1.5">
                        <Gift className="w-3 h-3 text-ccb-primary" /> Commission paid
                      </span>
                      <span className="text-xs">
                        <span className="text-ccb-muted">{shortDate(e.created_at)} · </span>
                        <span className="font-bold text-ccb-success">+{formatWallet(e.amount)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
