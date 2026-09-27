export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Wallet, ArrowUpRight } from "lucide-react";
import { getCommissionLedger, computeStats, getReferrals } from "@/lib/affiliate/data";
import { groupByMonth, shortDate, monthHeading } from "@/lib/affiliate/labels";
import { pageMetadata } from "@/lib/seo/metadata";
import MoneyValue from "../_components/money-value";

export const metadata = pageMetadata({
  title: "Affiliate Earnings",
  description: "Your full commission history, grouped by month.",
  path: "/affiliate/earnings",
  noIndex: true,
});

export default async function AffiliateEarningsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/affiliate/earnings");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, wallet_balance")
    .eq("id", user.id)
    .single();

  const [ledger, referrals] = await Promise.all([
    getCommissionLedger(admin, user.id),
    getReferrals(admin, user.id),
  ]);
  const stats = computeStats(referrals, ledger);
  const months = groupByMonth(ledger);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Lifetime summary */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        <div className="bg-ccb-card border border-ccb-primary/30 rounded-2xl p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Lifetime commissions</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-ccb-primary mt-1.5">
            <MoneyValue amount={stats.lifetimeEarned} />
          </p>
          <p className="text-[11px] text-ccb-muted mt-1">across {ledger.length} payments</p>
        </div>
        <Link
          href="/wallet"
          className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-5 hover:border-ccb-primary/40 transition-colors flex flex-col"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted flex items-center gap-1.5">
            <Wallet className="w-3 h-3" /> Wallet balance
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold mt-1.5">
            <MoneyValue amount={profile?.wallet_balance || 0} />
          </p>
          <p className="text-[11px] text-ccb-primary mt-1 flex items-center gap-0.5">
            Withdraw anytime <ArrowUpRight className="w-3 h-3" />
          </p>
        </Link>
      </div>

      {/* Ledger */}
      {months.length === 0 ? (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold">No commissions yet</p>
          <p className="text-xs text-ccb-muted mt-1 max-w-sm mx-auto">
            Commissions land here the moment an activated friend generates a fee — and they&apos;re credited
            to your wallet automatically.
          </p>
          <Link
            href="/affiliate"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-ccb-primary text-white text-sm font-semibold active:scale-95 transition-transform"
          >
            Share your link
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {months.map(({ ym, entries }) => {
            const total = entries.reduce((s, e) => s + (e.amount || 0), 0);
            return (
              <div key={ym} className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-ccb-border bg-ccb-surface/40">
                  <p className="text-xs font-bold uppercase tracking-wider text-ccb-muted">
                    {monthHeading(ym)}
                  </p>
                  <p className="text-sm font-extrabold text-ccb-success">
                    +<MoneyValue amount={total} />
                  </p>
                </div>
                <ul className="divide-y divide-ccb-border">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3">
                      <span className="text-xs text-ccb-muted flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-ccb-success/10 border border-ccb-success/25 flex items-center justify-center shrink-0">
                          <ArrowUpRight className="w-3 h-3 text-ccb-success" />
                        </span>
                        Commission credited
                      </span>
                      <span className="text-xs">
                        <span className="text-ccb-muted">{shortDate(e.created_at)} · </span>
                        <span className="font-bold">+<MoneyValue amount={e.amount} /></span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-ccb-muted text-center">
        Commissions are credited to your wallet the instant a friend pays — no payout requests, no waiting.
      </p>
    </div>
  );
}
