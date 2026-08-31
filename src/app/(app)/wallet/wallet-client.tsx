"use client";

import { detectOperator } from "@/lib/operator";
import { useCurrency } from "@/hooks/use-currency";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Wallet, Check, Loader2, ArrowDown, ArrowUp, ArrowDownLeft, ArrowUpRight,
  Clock, RefreshCw, History,
} from "lucide-react";

interface Deposit {
  id: string;
  amount: number;
  method: string;
  status: string;
  created_at: string;
  charge_id: string | null;
}

interface Withdrawal {
  id: string;
  amount: number;
  phone: string;
  operator_name: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  fee?: number | null;
  net_amount?: number | null;
}

interface Transaction {
  id: string;
  direction: "in" | "out";
  amount: number;
  status: string;
  description: string;
  created_at: string;
}

interface PawaPayProvider {
  provider: string;
  displayName: string;
  logo: string;
}

interface PawaPayCountryConfig {
  country: string;
  providers: PawaPayProvider[];
}

interface WalletClientProps {
  balance: number;
  email: string;
  deposits: Deposit[];
  phone?: string | null;
  country?: string | null;
}

const QUICK_AMOUNTS_MWK = [500, 1000, 2000, 5000, 10000, 25000];
const QUICK_AMOUNTS_INTL = [100, 500, 1000, 2000, 5000, 10000];

