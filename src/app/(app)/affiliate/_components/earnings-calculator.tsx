"use client";

import { useState } from "react";
import { Calculator as CalcIcon, TrendingUp } from "lucide-react";
import { formatUsd } from "@/lib/geo/format";

interface EarningsCalculatorProps {
  /** Membership is a single USD-priced plan — price pulled from platform settings. */
  membershipPriceUsd: number;
  commissionRate: number;
}

/**
 * Slider: memberships alone. Estimates recurring membership commissions —
 * battle fees, tournament entries and ads all stack on top.
 */
export default function EarningsCalculator({
  membershipPriceUsd,
  commissionRate,
}: EarningsCalculatorProps) {
  const [activeFriends, setActiveFriends] = useState(10);
  const commissionPct = Math.round(commissionRate * 100);
  const membershipEarn = formatUsd(membershipPriceUsd * commissionRate);
  const perFriendMonthly = membershipPriceUsd * commissionRate;
  const estimateMonthly = formatUsd(activeFriends * perFriendMonthly);

  return (
    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted flex items-center gap-1.5">
          <CalcIcon className="w-3.5 h-3.5" /> Earnings calculator
        </label>
        <span className="text-[10px] text-ccb-muted">memberships alone</span>
      </div>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-sm font-semibold">
          {activeFriends} active {activeFriends === 1 ? "friend" : "friends"}
        </p>
        <p className="text-xl sm:text-2xl font-extrabold text-ccb-success">≈ {estimateMonthly}/mo</p>
      </div>
      <input
        type="range"
        min={1}
        max={50}
        value={activeFriends}
        onChange={(e) => setActiveFriends(Number(e.target.value))}
        className="w-full accent-ccb-primary cursor-pointer"
        aria-label="Number of active friends"
      />
      <p className="text-[11px] text-ccb-muted mt-2">
        Every friend pays you {membershipEarn} per month they hold a membership — plus {commissionPct}%
        of every battle fee, tournament entry and ad they buy.
      </p>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-ccb-muted">
        <TrendingUp className="w-3.5 h-3.5 text-ccb-success shrink-0" />
        Recurring &amp; unlimited — commissions never expire.
      </div>
    </div>
  );
}
