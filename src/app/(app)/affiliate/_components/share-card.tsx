"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";

interface ShareCardProps {
  refCode: string;
  referralLink: string;
  /** compact: tighter padding + smaller tip (dashboard embed) */
  compact?: boolean;
}

export default function ShareCard({ referralLink, compact }: ShareCardProps) {
  const [copied, setCopied] = useState(false);

  const shareText =
    "Join me on Crazy Chess Battles — play chess, compete in leagues & tournaments, and battle for cash!";

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Crazy Chess Battles", text: shareText, url: referralLink });
        return;
      } catch {}
    }
    // Desktop fallback: copy the link to the clipboard
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-5 sm:p-7 space-y-4">
      <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">
        Your referral link
      </label>

      <input
        readOnly
        value={referralLink}
        className="w-full bg-ccb-surface border border-ccb-border rounded-xl px-4 py-3.5 text-sm text-ccb-muted truncate font-mono"
        onClick={(e) => (e.target as HTMLInputElement).select()}
        aria-label="Referral link"
      />

      <button
        onClick={handleShare}
        className="w-full h-14 rounded-xl bg-ccb-primary text-white text-base font-bold active:scale-[0.98] transition-transform flex items-center justify-center gap-2.5"
      >
        {copied ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
        {copied ? "Link copied" : "Share link"}
      </button>

      <p className={"text-ccb-muted text-center " + (compact ? "text-[11px]" : "text-xs")}>
        Friends must sign up through your link — their account is linked to you automatically, once.
      </p>
    </div>
  );
}
