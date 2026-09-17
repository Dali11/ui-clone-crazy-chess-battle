"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Ban, Zap, LifeBuoy, Sparkles, Crown, X } from "lucide-react";

/**
 * ClubJoinPopup — a centered modal inviting non-members to join the
 * Crazy Chess Battles Club. Perks: zero ads, priority support, 50% bonus
 * XP rewards, first access to new features & perks.
 *
 * Display rules:
 *  - Only for authenticated non-members (fires only where the (app)
 *    layout renders it; logged-out players won't trip the member check
 *    wrongly because the API returns member:false — we also gate on a
 *    cheap profile ping so anonymous visitors aren't nagged to buy).
 *  - Shows at most once every 3 days per player (localStorage).
 *  - Never on /membership itself (they're already looking at the card).
 *  - Delayed ~8s after load so it never races the tournament popups.
 */

const DISMISS_KEY = "ccb-club-popup-last";
const SHOW_EVERY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

const PERKS = [
  {
    icon: Ban,
    title: "Zero ads, everywhere",
    body: "No banners between games or on any page — for your whole membership.",
  },
  {
    icon: Zap,
    title: "50% bonus XP rewards",
    body: "1.5x league XP, always on — climb the weekly tables sooner.",
  },
  {
    icon: LifeBuoy,
    title: "Priority support",
    body: "Your tickets and questions jump to the front of the queue.",
  },
  {
    icon: Sparkles,
    title: "First look at new features",
    body: "Member-only perks and features land in your account first.",
  },
];

export default function ClubJoinPopup() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [priceLocal, setPriceLocal] = useState<number | null>(null);
  const [localCurrency, setLocalCurrency] = useState<string | null>(null);
  const [priceMwk, setPriceMwk] = useState<number | null>(null);

  useEffect(() => {
    if (pathname?.startsWith("/membership")) return;

    let cancelled = false;

    const run = async () => {
      // Cheap auth + member + config check in one call.
      try {
        const r = await fetch("/api/membership/status");
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled || d.member) return;
        if (d.enabled === false) return; // purchases paused → don't pitch

        // The (app) layout is auth-guarded, so anyone seeing this popup
        // is already logged in — no extra auth ping needed.

        let last = 0;
        try {
          last = Number(localStorage.getItem(DISMISS_KEY) || 0);
        } catch {}
        if (Date.now() - last < SHOW_EVERY_MS) return;

        if (!cancelled) {
          if (typeof d.priceUsd === "number") setPriceUsd(d.priceUsd);
          if (typeof d.priceLocal === "number") setPriceLocal(d.priceLocal);
          if (typeof d.localCurrency === "string") setLocalCurrency(d.localCurrency);
          if (typeof d.priceMwk === "number") setPriceMwk(d.priceMwk);
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
          setVisible(true);
        }
      } catch {}
    };

    const timer = setTimeout(run, 8000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pathname]);

  const dismiss = () => setVisible(false);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Join the Crazy Chess Battles Club"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-ccb-primary/30 bg-ccb-card shadow-2xl px-5 py-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-ccb-muted hover:text-ccb-text p-1 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-ccb-primary/30 bg-ccb-primary/10 px-3.5 py-1.5 mb-3">
            <Crown className="w-4 h-4 text-ccb-primary" />
            <span className="text-xs text-ccb-primary font-semibold">Crazy Chess Battles Club</span>
          </div>
          <h2 className="text-lg font-bold text-ccb-text">Tired of ads?</h2>
          <p className="text-sm text-ccb-muted mt-1">
            Join the Club and play without interruptions.
          </p>
        </div>

        <ul className="mt-5 space-y-3.5">
          {PERKS.map((perk) => {
            const Icon = perk.icon;
            return (
              <li key={perk.title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-ccb-primary/15">
                  <Icon className="w-4 h-4 text-ccb-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ccb-text">{perk.title}</p>
                  <p className="text-xs text-ccb-muted">{perk.body}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <Link
          href="/membership"
          onClick={dismiss}
          className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent hover:opacity-90 text-white text-sm font-bold px-4 py-3 transition-all shadow-lg shadow-ccb-primary/25"
        >
          <Crown className="w-4 h-4" />
          {priceMwk
            ? `Join the Club — MK${priceMwk.toLocaleString()}/month`
            : priceLocal && localCurrency
              ? `Join the Club — ${priceLocal.toLocaleString()} ${localCurrency}/month`
              : priceUsd
                ? `Join the Club — $${priceUsd}/month`
                : "Join the Club"}
        </Link>

        <button
          onClick={dismiss}
          className="mt-2.5 w-full text-center text-xs text-ccb-muted hover:text-ccb-text transition-colors py-1.5"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
