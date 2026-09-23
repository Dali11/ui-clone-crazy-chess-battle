"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Swords, Loader2, Wallet, Smartphone, Check, AlertCircle, Clock, Lock } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { detectOperator } from "@/lib/operator";
import { detectPawaPayCorrespondent } from "@/lib/payments/pawapay-operators";
import { useCurrency } from "@/hooks/use-currency";

// Currency handled by useCurrency hook inside the component.

const TIME_CONTROL_LABELS: Record<string, string> = {
  bullet: "Bullet · 1+0",
  blitz3: "Blitz · 3+2",
  blitz: "Blitz · 5+0",
  rapid: "Rapid · 10+0",
  rapid15: "Rapid · 15+10",
  classical: "Classical · 30+0",
};

interface PawaPayProvider {
  provider: string;
  displayName: string;
  logo: string;
}

interface Props {
  challengeId: string;
  challengerName: string;
  challengerRating: number;
  stake: number;
  timeControl: string;
  feePct: number;
  initialBalance: number;
  email: string;
  phone: string;
  /** Player's own ISO 3166-1 alpha-2 country — drives currency + payment method */
  country?: string | null;
  /** Player's saved deposit numbers (Settings) — deposits can only use one of these */
  depositPhones?: string[];
}

export default function BattleChallengeAccept({
  challengeId,
  challengerName,
  challengerRating,
  stake,
  timeControl,
  feePct,
  initialBalance,
  email,
  phone: savedPhone,
  country,
  depositPhones = [],
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [balance, setBalance] = useState(initialBalance);
  const [loading, setLoading] = useState(false);
  // Seed with the SSR-known country (like the wallet page does) so there's
  // no flash of MWK/MK for non-Malawi players while /api/currency resolves.
  const {
    formatMoney: fmtCurrency,
    formatRewardMoney: fmtFee,
    formatWallet,
    convert,
    currencySymbol: _sym,
    currencyCode,
    rate: fxRate,
    loaded: fxLoaded,
  } = useCurrency(country);
  const [error, setError] = useState<string | null>(null);

  const isMalawi = !country || country === "MW";
  const usePawaPay = !isMalawi; // same rule as the wallet/deposit page

  // stake is MWK (platform price); balance is the player's own currency.
  // convert() and shortfall below are already in the player's LOCAL
  // currency — never re-run them through fmtCurrency()/formatMoney()
  // (which expects an MWK amount and would convert a second time).
  const shortfall = Math.max(0, convert(stake) - balance);
  const canAfford = shortfall === 0;

  const pot = stake * 2;
  // Owner decision 2026-09-15: mirror the server's calcPayout floor so the
  // preview never shows a fee lower than what's actually charged, and
  // display it with decimals (formatRewardMoney) so a real fee converted
  // to a small local-currency figure never visually rounds away to "0".
  const fee = feePct > 0 ? Math.max(1, Math.round(pot * (feePct / 100))) : 0;
  const payout = pot - fee;

  // Platform-wide deposit minimum/maximum (MWK config), converted to the
  // player's own currency — the same source the wallet page uses so the
  // two flows never disagree about what's depositable.
  const [depositConfig, setDepositConfig] = useState<{ min: number; max: number } | null>(null);
  useEffect(() => {
    fetch("/api/withdrawals/limits")
      .then((res) => res.json())
      .then((data) => {
        if (data.deposit_min_amount) {
          setDepositConfig({ min: data.deposit_min_amount, max: data.deposit_max_amount });
        }
      })
      .catch(() => {});
  }, []);
  const depositMinMwk = depositConfig?.min || 1000;
  const depositMinLocal = isMalawi ? depositMinMwk : (fxLoaded && fxRate && fxRate !== 1 ? convert(depositMinMwk) : depositMinMwk);
  // What the player actually needs to type: enough to cover the stake AND
  // to clear the platform's absolute minimum, whichever is larger.
  const requiredMin = Math.max(shortfall, depositMinLocal || 0);

  // Deposit widget state
  const [depositAmount, setDepositAmount] = useState(Math.max(500, Math.ceil(shortfall)));
  const [depositTouched, setDepositTouched] = useState(false);
  // Once the real FX rate (and deposit config) have loaded, snap an
  // untouched field to the correctly-converted amount. Without this the
  // input keeps whatever pre-conversion number it was seeded with at
  // mount (the same "1000 MWK reads as 1000 ZMW" trap the wallet page
  // was fixed for on 2026-09-17) — worst for players whose shortfall is 0
  // but who still need to clear the platform minimum.
  useEffect(() => {
    if (depositTouched) return;
    if (requiredMin > 0) setDepositAmount(Math.max(1, Math.ceil(requiredMin)));
  }, [fxLoaded, requiredMin, depositTouched]);

  const [phone, setPhone] = useState(depositPhones[0] || savedPhone || "");
  const [depositing, setDepositing] = useState(false);
  const [pendingChargeId, setPendingChargeId] = useState<string | null>(null);
  const [depositMsg, setDepositMsg] = useState<string | null>(null);
  const [depositErr, setDepositErr] = useState<string | null>(null);

  // PawaPay provider state (non-Malawi deposits)
  const [pawapayProviders, setPawapayProviders] = useState<PawaPayProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [pawapayLoading, setPawapayLoading] = useState(false);

  useEffect(() => {
    if (!usePawaPay || !country) return;
    setPawapayLoading(true);
    fetch(`/api/payments/pawapay/active-conf?country=${country}&operationType=DEPOSIT`)
      .then((res) => res.json())
      .then((data) => {
        if (data.countries && data.countries.length > 0) {
          const providers = data.countries[0].providers || [];
          setPawapayProviders(providers);
          if (providers.length > 0) setSelectedProvider(providers[0].provider);
        }
      })
      .catch((e) => console.error("Failed to load PawaPay providers:", e))
      .finally(() => setPawapayLoading(false));
  }, [usePawaPay, country]);

  // Auto-select the provider that matches the chosen deposit number's
  // network, same anti-PAYER_NOT_FOUND guard as the wallet page.
  useEffect(() => {
    if (!usePawaPay || !phone || pawapayProviders.length === 0) return;
    const corr = detectPawaPayCorrespondent(country, phone);
    if (corr && pawapayProviders.some((p) => p.provider === corr)) {
      setSelectedProvider((prev) => (prev === corr ? prev : corr));
    }
  }, [phone, pawapayProviders, country, usePawaPay]);

  const refreshBalance = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_balance, country")
      .eq("id", user.id)
      .single();
    if (profile) { setBalance(profile.wallet_balance ?? 0); }
  }, [supabase]);

  // Poll deposit verification once a mobile money payment is initiated
  useEffect(() => {
    if (!pendingChargeId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chargeId: pendingChargeId }),
        });
        const data = await res.json();

        if (data.status === "success") {
          clearInterval(interval);
          setPendingChargeId(null);
          setDepositMsg("Deposit confirmed! You can now accept the challenge.");
          await refreshBalance();
        } else if (data.status === "failed") {
          clearInterval(interval);
          setPendingChargeId(null);
          setDepositErr("Deposit failed or timed out. Please try again.");
        }
      } catch {}
    }, 4000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (pendingChargeId) {
        setPendingChargeId(null);
        setDepositErr("Deposit verification timed out. If you completed the payment, your balance will update shortly — try refreshing.");
      }
    }, 180000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pendingChargeId, refreshBalance]);

  // ─── PawaPay deposit (everyone outside Malawi) ─────────────────────────
  const handlePawaPayDeposit = async () => {
    if (!selectedProvider) {
      setDepositErr("Select a mobile money provider");
      return;
    }
    const res = await fetch("/api/payments/pawapay/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: depositAmount,
        phoneNumber: phone.replace(/\s/g, ""),
        provider: selectedProvider,
        currency: currencyCode,
        country: country || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Payment failed. Please try again.");
    setPendingChargeId(data.chargeId);
    setDepositMsg("Check your phone to authorize the payment. Waiting for confirmation...");
  };

  // ─── PayChangu deposit (Malawi only) ───────────────────────────────────
  const handlePayChanguDeposit = async () => {
    const res = await fetch("/api/payments/deposit/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: depositAmount,
        phone,
        operatorRefId: detectOperator(phone),
        email,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Payment failed. Please try again.");
    setPendingChargeId(data.chargeId);
    setDepositMsg("Check your phone to authorize the payment. Waiting for confirmation...");
  };

  const handleDeposit = async () => {
    setDepositing(true);
    setDepositErr(null);
    setDepositMsg(null);

    try {
      if (!phone || phone.length < 9) {
        setDepositErr("Enter a valid phone number (e.g., 0991234567)");
        setDepositing(false);
        return;
      }
      if (depositAmount < requiredMin) {
        setDepositErr(`Deposit at least ${formatWallet(Math.ceil(requiredMin))} to cover the stake.`);
        setDepositing(false);
        return;
      }

      if (usePawaPay) {
        await handlePawaPayDeposit();
      } else {
        await handlePayChanguDeposit();
      }
    } catch (err: any) {
      setDepositErr(err.message || "Something went wrong. Please try again.");
    } finally {
      setDepositing(false);
    }
  };

  const handleAccept = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/battles/challenge/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        if (data.insufficientFunds) {
          setBalance(data.balance ?? balance);
        }
        throw new Error(data.error || "Failed to accept challenge");
      }

      // Battle created — now start the actual chess game.
      // Retry once on transient failure before surfacing an error — accept is
      // idempotent so re-calling /start with the same battleId is always safe.
      const tryStart = async () => {
        const startRes = await fetch("/api/battles/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ battleId: data.battleId, timeControl }),
        });
        return { ok: startRes.ok, data: await startRes.json() };
      };

      let { ok, data: startData } = await tryStart();
      if (!ok || !startData.gameId) {
        await new Promise((r) => setTimeout(r, 1200));
        ({ ok, data: startData } = await tryStart());
      }
      if (!ok || !startData.gameId) {
        throw new Error(
          (startData.error || "Failed to start the game") + " Your stake is safely locked — tap Accept Battle to try again."
        );
      }

      router.push(`/game/${startData.gameId}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4 py-8">
      <div className="card max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-ccb-primary/10 flex items-center justify-center">
            <Swords className="w-8 h-8 text-ccb-primary" />
          </div>
          <h1 className="text-xl font-bold">You've Been Challenged to a Battle!</h1>
          <p className="text-sm text-ccb-muted">
            <span className="font-semibold text-foreground">{challengerName}</span> ({challengerRating}) staked{" "}
            <span className="font-semibold text-foreground">{fmtCurrency(stake)}</span> and wants to battle
          </p>
        </div>

        <div className="p-4 rounded-xl bg-ccb-surface border border-ccb-border">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Stake (each)</span>
            <span className="font-semibold text-ccb-text">{fmtCurrency(stake)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Time control</span>
            <span className="font-semibold text-ccb-text">{TIME_CONTROL_LABELS[timeControl] || timeControl}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-ccb-muted">Platform fee ({feePct}%)</span>
            <span className="font-semibold text-red-400">−{fmtFee(fee)}</span>
          </div>
          <div className="flex items-center justify-between text-sm pt-2 border-t border-ccb-border">
            <span className="text-ccb-muted">Winner receives</span>
            <span className="font-bold text-ccb-primary text-lg">{fmtCurrency(payout)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm px-1">
          <span className="text-ccb-muted">Your balance</span>
          <span className={`font-semibold ${canAfford ? "text-ccb-text" : "text-red-400"}`}>{formatWallet(balance)}</span>
        </div>

        {error && (
          <div className="text-sm text-ccb-danger bg-ccb-danger/10 border border-ccb-danger/20 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!canAfford && (
          <div className="space-y-4 p-4 rounded-xl bg-ccb-primary/5 border border-ccb-primary/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="w-4 h-4 text-ccb-primary" />
              {/* shortfall is already in the player's local currency —
                  format it with formatWallet (no re-conversion), never
                  fmtCurrency/formatMoney (which expects raw MWK and would
                  convert it a second time, e.g. turning ZMW 30 into ~ZMW 0). */}
              <span>You need {formatWallet(shortfall)} more to accept</span>
            </div>
            <p className="text-xs text-ccb-muted">Top up now — your balance updates automatically the moment payment confirms.</p>

            <div>
              <label className="text-xs text-ccb-muted mb-1 block">Amount ({currencyCode})</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => {
                  setDepositTouched(true);
                  setDepositAmount(Number(e.target.value));
                }}
                className="input-field w-full"
                min={Math.ceil(requiredMin)}
              />
              <p className="text-xs text-ccb-muted mt-1.5">
                Min deposit: {formatWallet(Math.ceil(depositMinLocal))}
              </p>
            </div>

            <div>
              <label className="text-xs text-ccb-muted mb-1 block">
                {isMalawi ? "Mobile Money Number (Airtel Money or Mpamba)" : "Mobile Money Number"}
              </label>
              {depositPhones.length === 0 ? (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-xs text-yellow-600">
                  <span className="flex items-center gap-1.5 font-medium"><Lock className="w-3.5 h-3.5" /> No deposit number on file</span>
                  <p className="mt-1 text-yellow-600/90">
                    Add a phone number in{" "}
                    <Link href="/settings" className="underline underline-offset-2">Settings</Link>{" "}
                    before you can deposit.
                  </p>
                </div>
              ) : depositPhones.length === 1 ? (
                <div className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border flex items-center justify-between">
                  <span className="font-medium text-sm">{depositPhones[0]}</span>
                  <Link href="/settings" className="text-xs text-ccb-muted underline underline-offset-2">Manage</Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {depositPhones.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPhone(p)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                        phone === p ? "border-ccb-primary bg-ccb-primary/10 text-ccb-text" : "border-ccb-border bg-ccb-surface text-ccb-muted"
                      }`}
                    >
                      <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> {p}</span>
                      {phone === p && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* PawaPay provider selector — everyone outside Malawi */}
            {usePawaPay && (
              <div>
                <label className="text-xs text-ccb-muted mb-1 block">Mobile Money Provider</label>
                {pawapayLoading ? (
                  <div className="flex items-center gap-2 text-xs text-ccb-muted py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading providers...
                  </div>
                ) : pawapayProviders.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {pawapayProviders.map((p) => (
                      <button
                        key={p.provider}
                        onClick={() => setSelectedProvider(p.provider)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors text-xs font-medium ${
                          selectedProvider === p.provider
                            ? "border-ccb-primary bg-ccb-primary/10 text-ccb-text"
                            : "border-ccb-border bg-ccb-surface text-ccb-muted"
                        }`}
                      >
                        {p.logo && <img src={p.logo} alt="" className="w-5 h-5 rounded" />}
                        <span className="truncate">{p.displayName}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ccb-muted py-2">
                    No mobile money providers available for your region yet. We&apos;re working on adding support.
                  </p>
                )}
              </div>
            )}

            {depositMsg && (
              <p className="text-xs text-green-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> {depositMsg}
              </p>
            )}
            {depositErr && <p className="text-xs text-ccb-danger">{depositErr}</p>}

            <button
              onClick={handleDeposit}
              disabled={depositing || !!pendingChargeId || depositPhones.length === 0 || !phone}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {depositing || pendingChargeId ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{pendingChargeId ? "Waiting for confirmation..." : "Processing..."}</span>
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  <span>Deposit {_sym} {depositAmount.toLocaleString()}</span>
                </>
              )}
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => router.push("/battles")} className="btn-secondary flex-1">
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={loading || !canAfford}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Swords className="w-4 h-4" />
                <span>Accept Battle</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
