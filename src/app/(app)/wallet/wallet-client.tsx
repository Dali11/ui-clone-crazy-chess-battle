"use client";

import { detectOperator } from "@/lib/operator";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Wallet, Check, Loader2, ArrowDown, ArrowUp,
  Clock, Cherry, Gift, RefreshCw, History, TrendingUp, TrendingDown,
} from "lucide-react";
import Link from "next/link";

interface Deposit {
  id: string;
  amount_cents: number;
  method: string;
  status: string;
  created_at: string;
  charge_id: string | null;
}

interface Withdrawal {
  id: string;
  amount_cents: number;
  phone: string;
  operator_name: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

interface Transaction {
  id: string;
  type: string;
  amount_cents: number;
  status: string;
  description: string;
  created_at: string;
}

interface BerryConfig {
  berry_value_cents: number;
  min_redemption: number;
  enabled: boolean;
  berries_per_win: number;
  berries_per_draw: number;
}

interface WalletClientProps {
  balanceCents: number;
  berryBalance: number;
  email: string;
  deposits: Deposit[];
  phone?: string | null;
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 25000];

const TXN_ICONS: Record<string, any> = {
  deposit: ArrowDown,
  withdrawal: ArrowUp,
  battle_payout: TrendingUp,
  battle_stake: TrendingDown,
  berry_redeem: Cherry,
  tournament_entry: TrendingDown,
  tournament_prize: TrendingUp,
};

const TXN_COLORS: Record<string, string> = {
  deposit: "text-ccb-success",
  withdrawal: "text-ccb-accent",
  battle_payout: "text-ccb-success",
  battle_stake: "text-ccb-danger",
  berry_redeem: "text-red-500",
  tournament_entry: "text-ccb-danger",
  tournament_prize: "text-ccb-success",
};

export default function WalletClient({ balanceCents, berryBalance, email, deposits, phone: savedPhone }: WalletClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [depositAmount, setDepositAmount] = useState(1000);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [withdrawConfig, setWithdrawConfig] = useState<{ min_amount_cents: number; max_amount_cents: number; daily_limit_cents: number } | null>(null);
  const [phone, setPhone] = useState(savedPhone || "");
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingChargeId, setPendingChargeId] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState(10000);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [berries, setBerries] = useState(berryBalance);
  const [balance, setBalance] = useState(balanceCents);
  const [berryConfig, setBerryConfig] = useState<BerryConfig>({
    berry_value_cents: 5000,
    min_redemption: 10000,
    enabled: true,
    berries_per_win: 10,
    berries_per_draw: 2,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);

  // Fetch berry config from server
  useEffect(() => {
    fetch("/api/berry/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.berry_value_cents) setBerryConfig(data);
        if (data.min_redemption) setRedeemAmount(data.min_redemption);
      })
      .catch(() => {});
  }, []);

