"use client";

import { useMemo, useState } from "react";
import { Search, Send } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { shortDate, referralLink } from "@/lib/affiliate/labels";

interface TeamReferral {
  id: string;
  status: string | null;
  created_at: string;
  activated_at: string | null;
  activation_condition: string | null;
  commission_amount: number;
  referred: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    rating: number | null;
  } | null;
}

interface TeamClientProps {
  referrals: TeamReferral[];
  baseUrl: string;
  refCode: string;
  initialFilter?: string;
}

type Filter = "all" | "active" | "pending";

function isActive(r: TeamReferral): boolean {
  return r.status === "activated" || r.status === "rewarded" || !!r.activated_at;
}

export default function TeamClient({ referrals, baseUrl, refCode, initialFilter }: TeamClientProps) {
  const [filter, setFilter] = useState<Filter>(
    initialFilter === "pending" || initialFilter === "active" ? (initialFilter as Filter) : "all"
  );
  const [query, setQuery] = useState("");
  const { formatWallet } = useCurrency();

  const link = referralLink(baseUrl, refCode);
  const counts = useMemo(
    () => ({
      all: referrals.length,
      active: referrals.filter(isActive).length,
      pending: referrals.filter((r) => !isActive(r)).length,
    }),
    [referrals]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return referrals.filter((r) => {
      if (filter === "active" && !isActive(r)) return false;
      if (filter === "pending" && isActive(r)) return false;
      if (!q) return true;
      const name = r.referred?.display_name || r.referred?.username || "";
      return name.toLowerCase().includes(q);
    });
  }, [referrals, filter, query]);

  const nudgeShare = (name: string) =>
    `https://wa.me/?text=${encodeURIComponent(
      `Hey ${name}! Come play your first cash battle on Crazy Chess Battles 🏆 ${link}`
    )}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5 sm:p-6 flex flex-col justify-center min-h-[92px] sm:min-h-[110px]">
          <p className="text-2xl sm:text-3xl font-extrabold leading-none">{counts.all}</p>
          <p className="text-[11px] text-ccb-muted uppercase tracking-wider mt-2">Invited</p>
        </div>
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5 sm:p-6 flex flex-col justify-center min-h-[92px] sm:min-h-[110px]">
          <p className="text-2xl sm:text-3xl font-extrabold leading-none text-ccb-success">{counts.active}</p>
          <p className="text-[11px] text-ccb-muted uppercase tracking-wider mt-2">Active</p>
        </div>
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5 sm:p-6 flex flex-col justify-center min-h-[92px] sm:min-h-[110px]">
          <p className="text-2xl sm:text-3xl font-extrabold leading-none text-ccb-accent">{counts.pending}</p>
          <p className="text-[11px] text-ccb-muted uppercase tracking-wider mt-2">To nudge</p>
        </div>
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1.5 bg-ccb-card border border-ccb-border rounded-xl p-1">
          {(["all", "active", "pending"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors " +
                (filter === f ? "bg-ccb-primary text-white" : "text-ccb-muted hover:text-foreground")
              }
            >
              {f}
              {f !== "all" && (
                <span className="ml-1 opacity-70">{counts[f]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-ccb-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your team..."
            className="w-full bg-ccb-card border border-ccb-border rounded-xl pl-9 pr-3 py-2 text-sm placeholder:text-ccb-muted"
            aria-label="Search team members"
          />
        </div>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold">Nothing here yet</p>
          <p className="text-xs text-ccb-muted mt-1">
            {counts.all === 0
              ? "Share your link from the Overview page — everyone who joins lands here."
              : "No friends match this filter."}
          </p>
        </div>
      ) : (
        <div className="bg-ccb-card border border-ccb-border rounded-2xl divide-y divide-ccb-border overflow-hidden">
          {visible.map((r) => {
            const active = isActive(r);
            const name = r.referred?.display_name || r.referred?.username || "Player";
            return (
              <div key={r.id} className="flex items-center gap-3 p-3.5 sm:p-4">
                {/* Avatar */}
                {r.referred?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.referred.avatar_url} alt={name} className="w-10 h-10 rounded-full border border-ccb-border object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-sm font-bold text-ccb-muted shrink-0">
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  <p className="text-[11px] text-ccb-muted truncate">
                    {active ? `active ${shortDate(r.activated_at)}` : `joined ${shortDate(r.created_at)}`}
                    {r.referred?.rating ? ` · ${Math.round(r.referred.rating)}★` : ""}
                  </p>
                </div>

                {active ? (
                  r.commission_amount > 0 ? (
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-ccb-success">+{formatWallet(r.commission_amount)}</p>
                      <p className="text-[10px] text-ccb-muted">commission</p>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-ccb-success/10 border border-ccb-success/25 text-ccb-success shrink-0">
                      Active
                    </span>
                  )
                ) : (
                  <a
                    href={nudgeShare(name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-ccb-primary/15 border border-ccb-primary/30 text-ccb-primary flex items-center gap-1 active:scale-95 transition-transform"
                  >
                    <Send className="w-3 h-3" /> Nudge
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
