"use client";

import { useState } from "react";
import { Copy, Check, Share2, Send, Coins } from "lucide-react";

interface ShareCardProps {
  refCode: string;
  referralLink: string;
  /** compact: tighter padding, no code-only button (dashboard embed) */
  compact?: boolean;
}

export default function ShareCard({ refCode, referralLink, compact }: ShareCardProps) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = (what: "code" | "link") => {
    navigator.clipboard.writeText(what === "code" ? refCode : referralLink);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareText =
    "Join me on Crazy Chess Battles — play chess, compete in leagues & tournaments, and battle for cash!";
  const waShare = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Crazy Chess Battles", text: shareText, url: referralLink });
        return;
      } catch {}
    }
    copy("link");
  };

  return (
    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">
          Your referral link
        </label>
        <span className="text-[10px] font-mono text-ccb-muted hidden sm:inline">{refCode}</span>
      </div>

      <div className="flex gap-2">
        <input
          readOnly
          value={referralLink}
          className="flex-1 min-w-0 bg-ccb-surface border border-ccb-border rounded-xl px-3.5 py-3 text-xs sm:text-sm text-ccb-muted truncate font-mono"
          onClick={(e) => (e.target as HTMLInputElement).select()}
          aria-label="Referral link"
        />
        <button
          onClick={() => copy("link")}
          className="shrink-0 px-4 rounded-xl bg-ccb-primary text-white font-semibold text-sm active:scale-95 transition-transform flex items-center gap-2"
          aria-label="Copy link"
        >
          {copied === "link" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span className="hidden sm:inline">{copied === "link" ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleShare}
          className="flex-1 h-11 rounded-xl bg-ccb-surface border border-ccb-border text-sm font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <Share2 className="w-4 h-4" /> Share link
        </button>
        {!compact && (
          <button
            onClick={() => copy("code")}
            className="flex-1 h-11 rounded-xl bg-ccb-surface border border-ccb-border text-sm font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            {copied === "code" ? <Check className="w-4 h-4 text-ccb-success" /> : <Coins className="w-4 h-4" />}
            {copied === "code" ? "Code copied" : "Copy code only"}
          </button>
        )}
        <a
          href={waShare}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-11 rounded-xl bg-[#25D366]/15 border border-[#25D366]/40 text-[#25D366] text-sm font-bold active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" /> WhatsApp
        </a>
      </div>
      {!compact && (
        <p className="text-[11px] text-ccb-muted">
          Tip: friends must sign up through your link — their account is linked to you automatically, once.
        </p>
      )}
    </div>
  );
}