  // Fetch withdrawal limits from platform settings (user-facing endpoint)
  useEffect(() => {
    fetch("/api/withdrawals/limits")
      .then((res) => res.json())
      .then((data) => {
        if (data.min_amount_cents) {
          setWithdrawConfig(data);
          setWithdrawAmount(Math.floor(data.min_amount_cents / 100)); // default to min in MWK
        }
      })
      .catch(() => {});
  }, []);

// Mobile money operator is auto-detected from phone prefix (08x=TNM, 09x=Airtel) — no manual selector needed.

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
    } catch {}
    finally { setTxnLoading(false); }
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
            const amt = Math.floor(data.amount / 100).toLocaleString();
            setSuccess(`MWK ${amt} added to your wallet!`);
            setPolling(false);
            clearInterval(interval);
            setBalance((prev) => prev + data.amount);
            router.refresh();
          } else if (data.status === "failed") {
            setError("Payment failed. Please try again.");
            setPolling(false);
            clearInterval(interval);
          }
        } catch {}
      }, 3000);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        setPolling(false);
      }, 120000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
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
          const amt = Math.floor(data.amount / 100).toLocaleString();
          setSuccess(`MWK ${amt} added to your wallet!`);
          setPolling(false);
          setPendingChargeId(null);
          clearInterval(interval);
          setBalance((prev) => prev + data.amount);
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

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pendingChargeId, router]);

  const handleDeposit = async () => {
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
          amountCents: depositAmount * 100,
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

  const handleWithdraw = async () => {
    setWithdrawLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!phone || phone.length < 9) {
        setError("Enter a valid Mobile Money number");
        setWithdrawLoading(false);
        return;
      }
      const minMWK = withdrawConfig ? Math.floor(withdrawConfig.min_amount_cents / 100) : 10000;
      const maxMWK = withdrawConfig ? Math.floor(withdrawConfig.max_amount_cents / 100) : 500000;
      if (withdrawAmount < minMWK) {
        setError(`Minimum withdrawal is MWK ${minMWK.toLocaleString()}`);
        setWithdrawLoading(false);
        return;
      }
      if (withdrawAmount > maxMWK) {
        setError(`Maximum withdrawal is MWK ${maxMWK.toLocaleString()}`);
        setWithdrawLoading(false);
        return;
      }
      if (withdrawAmount * 100 > balance) {
        setError("Insufficient balance");
        setWithdrawLoading(false);
        return;
      }

      const operatorRefId = detectOperator(phone);
      const opName = operatorRefId === "27494cb5-ba9e-437f-a114-4e7a7686bcca" ? "TNM Mpamba" : "Airtel Money";

      const res = await fetch("/api/withdrawals/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: withdrawAmount * 100,
          phone,
          operatorRefId,
          operatorName: opName,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Withdrawal failed. Please try again.");
      }

      // Optimistically update balance
      setBalance((prev) => prev - withdrawAmount * 100);
      setSuccess(`Withdrawal request for MWK ${withdrawAmount.toLocaleString()} submitted. You'll receive it within 24 hours after admin approval.`);
      router.refresh();

      // Refresh withdrawal list
      fetch("/api/withdrawals/list")
        .then((r) => r.json())
        .then((d) => { if (d.withdrawals) setWithdrawals(d.withdrawals); });
    } catch (err: any) {
      setError(err.message && err.message.length < 200 ? err.message : "Something went wrong. Please try again.");
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleRedeemBerries = async () => {
    setRedeemLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (redeemAmount < berryConfig.min_redemption) {
        setError(`Minimum redemption is ${berryConfig.min_redemption} berries`);
        setRedeemLoading(false);
        return;
      }
      if (redeemAmount > berries) {
        setError(`You only have ${berries} berries`);
        setRedeemLoading(false);
        return;
      }

      const res = await fetch("/api/berry/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ berries: redeemAmount }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Redemption failed");
      }

      setBerries(data.newBerryBalance);
      setBalance((prev) => prev + data.cashCents);
      setSuccess(`Redeemed ${data.berriesRedeemed} berries for ${data.cashFormatted}! Added to your wallet.`);
      router.refresh();
    } catch (err: any) {
      setError(err.message && err.message.length < 200 ? err.message : "Redemption failed");
    } finally {
      setRedeemLoading(false);
    }
  };

  const redeemCashValue = Math.round((redeemAmount / 100) * berryConfig.berry_value_cents);
  const formatMWK = (cents: number) => `MWK ${Math.floor((cents || 0) / 100).toLocaleString()}`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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
          <p className="text-3xl font-bold">{formatMWK(balance)}</p>

          {/* Berry balance */}
          <div className="mt-3 pt-3 border-t border-ccb-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cherry className="w-4 h-4 text-red-500" />
              <span className="text-sm text-ccb-muted">CRAZYCHESSBERRY</span>
            </div>
            <span className="text-sm font-semibold text-red-500">{berries.toLocaleString()} 🍒</span>
          </div>

          {/* Berry redeem section — only shown when user has enough berries */}
          {berryConfig.enabled && berries >= berryConfig.min_redemption ? (
            <div className="mt-3 pt-3 border-t border-red-500/10">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="number"
                  value={redeemAmount}
                  onChange={(e) => setRedeemAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  min={berryConfig.min_redemption}
                  max={berries}
                  step={10}
                  className="flex-1 px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
                  placeholder="Berries to redeem"
                />
                <button
                  onClick={handleRedeemBerries}
                  disabled={redeemLoading || redeemAmount < berryConfig.min_redemption || redeemAmount > berries}
                  className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {redeemLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Redeem
                </button>
              </div>
              <p className="text-xs text-ccb-muted">
                = {formatMWK(redeemCashValue)} to wallet · 1000🍒 = MWK 500
              </p>
            </div>
          ) : berryConfig.enabled ? (
            <div className="text-xs text-ccb-muted mt-2 pt-2 border-t border-red-500/10">
              <p>Win {berryConfig.min_redemption - berries} more CCB 🍒 to unlock cash redemption</p>
            </div>
          ) : null}

          {/* Referral bonus link */}
          <div className="mt-3 pt-3 border-t border-red-500/10">
            <Link
              href="/earn"
              className="flex items-center justify-between text-sm text-ccb-primary font-medium hover:opacity-80"
            >
              <span className="flex items-center gap-1">
                <Gift className="w-3.5 h-3.5" />
                Earn more CCB 🍒
              </span>
              <span>→</span>
            </Link>
          </div>
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
            <label className="text-sm font-medium text-ccb-muted mb-2 block">Amount (MWK)</label>
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(Math.max(100, parseInt(e.target.value) || 0))}
              className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border text-lg font-semibold"
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              {QUICK_AMOUNTS.map((amt) => (
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

          <div>
            <label className="text-sm font-medium text-ccb-muted mb-2 block">Mobile Money Number (Airtel Money or Mpamba)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0991234567"
              className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border"
            />
          </div>

          <button
            onClick={handleDeposit}
            disabled={loading || polling}
            className="w-full py-3.5 rounded-xl bg-ccb-primary text-white font-semibold flex items-center justify-center gap-2 hover:bg-ccb-primary/90 disabled:opacity-50"
          >
            {loading || polling ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {polling ? "Waiting for payment..." : "Processing..."}
              </>
            ) : (
              <>Deposit {formatMWK(depositAmount * 100)}</>
            )}
          </button>
        </div>
      )}

      {/* WITHDRAW TAB */}
      {tab === "withdraw" && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ccb-muted mb-2 block">Amount (MWK)</label>
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(Math.max(withdrawConfig ? Math.floor(withdrawConfig.min_amount_cents / 100) : 10000, parseInt(e.target.value) || 0))}
              className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border text-lg font-semibold"
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              {(() => {
                const minW = withdrawConfig ? Math.floor(withdrawConfig.min_amount_cents / 100) : 10000;
                const maxW = withdrawConfig ? Math.floor(withdrawConfig.max_amount_cents / 100) : 500000;
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
              Available: {formatMWK(balance)} · Min: MWK {(withdrawConfig ? Math.floor(withdrawConfig.min_amount_cents / 100) : 10000).toLocaleString()}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-ccb-muted mb-2 block">Mobile Money Number (Airtel Money or Mpamba)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0991234567"
              className="w-full px-4 py-3 rounded-xl bg-ccb-surface border border-ccb-border"
            />
          </div>

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
              <>Withdraw {formatMWK(withdrawAmount * 100)}</>
            )}
          </button>

          {withdrawals.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ccb-muted mb-2">Recent Withdrawals</p>
              <div className="space-y-2">
                {withdrawals.slice(0, 5).map((w) => (
                  <div key={w.id} className="flex items-center justify-between p-3 rounded-lg bg-ccb-surface border border-ccb-border">
                    <div>
                      <p className="text-sm font-medium">{formatMWK(w.amount_cents)}</p>
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
                const Icon = TXN_ICONS[txn.type] || Clock;
                const color = TXN_COLORS[txn.type] || "text-ccb-muted";
                const isPositive = txn.amount_cents > 0;
                return (
                  <div key={txn.id} className="flex items-center justify-between p-3 rounded-lg bg-ccb-surface border border-ccb-border">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center ${color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{txn.description}</p>
                        <p className="text-xs text-ccb-muted">{formatDate(txn.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${isPositive ? "text-ccb-success" : "text-ccb-danger"}`}>
                        {isPositive ? "+" : ""}{formatMWK(txn.amount_cents)}
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
                      <p className="text-sm font-medium">{formatMWK(d.amount_cents)}</p>
                      <p className="text-xs text-ccb-muted">{d.method === "mobile_money" ? "Mobile Money" : "Card"} · {formatDate(d.created_at)}</p>
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
