"use client";

import { useState } from "react";
import {
  Gift, Users, CheckCircle, Clock, Copy, Check, Share2,
  Wallet, Trophy, ChevronRight, Info,
} from "lucide-react";

interface Referral {
  id: string;
  status: string;
  created_at: string;
  activated_at: string | null;
  reward_paid: boolean;
  activation_action: string | null;
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
  referrals: Referral[];
}

const REWARD_AMOUNT = 500; // MK500 in cash

const ACTIVATION_LABELS: Record<string, string> = {
  deposit: "Made a deposit",
  battle: "Played a cash battle",
  quick_match: "Played a quick match",
  tournament: "Joined a tournament",
  wallet_topup: "Topped up wallet",
};

export default function AffiliateClient({ refCode, baseUrl, walletBalance, referrals }: AffiliateClientProps) {
  const [copied, setCopied] = useState(false);
  const [copyLink, setCopyLink] = useState(false);

  const referralLink = `${baseUrl}/signup?ref=${refCode}`;

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
  const activatedRefs = referrals.filter(r => r.status === "activated" || !!r.activated_at).length;
  const pendingRefs = totalRefs - activatedRefs;
  const earnedTotal = referrals.filter(r => r.reward_paid).length * REWARD_AMOUNT;

  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-5">
      {/* HERO */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-ccb-primary/20 border border-ccb-primary/30 flex items-center justify-center shrink-0">
            <Gift className="w-6 h-6 text-ccb-primary" />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-lg">Affiliate Program</h1>
            <p className="text-sm text-ccb-muted mt-0.5">
              Earn <span className="font-bold text-ccb-primary">MK {REWARD_AMOUNT.toLocaleString()}</span> cash for every friend who becomes active on CCB.
            </p>
          </div>
        </div>

        {/* Referral link */}
        <div className="bg-ccb-surface rounded-xl p-3 sm:p-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted mb-1.5 block">Your Referral Link</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={referralLink}
                className="flex-1 bg-ccb-card border border-ccb-border rounded-lg px-3 py-2 text-xs text-ccb-muted truncate"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopyLink}
                className="shrink-0 p-2 rounded-lg bg-ccb-primary text-white hover:opacity-90 transition-opacity"
                aria-label="Copy link"
              >
                {copyLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted mb-1.5 block">Referral Code</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={refCode}
                  className="flex-1 bg-ccb-card border border-ccb-border rounded-lg px-3 py-2 text-xs font-mono text-ccb-muted"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={handleCopyCode}
                  className="shrink-0 p-2 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted hover:text-ccb-text transition-colors"
                  aria-label="Copy code"
                >
                  {copied ? <Check className="w-4 h-4 text-ccb-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              onClick={handleShare}
              className="mt-5 shrink-0 px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm font-medium hover:bg-ccb-accent/10 transition-colors flex items-center gap-1.5"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-ccb-card border border-ccb-border rounded-xl p-3 sm:p-4 text-center">
          <Users className="w-4 h-4 text-ccb-muted mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold">{totalRefs}</p>
          <p className="text-[10px] text-ccb-muted uppercase tracking-wider">Invited</p>
        </div>
        <div className="bg-ccb-card border border-ccb-border rounded-xl p-3 sm:p-4 text-center">
          <CheckCircle className="w-4 h-4 text-ccb-success mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-ccb-success">{activatedRefs}</p>
          <p className="text-[10px] text-ccb-muted uppercase tracking-wider">Active</p>
        </div>
        <div className="bg-ccb-card border border-ccb-primary/30 rounded-xl p-3 sm:p-4 text-center">
          <Wallet className="w-4 h-4 text-ccb-primary mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-ccb-primary">MK {earnedTotal.toLocaleString()}</p>
          <p className="text-[10px] text-ccb-muted uppercase tracking-wider">Earned</p>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-3 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" /> How It Works
        </h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-ccb-primary/20 text-ccb-primary text-xs font-bold flex items-center justify-center shrink-0">1</div>
            <div>
              <p className="text-sm font-medium">Share your link</p>
              <p className="text-xs text-ccb-muted mt-0.5">Send your referral link to friends via WhatsApp, social media, or word of mouth.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-ccb-primary/20 text-ccb-primary text-xs font-bold flex items-center justify-center shrink-0">2</div>
            <div>
              <p className="text-sm font-medium">Friend signs up & activates</p>
              <p className="text-xs text-ccb-muted mt-0.5">Your friend registers using your link. When they do any of these actions, the referral activates:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(ACTIVATION_LABELS).map(([key, label]) => (
                  <span key={key} className="text-[10px] font-medium px-2 py-1 rounded-lg bg-ccb-surface text-ccb-muted">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-ccb-success/20 text-ccb-success text-xs font-bold flex items-center justify-center shrink-0">3</div>
            <div>
              <p className="text-sm font-medium">You earn MK {REWARD_AMOUNT.toLocaleString()}</p>
              <p className="text-xs text-ccb-muted mt-0.5">MK {REWARD_AMOUNT.toLocaleString()} is credited to your wallet automatically. No limit on referrals.</p>
            </div>
          </div>
        </div>
      </div>

      {/* REFERRALS LIST */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5">
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
              const isActive = ref.status === "activated" || !!ref.activated_at;
              return (
                <div key={ref.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ccb-surface">
                  {/* Avatar */}
                  {ref.referred?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ref.referred.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-ccb-card border border-ccb-border text-xs font-bold flex items-center justify-center shrink-0 text-ccb-muted">
                      {(ref.referred?.display_name || ref.referred?.username || "?")[0]?.toUpperCase()}
                    </span>
                  )}
                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {ref.referred?.display_name || ref.referred?.username || "Pending registration"}
                    </p>
                    <p className="text-[10px] text-ccb-muted">
                      {isActive ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-ccb-success" />
                          {ref.activation_action ? ACTIVATION_LABELS[ref.activation_action] || "Activated" : "Activated"}
                          {ref.reward_paid && " · MK 500 paid"}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-ccb-muted" />
                          Pending activation
                        </span>
                      )}
                    </p>
                  </div>
                  {/* Status badge */}
                  {isActive ? (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-ccb-success/10 text-ccb-success shrink-0">
                      MK {REWARD_AMOUNT.toLocaleString()}
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
          <p className="text-lg font-bold mt-0.5">MK {Math.floor(walletBalance).toLocaleString()}</p>
        </div>
        <a href="/wallet" className="text-xs font-bold text-ccb-primary hover:underline flex items-center gap-1">
          View Wallet <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
