"use client";

// Membership purchase page — available in every country:
//   MW  → PayChangu rails (phone + operator → PIN prompt)
//   Intl→ PawaPay rails (provider dropdown + mobile money number → PIN prompt)
// On payment success the verify/webhook handlers extend profiles.membership_until.
//
// REDESIGN (owner 2026-09-26): full-width two-column layout on desktop
// (benefits left, sticky payment card right; payment first on mobile),
// the NEW XP rules (Club members earn up to 2x XP on every result,
// cash games pay double), and easy global payment — international
// players can save their mobile money number right here (no detour to
// Settings), keeping the PawaPay anti-fraud saved-numbers rule intact.
//
// Backend: POST /api/membership/purchase, GET /api/membership/status,
// GET /api/wallet/deposit-info.

import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Check, CheckCircle2, Crown, GraduationCap, Heart, LifeBuoy, Loader2, Plus, Swords, Zap } from "lucide-react";
import { detectOperator } from "@/lib/operator";
import { createClient } from "@/lib/supabase/client";
import { XP_ALLOCATION } from "@/lib/league-xp";
import { isValidPhoneFormat, dedupePhones, MAX_DEPOSIT_PHONES } from "@/lib/deposit-phones";

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
/** XP display: whole numbers plain, halves keep one decimal (2.5). */
const fmtXp = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** The new XP allocation (owner spec 2026-09-26) as a club-vs-non-club table. */
function XpRatesCard() {
  const rows = [
    { key: "win" as const, label: "Win" },
    { key: "draw" as const, label: "Draw" },
    { key: "loss" as const, label: "Loss" },
  ];
  return (
    <div className="rounded-2xl border border-ccb-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-ccb-primary" />
        <h3 className="text-sm font-semibold">What membership does to your XP</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ccb-muted">
              <th className="text-left font-semibold pb-2 pr-3">Result</th>
              <th className="text-right font-semibold pb-2 px-2">Free game</th>
              <th className="text-right font-semibold pb-2 pl-2">Cash game</th>
            </tr>
          </thead>
          <tbody className="text-ccb-text">
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-ccb-muted/10">
                <td className="py-1.5 pr-3 font-medium">{r.label}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  <span className="font-semibold text-ccb-primary">+{fmtXp(XP_ALLOCATION.free[r.key].club)}</span>
                  <span className="text-ccb-muted"> vs {fmtXp(XP_ALLOCATION.free[r.key].non_club)}</span>
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums">
                  <span className="font-semibold text-ccb-primary">+{fmtXp(XP_ALLOCATION.cash[r.key].club)}</span>
                  <span className="text-ccb-muted"> vs {fmtXp(XP_ALLOCATION.cash[r.key].non_club)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ccb-muted mt-3">
        Club rates in purple — double on nearly every result, and cash games pay double again.
        XP is awarded once per completed game (never for abandoned games); daily earn cap 100 XP.
      </p>
    </div>
  );
}

export default function MembershipClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [pawapayPhone, setPawapayPhone] = useState("");
  const [savedPhones, setSavedPhones] = useState<string[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [addingPhone, setAddingPhone] = useState(false);
  const [addPhoneErr, setAddPhoneErr] = useState<string | null>(null);
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

  // Saved deposit numbers (anti-fraud list every mobile-money charge must
  // use) + international provider list — fetched in parallel.
  useEffect(() => {
    fetch("/api/wallet/deposit-info", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const phones: string[] = Array.isArray(d?.depositPhones) ? d.depositPhones : [];
        setSavedPhones(phones);
        setPawapayPhone((cur) => cur || phones[0] || "");
      })
      .catch(() => {});
  }, []);

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

  // Save a mobile money number to the player's anti-fraud deposit list —
  // same client-side write Settings uses (RLS: own profile only).
  const addPhone = async () => {
    setAddPhoneErr(null);
    const canonical = newPhone.trim();
    if (!isValidPhoneFormat(canonical)) {
      setAddPhoneErr("Enter a valid mobile money number (7–15 digits, e.g. +263 77 123 4567).");
      return;
    }
    const deduped = dedupePhones([...savedPhones, canonical]);
    if (deduped.length > MAX_DEPOSIT_PHONES) {
      setAddPhoneErr(`You can save up to ${MAX_DEPOSIT_PHONES} numbers — remove one in Settings first.`);
      return;
    }
    setAddingPhone(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAddPhoneErr("Please sign in again, then retry."); setAddingPhone(false); return; }
      const next = dedupePhones([...savedPhones, canonical]);
      const { error: upErr } = await supabase
        .from("profiles")
        .update({ deposit_phone_numbers: next })
        .eq("id", user.id);
      if (upErr) { setAddPhoneErr(upErr.message); setAddingPhone(false); return; }
      setSavedPhones(next);
      setPawapayPhone(canonical);
      setNewPhone("");
    } catch {
      setAddPhoneErr("Couldn't save the number. Try again.");
    } finally {
      setAddingPhone(false);
    }
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
            : { phoneNumber: pawapayPhone, provider }
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
  // LOCAL-BY-DEFAULT PRICING: headline what the player's own wallet/mobile
  // money will actually charge — MWK for Malawi, their local currency
  // everywhere else. USD only appears when no FX rate is available yet.
  const fmtLocal = (n: number, cur: string) =>
    `${Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)} ${cur}`;
  const headline = priceMwk != null
    ? fmtMK(priceMwk)
    : priceLocal && localCurrency
      ? fmtLocal(priceLocal, localCurrency)
      : fmtUsd(price);

  const perks = [
    { icon: Zap, title: "Double XP on every game", line: "Club members earn up to 2x XP — free wins +6, cash wins +10." },
    { icon: Swords, title: "Cash battles pay double XP", line: "Staked games earn double XP again: wins +10, draws +5, even losses +2." },
    { icon: Ban, title: "Zero ads", line: "No banners anywhere, for your whole membership." },
    { icon: GraduationCap, title: "Full Chess Academy", line: "Every lesson, unlocked." },
    { icon: LifeBuoy, title: "Priority support", line: "Your tickets jump the queue." },
    { icon: Heart, title: "Support the Crazy Chess project", line: "Keeps the leagues, tournaments and community running." },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-ccb-primary/30 bg-ccb-primary/10 px-4 py-1.5 mb-4">
          <Crown className="w-4 h-4 text-ccb-primary" />
          <span className="text-xs sm:text-sm text-ccb-primary font-semibold">Crazy Chess Battles Club</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold mb-2">Membership</h1>
        <p className="text-sm text-ccb-muted">
          {headline} a month. Zero ads. 2x XP. Full Academy.
        </p>
      </div>

      {/* Active member card */}
      {status?.member && status.until ? (
        <div className="max-w-2xl mx-auto rounded-2xl border border-ccb-success/30 bg-ccb-success/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-8 h-8 text-ccb-success shrink-0" />
            <div>
              <h2 className="font-bold text-ccb-success">You&apos;re a member</h2>
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
        /* Two-column layout: benefits left, sticky payment card right
           (payment card first on mobile — conversion-first). */
        <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">
          {/* Benefits */}
          <div className="order-2 lg:order-1 space-y-4">
            <div className="rounded-2xl border border-ccb-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Everything in the Club</h3>
              <ul className="space-y-3.5">
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
            </div>

            <XpRatesCard />
          </div>

          {/* Payment card */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-20 rounded-2xl border border-ccb-primary/30 bg-card p-6">
            <div className="text-center mb-5">
              <p className="text-3xl font-bold">{headline}</p>
              <p className="text-sm text-ccb-muted">
                every {period} days · mobile money
                {priceMwk == null && !priceLocal ? <> · approx. {fmtUsd(price)} USD</> : null}
              </p>
            </div>

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
                  <p className="text-xs text-ccb-muted">Loading providers for your country…</p>
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
                {savedPhones.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {savedPhones.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setPawapayPhone(p); setError(null); }}
                        disabled={submitting || polling}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                          pawapayPhone === p
                            ? "border-ccb-primary bg-ccb-primary/10 text-ccb-primary"
                            : "border-ccb-border bg-background text-ccb-muted"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  inputMode="tel"
                  placeholder={savedPhones.length > 0 ? "Pick a number above, or add another" : "e.g. +263 77 123 4567"}
                  value={savedPhones.length > 0 ? pawapayPhone : newPhone || pawapayPhone}
                  onChange={(e) => {
                    setError(null); setAddPhoneErr(null);
                    if (savedPhones.length > 0) setPawapayPhone(e.target.value);
                    else { setNewPhone(e.target.value); setPawapayPhone(e.target.value); }
                  }}
                  disabled={submitting || polling || providers.length === 0}
                  className="w-full rounded-xl border border-ccb-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ccb-primary/40 disabled:opacity-60"
                />
                {addPhoneErr && <p className="text-xs text-destructive mt-1.5">{addPhoneErr}</p>}
                <button
                  type="button"
                  onClick={addPhone}
                  disabled={addingPhone || submitting || polling || providers.length === 0}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ccb-primary hover:text-ccb-primary/80 disabled:opacity-60"
                >
                  <Plus className="w-3.5 h-3.5" /> {addingPhone ? "Saving…" : savedPhones.length > 0 ? "Save this number to your list" : "Save my payment number"}
                </button>
                <p className="text-[11px] text-ccb-muted mt-1.5">
                  Your number is saved for faster checkout next time (Settings → Deposit numbers).
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
                  <><Crown className="w-4 h-4" /> Join the Club — {headline}</>
                )}
              </button>
            )}
            <p className="text-xs text-ccb-muted text-center mt-3">
              You&apos;ll get a payment prompt on your phone — approve it with your mobile money PIN.
            </p>
          </div>
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
