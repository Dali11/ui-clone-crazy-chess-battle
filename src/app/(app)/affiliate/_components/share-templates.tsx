"use client";

import { useState } from "react";
import { Copy, Check, Send } from "lucide-react";

const TEMPLATES = [
  {
    name: "Casual invite",
    text: "Join me on Crazy Chess Battles 🏆 Play chess, compete in leagues & tournaments, and battle for cash!",
  },
  {
    name: "Chess club blast",
    text: "Chess players! 🏁 Crazy Chess Battles lets you play cash battles and enter paid tournaments right from your phone. First games are free — come see the ladder:",
  },
  {
    name: "Friendly nudge",
    text: "You still haven't played a cash battle 😄 Your first one is waiting — join Crazy Chess Battles and let's go:",
  },
];

/** Ready-to-send share messages — copy or open WhatsApp with the template + link. */
export default function ShareTemplates({ referralLink }: { referralLink: string }) {
  const [copied, setCopied] = useState<number | null>(null);

  const copy = (i: number, text: string) => {
    navigator.clipboard.writeText(`${text} ${referralLink}`);
    setCopied(i);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-3">
      {TEMPLATES.map((t, i) => {
        const wa = `https://wa.me/?text=${encodeURIComponent(`${t.text} ${referralLink}`)}`;
        return (
          <div key={t.name} className="bg-ccb-surface/70 border border-ccb-border/70 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">{t.name}</p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => copy(i, t.text)}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-ccb-card border border-ccb-border flex items-center gap-1.5 active:scale-95 transition-transform"
                >
                  {copied === i ? <Check className="w-3.5 h-3.5 text-ccb-success" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === i ? "Copied" : "Copy"}
                </button>
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#25D366]/15 border border-[#25D366]/40 text-[#25D366] flex items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <Send className="w-3.5 h-3.5" /> Send
                </a>
              </div>
            </div>
            <p className="text-xs text-ccb-muted leading-relaxed">
              {t.text} <span className="font-mono text-[10px] text-ccb-primary break-all">{referralLink}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
