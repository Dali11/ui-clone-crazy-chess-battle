"use client";

// Membership purchase page — available in every country:
//   MW  → PayChangu rails (phone + operator → PIN prompt)
//   Intl→ PawaPay rails (provider dropdown + saved deposit phone → PIN prompt)
// On payment success the verify/webhook handlers extend profiles.membership_until.
//
// Backend: POST /api/membership/purchase, GET /api/membership/status.

import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Check, CheckCircle2, Crown, GraduationCap, Heart, LifeBuoy, Loader2, Zap } from "lucide-react";
import { detectOperator } from "@/lib/operator";

interface Status {
  member: boolean;
  until: string | null;
  daysLeft: number;
  enabled: boolean;
  country: string | null;
  currency: "USD";
  priceUsd: number;
  /** Live-rate MWK price the PayChangu rails will charge (MW only). */
  priceMwk: number | null;
  /** Live-rate local-currency price the PawaPay rails will charge (intl). */
  priceLocal: number | null;
  localCurrency: string | null;
  periodDays: number;
  available: boolean;
}

interface PawaPayProvider {
  provider: string;
  displayName: string;
}

const fmtMK = (n: number) => `MK${n.toLocaleString("en-MW")}`;

export default function MembershipClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [pawapayPhone, setPawapayPhone] = useState("");
  const [providers, setProviders] = useState<PawaPayProvider[]>([]);
  const [provider, setProvider] = useState("");
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

  const isMalawi = !status?.country || status.country === "MW";

  // Load PawaPay providers for international players
  useEffect(() => {
    if (isMalawi || !status?.country) return;
    let cancelled = false;
    fetch(`/api/payments/pawapay/active-conf?country=${status.country}&operationType=DEPOSIT`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.countries?.length) return;
        const provs = data.countries[0].providers || [];
        setProviders(provs);
        if (provs.length > 0) setProvider(provs[0].provider);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isMalawi, status?.country]);

  const operator = phone.replace(/\D/g, "").length >= 2
    ? (detectOperator(phone).includes("27494cb5") ? "TNM Mpamba" : "Airtel Money")
    : null;

  const stopPoll = () => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setPolling(false);
  };

  const startPolling = (chargeId: string) => {
    setSubmitting(false);
    setPolling(true);
    setSuccess("Check your phone — approve the payment with your mobile money PIN.");
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
    setTimeout(stopPoll, 120_000);
  };

  const buy = async () => {
    setError(null); setSuccess(null); setSubmitting(true);
    try {
      const isMW = !!status && (status.country === "MW" || !status.country);
      const digits = (isMW ? phone : pawapayPhone).replace(/\D/g, "");
      if (digits.length < 8) {
        setError("Enter your mobile money number.");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/membership/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isMW
            ? { phone, operatorRefId: detectOperator(phone) }
            : { phoneNumber: digits, provider }
        ),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Couldn't start the payment. Try again.");
        setSubmitting(false);
        return;
      }
      startPolling(data.chargeId);
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
  const priceLocal = status?.priceLocal ?? null;
  const localCurrency = status?.localCurrency ?? null;
  const period = status?.periodDays || 30;
  const fmtUsd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

  const perks = [
    { icon: Zap, title: "1.5x league XP", line: "Earn league XP half again as fast." },
    { icon: Ban, title: "Zero ads", line: "No banners anywhere, for your whole membership." },
    { icon: GraduationCap, title: "Full Chess Academy", line: "Every lesson, unlocked." },
    { icon: LifeBuoy, title: "Priority support", line: "Your tickets jump the queue." },
    { icon: Heart, title: "Support the Crazy Chess project", line: "Keeps the leagues, tournaments and community running." },
  ];

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
          {fmtUsd(price)} a month. Zero ads. 1.5x XP. Full Academy.
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
            Buying again stacks the extra {period} days on top — you never lose a day.
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
              {priceLocal && localCurrency ? <> · charged as <span className="font-semibold text-ccb-foreground">{priceLocal.toLocaleString()} {localCurrency}</span></> : null}
            </p>
          </div>

          <ul className="space-y-3.5 mb-6">
            {perks.map((p) => (
              <li key={p.title} className="flex items-center gap-3">
                <p.icon className="w-5 h-5 text-ccb-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{p.title}</p>
                  <p className="text-xs text-ccb-muted">{p.line}</p>
                </div>
              </li>
            ))}
          </ul>

          {status && !status.enabled ? (
            <div className="rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 p-4 text-center">
              <p className="text-sm font-semibold">Memberships are paused for a moment</p>
              <p className="text-xs text-ccb-muted mt-1">Check back soon.</p>
            </div>
          ) : isMalawi ? (
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
            </>
          ) : (
            <>
              <label className="block text-sm font-medium mb-2">Mobile money provider</label>
              {providers.length === 0 ? (
                <p className="text-xs text-ccb-muted">Loading providers…</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {providers.map((p) => (
                    <button
                      key={p.provider}
                      type="button"
                      onClick={() => setProvider(p.provider)}
                      disabled={submitting || polling}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                        provider === p.provider
                          ? "border-ccb-primary bg-ccb-primary/10 text-ccb-primary"
                          : "border-ccb-border bg-background text-ccb-muted"
                      }`}
                    >
                      {p.displayName}
                    </button>
                  ))}
                </div>
              )}

              <label className="block text-sm font-medium mb-2 mt-4">Mobile money number</label>
              <input
                inputMode="tel"
                placeholder="One of your saved deposit numbers"
                value={pawapayPhone}
                onChange={(e) => { setPawapayPhone(e.target.value); setError(null); }}
                disabled={submitting || polling || providers.length === 0}
                className="w-full rounded-xl border border-ccb-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ccb-primary/40 disabled:opacity-60"
              />
              <p className="text-xs text-ccb-muted mt-1.5">
                Use a phone number you saved in Settings → Deposit numbers.
              </p>
            </>
          )}

          {status?.enabled && (
            <button
              onClick={buy}
              disabled={submitting || polling || (!isMalawi && (!provider || pawapayPhone.replace(/\D/g, "").length < 8)) || (isMalawi && phone.replace(/\D/g, "").length < 9)}
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
          )}
          <p className="text-xs text-ccb-muted text-center mt-3">
            You'll get a payment prompt on your phone — approve it with your mobile money PIN.
          </p>
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
