"use client";

import { useState } from "react";
import {
  Gift, Users, CheckCircle, Clock, Copy, Check, Share2,
  Wallet, ChevronRight, Info, Sparkles, TrendingUp, Crown,
} from "lucide-react";

interface Referral {
  id: string;
  status: string;
  created_at: string;
  activated_at: string | null;
  activation_condition: string | null;
  commission_amount: number;
  commission_paid: boolean;
  referred: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    rating: number;
  } | null;
}

interface AffiliateClientProps {
  refCode: string;
  baseUrl: string;
  walletBalance: number;
  totalCommissionEarned: number;
  membershipPrice: number;
  yearlyPrice: number;
  membershipCurrency: string;
  commissionRate: number;
  referrals: Referral[];
}

const ACTIVATION_LABELS: Record<string, string> = {
  chess_battle: "Played a cash battle",
  tournament_joined: "Joined a tournament",
  wallet_topup: "Topped up wallet",
  "10_quick_matches": "Played 10 quick matches",
  membership_purchase: "Purchased membership",
};

import { useCurrency } from "@/hooks/use-currency";


export default function AffiliateClient({
  refCode,
  baseUrl,
  walletBalance,
  totalCommissionEarned,
  membershipPrice,
  yearlyPrice,
  membershipCurrency,
  commissionRate,
  referrals,
}: AffiliateClientProps) {
  const [copied, setCopied] = useState(false);
  const [copyLink, setCopyLink] = useState(false);
  const { formatMoney: fmtCurrency } = useCurrency();

  const referralLink = `${baseUrl}/signup?ref=${refCode}`;
  const commissionPct = Math.round(commissionRate * 100);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(refCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopyLink(true);
    setTimeout(() => setCopyLink(false), 2000);
  };

  const handleShare = async () => {
    const shareText = "Join me on Crazy Chess Battles — play chess, compete in leagues & tournaments, and battle for cash!";
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Crazy Chess Battles",
          text: shareText,
          url: referralLink,
        });
      } catch {}
    } else {
      handleCopyLink();
    }
  };

  // Stats
  const totalRefs = referrals.length;
  const activatedRefs = referrals.filter(r => r.status === "activated" || r.status === "rewarded" || !!r.activated_at).length;
  const pendingRefs = totalRefs - activatedRefs;

  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto space-y-4 pb-8">
      {/* HERO — compact for mobile */}
      <div className="bg-gradient-to-br from-ccb-primary/15 via-ccb-card to-ccb-card border border-ccb-primary/20 rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-10 h-10 rounded-xl bg-ccb-primary/20 border border-ccb-primary/30 flex items-center justify-center shrink-0">
            <Gift className="w-5 h-5 text-ccb-primary" />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-base sm:text-lg leading-tight">Affiliate Program</h1>
            <p className="text-xs text-ccb-muted mt-0.5">
              Earn <span className="font-bold text-ccb-primary">{commissionPct}%</span> commission on every membership your referrals buy
            </p>
          </div>
        </div>

        {/* Commission showcase */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-ccb-surface/50 rounded-xl p-3 border border-ccb-border/50">
            <div className="flex items-center gap-1 mb-1">
              <Crown className="w-3 h-3 text-ccb-accent" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Monthly</span>
            </div>
            <p className="text-sm font-bold">{fmtCurrency(membershipPrice)}</p>
            <p className="text-xs text-ccb-success font-semibold mt-0.5">You earn {fmtCurrency(membershipPrice * commissionRate)}</p>
          </div>
          <div className="bg-ccb-surface/50 rounded-xl p-3 border border-ccb-border/50">
            <div className="flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3 text-ccb-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Yearly</span>
            </div>
            <p className="text-sm font-bold">{membershipCurrency} {fmtCurrency(yearlyPrice)}</p>
            <p className="text-xs text-ccb-success font-semibold mt-0.5">You earn {fmtCurrency(yearlyPrice * commissionRate)}</p>
          </div>
        </div>

        {/* Ongoing badge */}
        <div className="flex items-center gap-1.5 mt-3 text-[11px] text-ccb-muted">
          <TrendingUp className="w-3.5 h-3.5 text-ccb-success" />
          <span>Ongoing — you earn commission every time they renew. No limit.</span>
        </div>
      </div>

      {/* REFERRAL LINK — touch-friendly for mobile */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted mb-1.5 block">Your Referral Link</label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={referralLink}
              className="flex-1 min-w-0 bg-ccb-surface border border-ccb-border rounded-lg px-3 py-2.5 text-xs text-ccb-muted truncate"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopyLink}
              className="shrink-0 p-2.5 rounded-lg bg-ccb-primary text-white active:scale-95 transition-transform"
              aria-label="Copy link"
            >
              {copyLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted mb-1.5 block">Referral Code</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={refCode}
                className="flex-1 min-w-0 bg-ccb-surface border border-ccb-border rounded-lg px-3 py-2.5 text-xs font-mono text-ccb-muted"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopyCode}
                className="shrink-0 p-2.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted active:scale-95 transition-transform"
                aria-label="Copy code"
              >
                {copied ? <Check className="w-4 h-4 text-ccb-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            onClick={handleShare}
            className="self-end px-4 py-2.5 rounded-lg bg-ccb-surface border border-ccb-border text-sm font-medium active:scale-95 transition-transform flex items-center gap-1.5 shrink-0"
          >
            <Share2 className="w-4 h-4" /> Share
          </button>
        </div>
      </div>

      {/* STATS — 3 columns, compact on mobile */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-ccb-card border border-ccb-border rounded-xl p-3 text-center">
          <Users className="w-4 h-4 text-ccb-muted mx-auto mb-1" />
          <p className="text-lg font-bold">{totalRefs}</p>
          <p className="text-[10px] text-ccb-muted uppercase tracking-wider">Invited</p>
        </div>
        <div className="bg-ccb-card border border-ccb-border rounded-xl p-3 text-center">
          <CheckCircle className="w-4 h-4 text-ccb-success mx-auto mb-1" />
          <p className="text-lg font-bold text-ccb-success">{activatedRefs}</p>
          <p className="text-[10px] text-ccb-muted uppercase tracking-wider">Active</p>
        </div>
        <div className="bg-ccb-card border border-ccb-primary/30 rounded-xl p-3 text-center">
          <Wallet className="w-4 h-4 text-ccb-primary mx-auto mb-1" />
          <p className="text-base font-bold text-ccb-primary leading-tight">{membershipCurrency} {fmtCurrency(totalCommissionEarned)}</p>
          <p className="text-[10px] text-ccb-muted uppercase tracking-wider">Earned</p>
        </div>
      </div>

      {/* HOW IT WORKS — mobile-optimized */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-3 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" /> How It Works
        </h3>
        <div className="space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-ccb-primary/20 text-ccb-primary text-[11px] font-bold flex items-center justify-center shrink-0">1</div>
            <div>
              <p className="text-sm font-medium">Share your link</p>
              <p className="text-xs text-ccb-muted mt-0.5">Send your referral link to friends via WhatsApp or social media.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-ccb-primary/20 text-ccb-primary text-[11px] font-bold flex items-center justify-center shrink-0">2</div>
            <div>
              <p className="text-sm font-medium">Friend signs up & buys membership</p>
              <p className="text-xs text-ccb-muted mt-0.5">Your friend registers using your link and subscribes to CrazyChess Club.</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-ccb-success/20 text-ccb-success text-[11px] font-bold flex items-center justify-center shrink-0">3</div>
            <div>
              <p className="text-sm font-medium">You earn {commissionPct}% — every renewal</p>
              <p className="text-xs text-ccb-muted mt-0.5">
                {fmtCurrency(membershipPrice * commissionRate)} per monthly sub, {fmtCurrency(yearlyPrice * commissionRate)} per yearly. Credited to your wallet automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* REFERRALS LIST — mobile cards */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ccb-muted">Your Referrals</h3>
          <span className="text-[10px] text-ccb-muted">{totalRefs} total</span>
        </div>

        {referrals.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-8 h-8 text-ccb-muted/50 mx-auto mb-2" />
            <p className="text-sm text-ccb-muted">No referrals yet — share your link to start earning!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {referrals.map((ref) => {
              const isActive = ref.status === "activated" || ref.status === "rewarded" || !!ref.activated_at;
              return (
                <div key={ref.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-ccb-surface">
                  {/* Avatar */}
                  {ref.referred?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ref.referred.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-ccb-primary/10 border border-ccb-border flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-ccb-primary">
                        {(ref.referred?.display_name || ref.referred?.username || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {ref.referred?.display_name || ref.referred?.username || "Pending registration"}
                    </p>
                    <p className="text-[10px] text-ccb-muted">
                      {isActive ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-ccb-success" />
                          {ref.activation_condition ? ACTIVATION_LABELS[ref.activation_condition] || "Activated" : "Activated"}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-ccb-muted" />
                          Pending — waiting for membership purchase
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Commission badge or pending */}
                  {isActive && ref.commission_amount > 0 ? (
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-ccb-success">+{membershipCurrency} {fmtCurrency(ref.commission_amount)}</p>
                      <p className="text-[9px] text-ccb-muted">commission</p>
                    </div>
                  ) : isActive ? (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-success/10 text-ccb-success shrink-0">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-muted/10 text-ccb-muted shrink-0">
                      Pending
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* WALLET BALANCE FOOTER */}
      <div className="bg-ccb-surface border border-ccb-border rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Current Wallet Balance</p>
          <p className="text-lg font-bold mt-0.5">{fmtCurrency(walletBalance)}</p>
        </div>
        <a href="/wallet" className="text-xs font-bold text-ccb-primary hover:underline flex items-center gap-1">
          View Wallet <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