export default function WalletClient({ balance, email, deposits, phone: savedPhone, country }: WalletClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [depositAmount, setDepositAmount] = useState(1000);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [withdrawConfig, setWithdrawConfig] = useState<{ min_amount: number; max_amount: number; daily_limit: number; processing_fee_pct: number } | null>(null);
  const [phone, setPhone] = useState(savedPhone || "");
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingChargeId, setPendingChargeId] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [walletBal, setWalletBal] = useState(balance);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);

  // PawaPay state
  const [pawapayProviders, setPawapayProviders] = useState<PawaPayProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [pawapayLoading, setPawapayLoading] = useState(false);

  // Live currency via shared hook — converts MWK to user's local currency
  const { formatMoney: fmtCurrency, currencySymbol: sym, currencyCode: currencyCode, rate: fxRate } = useCurrency();
  const isMalawi = !country || country === "MW";
  const usePawaPay = !isMalawi;

  const quickAmounts = isMalawi ? QUICK_AMOUNTS_MWK : QUICK_AMOUNTS_INTL;
  const formatAmt = (amount: number) => fmtCurrency(amount || 0);
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // Fetch PawaPay providers for the user's country
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

  // Fetch withdrawal limits
  useEffect(() => {
    fetch("/api/withdrawals/limits")
      .then((res) => res.json())
      .then((data) => {
        if (data.min_amount) {
          setWithdrawConfig(data);
          setWithdrawAmount(data.min_amount);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch withdrawals
  useEffect(() => {
    fetch("/api/withdrawals/list")
      .then((res) => res.json())
      .then((data) => {
        if (data.withdrawals) setWithdrawals(data.withdrawals);
      })
      .catch(() => {});
  }, []);

  // Fetch transaction history
  const fetchTransactions = useCallback(async () => {
    setTxnLoading(true);
    try {
      const res = await fetch("/api/wallet/transactions?limit=50");
      const data = await res.json();
      if (data.transactions) setTransactions(data.transactions);
    } catch {} finally { setTxnLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "history") fetchTransactions();
  }, [tab, fetchTransactions]);

  // Payment verification polling (from redirect)
  useEffect(() => {
    const txRef = searchParams.get("tx_ref");
    if (txRef) {
      setPolling(true);
      const interval = setInterval(async () => {
        try {
          const res = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chargeId: txRef }),
          });
          const data = await res.json();
          if (data.status === "success") {
            setSuccess(`${formatAmt(data.amount ?? 0)} added to your wallet!`);
            setPolling(false);
            clearInterval(interval);
            setWalletBal((prev) => prev + data.amount);
            router.refresh();
          } else if (data.status === "failed") {
            setError("Payment failed. Please try again.");
            setPolling(false);
            clearInterval(interval);
          }
        } catch {}
      }, 3000);

      const timeout = setTimeout(() => { clearInterval(interval); setPolling(false); }, 120000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, [searchParams, router]);

  // Payment verification polling (from mobile money push)
  useEffect(() => {
    if (!pendingChargeId) return;
    setPolling(true);

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chargeId: pendingChargeId }),
        });
        const data = await res.json();

        if (data.status === "success") {
          setSuccess(`${formatAmt(data.amount ?? 0)} added to your wallet!`);
          setPolling(false);
          setPendingChargeId(null);
          clearInterval(interval);
          setWalletBal((prev) => prev + data.amount);
          router.refresh();
        } else if (data.status === "failed") {
          setError("Payment failed or timed out. Please try again.");
          setPolling(false);
          setPendingChargeId(null);
          clearInterval(interval);
        }
      } catch {}
    }, 5000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPolling(false);
      if (pendingChargeId) {
        setError("Payment verification timed out. If you completed the payment, your balance will update shortly.");
        setPendingChargeId(null);
      }
    }, 180000);

    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [pendingChargeId, router]);

  // ─── PawaPay deposit (non-Malawi countries) ───────────────────────────
  const handlePawaPayDeposit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!phone || phone.length < 8) {
        setError("Enter a valid mobile money number");
        setLoading(false);
        return;
      }
      if (!selectedProvider) {
        setError("Select a mobile money provider");
        setLoading(false);
        return;
      }

      // Normalize phone with country code if needed
      let normalizedPhone = phone.replace(/\s/g, "");
      if (!normalizedPhone.startsWith("+") && !normalizedPhone.startsWith("00")) {
        // Don't prepend country code — PawaPay predict-provider handles it
      }

      const res = await fetch("/api/payments/pawapay/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: depositAmount,
          phoneNumber: normalizedPhone,
          provider: selectedProvider,
          currency: currencyCode,
          country: country || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Payment failed. Please try again.");
      }

      setPendingChargeId(data.chargeId);
      setSuccess("Check your phone to authorize the payment. Waiting for confirmation...");
    } catch (err: any) {
      setError(err.message && err.message.length < 200 ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ─── PayChangu deposit (Malawi) ───────────────────────────────────────
  const handlePayChanguDeposit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!phone || phone.length < 9) {
        setError("Enter a valid Mobile Money number (Airtel or Mpamba, e.g., 0991234567)");
        setLoading(false);
        return;
      }

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

      if (!res.ok || data.error) {
        throw new Error(data.error || "Payment failed. Please try again.");
      }

      setPendingChargeId(data.chargeId);
      setSuccess("Check your phone to authorize the payment. Waiting for confirmation...");
    } catch (err: any) {
      setError(err.message && err.message.length < 200 ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = usePawaPay ? handlePawaPayDeposit : handlePayChanguDeposit;

  // ─── Withdraw ─────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    setWithdrawLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!phone || phone.length < 8) {
        setError("Enter a valid mobile money number");
        setWithdrawLoading(false);
        return;
      }
      const minAmt = withdrawConfig ? withdrawConfig.min_amount : 10000;
      const maxAmt = withdrawConfig ? withdrawConfig.max_amount : 500000;
      if (withdrawAmount < minAmt) {
        setError(`Minimum withdrawal is ${formatAmt(minAmt)}`);
        setWithdrawLoading(false);
        return;
      }
      if (withdrawAmount > maxAmt) {
        setError(`Maximum withdrawal is ${formatAmt(maxAmt)}`);
        setWithdrawLoading(false);
        return;
      }
      if (withdrawAmount > walletBal) {
        setError("Insufficient balance");
        setWithdrawLoading(false);
        return;
      }

      const body: Record<string, any> = {
        amount: withdrawAmount,
        phone,
        currency: currencyCode,
        country: country || undefined,
      };

      if (usePawaPay) {
        body.payment_provider = "pawapay";
        body.operatorRefId = selectedProvider;
        body.operatorName = pawapayProviders.find(p => p.provider === selectedProvider)?.displayName || selectedProvider;
      } else {
        const operatorRefId = detectOperator(phone);
        body.operatorRefId = operatorRefId;
        body.operatorName = operatorRefId === "27494cb5-ba9e-437f-a114-4e7a7686bcca" ? "TNM Mpamba" : "Airtel Money";
        body.payment_provider = "paychangu";
      }

      const res = await fetch("/api/withdrawals/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Withdrawal failed. Please try again.");
      }

      setWalletBal((prev) => prev - withdrawAmount);
      if (data.status === "completed" || data.auto) {
        setSuccess(`${formatAmt(withdrawAmount)} withdrawal sent! Fees deducted — check your phone for the amount received.`);
      } else {
        setSuccess(`Withdrawal request for ${formatAmt(withdrawAmount)} submitted. You'll receive it within 30 minutes after admin approval.`);
      }
      router.refresh();

      fetch("/api/withdrawals/list")
        .then((r) => r.json())
        .then((d) => { if (d.withdrawals) setWithdrawals(d.withdrawals); });
    } catch (err: any) {
      setError(err.message && err.message.length < 200 ? err.message : "Something went wrong. Please try again.");
    } finally {
      setWithdrawLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      {/* Balance Card */}
      <div className="card relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-ccb-primary/5 rounded-full -translate-y-16 translate-x-16" />
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-ccb-primary" />
              <span className="text-sm text-ccb-muted">Wallet Balance</span>
            </div>
            <button
              onClick={() => router.refresh()}
              className="text-ccb-muted hover:text-ccb-text transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <p className="text-3xl font-bold">{formatAmt(walletBal)}</p>
          {!isMalawi && (
            <p className="text-xs text-ccb-muted mt-1">Currency: {currencyCode}</p>
          )}
        </div>
      </div>

      {/* Success message */}
      {success && (
        <div className="rounded-lg bg-ccb-success/10 border border-ccb-success/30 text-ccb-success px-4 py-3 text-sm flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-ccb-surface rounded-xl">
        <button
          onClick={() => setTab("deposit")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
            tab === "deposit" ? "bg-ccb-primary text-white" : "text-ccb-muted"
          }`}
        >
          <ArrowDown className="w-4 h-4" />
          Deposit
        </button>
        <button
          onClick={() => setTab("withdraw")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
            tab === "withdraw" ? "bg-ccb-primary text-white" : "text-ccb-muted"
          }`}
        >
          <ArrowUp className="w-4 h-4" />
          Withdraw
        </button>
        <button
          onClick={() => setTab("history")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
            tab === "history" ? "bg-ccb-primary text-white" : "text-ccb-muted"
          }`}
        >
          <History className="w-4 h-4" />
          History
        </button>
      </div>

      {/* DEPOSIT TAB */}
      {tab === "deposit" && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ccb-muted mb-2 block">Amount ({currencyCode})</label>
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(Math.max(100, parseInt(e.target.value) || 0))}
              className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border text-lg font-semibold"
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setDepositAmount(amt)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    depositAmount === amt ? "bg-ccb-primary text-white" : "bg-ccb-surface text-ccb-muted border border-ccb-border"
                  }`}
                >
                  {amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* PawaPay provider selector (non-Malawi) */}
          {usePawaPay && (
            <div>
              <label className="text-sm font-medium text-ccb-muted mb-2 block">Mobile Money Provider</label>
              {pawapayLoading ? (
                <div className="flex items-center gap-2 text-sm text-ccb-muted py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading providers...
                </div>
              ) : pawapayProviders.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {pawapayProviders.map((p) => (
                    <button
                      key={p.provider}
                      onClick={() => setSelectedProvider(p.provider)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors text-sm font-medium ${
                        selectedProvider === p.provider
                          ? "border-ccb-primary bg-ccb-primary/10 text-ccb-text"
                          : "border-ccb-border bg-ccb-surface text-ccb-muted"
                      }`}
                    >
                      {p.logo && <img src={p.logo} alt="" className="w-6 h-6 rounded" />}
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

          <div>
            <label className="text-sm font-medium text-ccb-muted mb-2 block">
              {isMalawi
                ? "Mobile Money Number (Airtel Money or Mpamba)"
                : "Mobile Money Number"}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={isMalawi ? "0991234567" : "e.g. +260971234567"}
              className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border"
            />
          </div>

          <button
            onClick={handleDeposit}
            disabled={loading || polling || (usePawaPay && !selectedProvider)}
            className="w-full py-3.5 rounded-xl bg-ccb-primary text-white font-semibold flex items-center justify-center gap-2 hover:bg-ccb-primary/90 disabled:opacity-50"
          >
            {loading || polling ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {polling ? "Waiting for payment..." : "Processing..."}
              </>
            ) : (
              <>Deposit {formatAmt(depositAmount)}</>
            )}
          </button>
        </div>
      )}

      {/* WITHDRAW TAB */}
      {tab === "withdraw" && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ccb-muted mb-2 block">Amount ({currencyCode})</label>
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(Math.max(withdrawConfig ? withdrawConfig.min_amount : 10000, parseInt(e.target.value) || 0))}
              className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border text-lg font-semibold"
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              {(() => {
                const minW = withdrawConfig ? withdrawConfig.min_amount : 10000;
                const maxW = withdrawConfig ? withdrawConfig.max_amount : 500000;
                const amounts = [minW, minW * 2, minW * 5, Math.min(minW * 10, maxW), Math.min(minW * 20, maxW)];
                const unique = [...new Set(amounts)].filter(a => a <= maxW);
                return unique.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setWithdrawAmount(amt)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      withdrawAmount === amt ? "bg-ccb-primary text-white" : "bg-ccb-surface text-ccb-muted border border-ccb-border"
                    }`}
                  >
                    {amt.toLocaleString()}
                  </button>
                ));
              })()}
            </div>
            <p className="text-xs text-ccb-muted mt-2">
              Available: {formatAmt(walletBal)} · Min: {formatAmt(withdrawConfig ? withdrawConfig.min_amount : 10000)}
            </p>
          </div>

          {/* PawaPay provider selector for withdrawals */}
          {usePawaPay && (
            <div>
              <label className="text-sm font-medium text-ccb-muted mb-2 block">Withdraw To</label>
              {pawapayProviders.length > 0 ? (
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border text-sm"
                >
                  {pawapayProviders.map((p) => (
                    <option key={p.provider} value={p.provider}>{p.displayName}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-ccb-muted">No providers available</p>
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-ccb-muted mb-2 block">
              {isMalawi ? "Mobile Money Number (Airtel Money or Mpamba)" : "Mobile Money Number"}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={isMalawi ? "0991234567" : "e.g. +260971234567"}
              className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border"
            />
          </div>

          {/* Fee breakdown */}
          {(() => {
            const pctFee = withdrawConfig?.processing_fee_pct || 0;
            const processingFee = Math.floor(withdrawAmount * (pctFee / 100));
            const totalFees = processingFee;
            const netAmount = Math.max(0, withdrawAmount - totalFees);
            if (totalFees === 0) return null;
            return (
              <div className="space-y-1.5 p-3.5 rounded-xl bg-ccb-surface border border-ccb-border">
                <div className="flex justify-between text-sm">
                  <span className="text-ccb-muted">Withdrawal amount</span>
                  <span className="font-medium">{formatAmt(withdrawAmount)}</span>
                </div>
                {pctFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-ccb-muted">Processing fee ({pctFee}%)</span>
                    <span className="text-ccb-muted">−{formatAmt(processingFee)}</span>
                  </div>
                )}
                <div className="border-t border-ccb-border pt-1.5 flex justify-between text-sm font-semibold">
                  <span>You receive</span>
                  <span className="text-ccb-primary">{formatAmt(netAmount)}</span>
                </div>
              </div>
            );
          })()}

          <button
            onClick={handleWithdraw}
            disabled={withdrawLoading}
            className="w-full py-3.5 rounded-xl bg-ccb-primary text-white font-semibold flex items-center justify-center gap-2 hover:bg-ccb-primary/90 disabled:opacity-50"
          >
            {withdrawLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>Withdraw {formatAmt(withdrawAmount)}</>
            )}
          </button>

          {withdrawals.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ccb-muted mb-2">Recent Withdrawals</p>
              <div className="space-y-2">
                {withdrawals.slice(0, 5).map((w) => (
                  <div key={w.id} className="flex items-center justify-between p-3 rounded-lg bg-ccb-surface border border-ccb-border">
                    <div>
                      <p className="text-sm font-medium">{formatAmt(w.amount)}</p>
                      {w.fee != null && w.fee > 0 && w.net_amount != null && (
                        <p className="text-xs text-ccb-muted">Fee: {formatAmt(w.fee)} · Net: {formatAmt(w.net_amount)}</p>
                      )}
                      <p className="text-xs text-ccb-muted">{w.operator_name} · {formatDate(w.created_at)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      w.status === "completed" ? "bg-green-500/10 text-green-600" :
                      w.status === "pending" ? "bg-yellow-500/10 text-yellow-600" :
                      w.status === "approved" ? "bg-blue-500/10 text-blue-600" :
                      "bg-red-500/10 text-red-500"
                    }`}>
                      {w.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div className="space-y-3">
          {txnLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-ccb-muted text-sm">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No transactions yet
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn) => {
                const isIn = txn.direction === "in";
                const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
                return (
                  <div key={txn.id} className="flex items-center justify-between p-3 rounded-lg bg-ccb-surface border border-ccb-border">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isIn ? "bg-ccb-success/10 text-ccb-success" : "bg-ccb-danger/10 text-ccb-danger"}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{txn.description}</p>
                        <p className="text-xs text-ccb-muted">{formatDate(txn.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${isIn ? "text-ccb-success" : "text-ccb-danger"}`}>
                        {isIn ? "+" : ""}{formatAmt(txn.amount)}
                      </p>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        txn.status === "success" || txn.status === "completed" || txn.status === "approved" ? "bg-green-500/10 text-green-600" :
                        txn.status === "pending" ? "bg-yellow-500/10 text-yellow-600" :
                        txn.status === "rejected" || txn.status === "failed" ? "bg-red-500/10 text-red-500" :
                        "bg-ccb-surface text-ccb-muted"
                      }`}>
                        {txn.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Also show deposit history from SSR data as fallback */}
          {transactions.length === 0 && deposits.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ccb-muted mb-2">Deposit History</p>
              <div className="space-y-2">
                {deposits.slice(0, 8).map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-ccb-surface border border-ccb-border">
                    <div>
                      <p className="text-sm font-medium">{formatAmt(d.amount)}</p>
                      <p className="text-xs text-ccb-muted">{d.method === "mobile_money" ? "Mobile Money" : d.method === "pawapay" ? "PawaPay" : "Card"} · {formatDate(d.created_at)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      d.status === "success" ? "bg-green-500/10 text-green-600" :
                      d.status === "pending" ? "bg-yellow-500/10 text-yellow-600" :
                      "bg-red-500/10 text-red-500"
                    }`}>
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
