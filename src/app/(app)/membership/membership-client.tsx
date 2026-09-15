"use client";

// Membership purchase page. Members see an active-until card; everyone else
// gets the MK10,000/month buy card riding the same PayChangu mobile-money
// rails as wallet deposits (phone + auto-detected operator → PIN prompt on
// their phone → poll /api/payments/verify until settled).
//
// Backend: POST /api/membership/purchase, GET /api/membership/status.
// On payment success the deposit handler extends profiles.membership_until
// (the cash is platform revenue, swept weekly to the owner).

import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Check, CheckCircle2, Crown, Loader2, ShieldCheck, Zap } from "lucide-react";
import { detectOperator } from "@/lib/operator";

interface Status {
  member: boolean;
  until: string | null;
  daysLeft: number;
  enabled: boolean;
  currency: "USD";
  priceUsd: number;
  /** Live-rate MWK equivalent the mobile-money rails will charge (MW only). */
  priceMwk: number | null;
  periodDays: number;
  available: boolean;
}

const fmtMK = (n: number) => `MK${n.toLocaleString("en-MW")}`;

export default function MembershipClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/membership/status", { cache: "no-store" });
      const d = await r.json();
      setStatus(d);
    } catch {
      setError("Couldn't load membership status. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [fetchStatus]);

  const operator = phone.replace(/\D/g, "").length >= 2
    ? (detectOperator(phone).includes("27494cb5") ? "TNM Mpamba" : "Airtel Money")
    : null;

  const stopPoll = () => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setPolling(false);
  };

  const buy = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setError("Enter your mobile money number (e.g. 0999 123 456).");
      return;
    }
    setError(null); setSuccess(null); setSubmitting(true);
    try {
      const res = await fetch("/api/membership/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, operatorRefId: detectOperator(phone) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't start the payment. Try again.");
        setSubmitting(false);
        return;
      }

      // PIN prompt is on the player's phone — poll until the charge settles.
      setSubmitting(false);
      setPolling(true);
      setSuccess("Check your phone — approve the payment with your mobile money PIN.");
      const chargeId: string = data.chargeId;

      pollTimer.current = setInterval(async () => {
        try {
          const r = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chargeId }),
          });
          const d = await r.json();
          if (d.status === "success" && d.membership) {
            stopPoll();
            setSuccess(`Membership active! ${d.until ? `Until ${new Date(d.until).toLocaleDateString()}` : ""}`);
            fetchStatus();
          } else if (d.status === "failed") {
            stopPoll();
            setError("The payment didn't go through. Nothing was charged — try again.");
          }
        } catch {}
      }, 3000);

      // Give up after 2 minutes
      setTimeout(stopPoll, 120_000);
    } catch {
      setSubmitting(false);
      setError("Network error. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-ccb-primary" />
      </div>
    );
  }

  const price = status?.priceUsd || 10;
  const priceMwk = status?.priceMwk ?? null;
  const period = status?.periodDays || 30;
  const fmtUsd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-ccb-primary/30 bg-ccb-primary/10 px-4 py-1.5 mb-4">
          <Crown className="w-4 h-4 text-ccb-primary" />
          <span className="text-xs sm:text-sm text-ccb-primary font-semibold">Crazy Chess Battles Club</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold mb-2">Membership</h1>
        <p className="text-sm text-ccb-muted">
          $10 a month. Zero ads. 1.5x league XP. Every cent keeps the leagues, tournaments and community running.
        </p>
      </div>

      {/* Active member card */}
      {status?.member && status.until ? (
        <div className="rounded-2xl border border-ccb-success/30 bg-ccb-success/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-8 h-8 text-ccb-success shrink-0" />
            <div>
              <h2 className="font-bold text-ccb-success">You're a member</h2>
              <p className="text-xs text-ccb-muted">Thanks for keeping Crazy Chess Battles running ♟️</p>
            </div>
          </div>
          <div className="rounded-xl bg-card border border-ccb-border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ccb-muted">Active until</span>
              <span className="font-semibold">{new Date(status.until).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ccb-muted">Days remaining</span>
              <span className="font-semibold">{status.daysLeft}</span>
            </div>
          </div>
          <p className="text-xs text-ccb-muted mt-4">
            Renew anytime — buying again stacks the extra {period} days on top of your current expiry, so you never lose a day.
          </p>
        </div>
      ) : (
        /* Buy card */
        <div className="rounded-2xl border border-ccb-border bg-card p-6">
          <div className="text-center mb-6">
            <p className="text-3xl font-bold">{fmtUsd(price)}</p>
            <p className="text-sm text-ccb-muted">
              every {period} days · mobile money
              {priceMwk ? <> · charged as <span className="font-semibold text-ccb-foreground">{fmtMK(priceMwk)}</span></> : null}
            </p>
          </div>

          <ul className="space-y-3 mb-6">
            <li className="flex items-start gap-3">
              <Ban className="w-5 h-5 text-ccb-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Zero ads, everywhere</p>
                <p className="text-xs text-ccb-muted">No banners between your games, on any page, for your whole membership.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-ccb-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">1.5x league XP, always on</p>
                <p className="text-xs text-ccb-muted">Earn league XP half again as fast for as long as your membership runs — climb the weekly tables sooner.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-ccb-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">You power the club</p>
                <p className="text-xs text-ccb-muted">Your membership funds the weekly XP leagues, tournaments and community events for every player.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Crown className="w-5 h-5 text-ccb-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">First look at new perks</p>
                <p className="text-xs text-ccb-muted">Member-only features land in your account first as the Club grows.</p>
              </div>
            </li>
          </ul>

          {status && !status.available ? (
            <div className="rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 p-4 text-center">
              <p className="text-sm font-semibold">Coming soon to your country</p>
              <p className="text-xs text-ccb-muted mt-1">Membership launches on Malawi mobile money first. We'll announce in the community chat when your country is live.</p>
            </div>
          ) : status && !status.enabled ? (
            <div className="rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 p-4 text-center">
              <p className="text-sm font-semibold">Memberships are paused for a moment</p>
              <p className="text-xs text-ccb-muted mt-1">Check back soon — we'll post in the community chat the moment purchases reopen.</p>
            </div>
          ) : (
            <>
              <label className="block text-sm font-medium mb-2">Mobile money number</label>
              <input
                inputMode="tel"
                placeholder="0999 123 456"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(null); }}
                disabled={submitting || polling}
                className="w-full rounded-xl border border-ccb-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ccb-primary/40 disabled:opacity-60"
              />
              {operator && (
                <p className="text-xs text-ccb-muted mt-1.5 flex items-center gap-1">
                  <Check className="w-3 h-3 text-ccb-success" /> Detected {operator}
                </p>
              )}

              <button
                onClick={buy}
                disabled={submitting || polling || phone.replace(/\D/g, "").length < 9}
                className="btn-primary w-full mt-4 inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
                ) : polling ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for your PIN…</>
                ) : (
                  <><Crown className="w-4 h-4" /> Join the Club — {fmtUsd(price)}</>
                )}
              </button>
              <p className="text-xs text-ccb-muted text-center mt-3">
                You'll get a payment prompt on your phone — approve it with your mobile money PIN.
              </p>
            </>
          )}
        </div>
      )}

      {/* Status banners */}
      {error && (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}
      {success && !error && (
        <div className="mt-4 rounded-xl border border-ccb-success/30 bg-ccb-success/10 p-4 text-sm text-ccb-success">{success}</div>
      )}
    </div>
  );
}
