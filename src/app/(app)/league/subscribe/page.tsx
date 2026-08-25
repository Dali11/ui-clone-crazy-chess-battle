'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { detectOperator } from '@/lib/operator';
import {
  Crown, Check, Zap, Shield, Star, Trophy, Swords, TrendingUp,
  Sparkles, Calendar, RefreshCw, AlertCircle, ArrowRight, X, Users,
  Smartphone, Phone,
} from 'lucide-react';

interface MembershipConfig {
  country: string;
  currency: string;
  price: number;
  billingCycle: string;
  active: boolean;
  benefits: string[];
}

interface Membership {
  id: string;
  status: string;
  billing_cycle: string;
  price: number;
  currency: string;
  country: string;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  payment_method: string;
}

interface MembershipResponse {
  success: boolean;
  config: MembershipConfig;
  membership: Membership | null;
  history: Membership[];
  hasActiveMembership: boolean;
  error?: string;
}

type PaymentState = 'idle' | 'initiating' | 'pending' | 'verifying' | 'success' | 'failed';

export default function SubscriptionPage() {
  const [data, setData] = useState<MembershipResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Payment form state
  const [phone, setPhone] = useState('');
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const [visitorCurrency, setVisitorCurrency] = useState<string>('MWK');
  const [fxRate, setFxRate] = useState<number>(1);

  const fetchMembership = async () => {
    setLoading(true);
    try {
      const [membershipRes, currencyRes] = await Promise.all([
        fetch('/api/league/membership'),
        fetch('/api/currency'),
      ]);
      const json = await membershipRes.json();
      setData(json);
      // Get visitor's detected currency + exchange rate for display conversion
      try {
        const cur = await currencyRes.json();
        if (cur.currencyCode) setVisitorCurrency(cur.currencyCode);
        if (cur.rate) setFxRate(cur.rate);
      } catch {}
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembership();
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const handleSubscribe = async () => {
    const digits = phone.replace(/\D/g, '');
    if (!digits || digits.length < 9) {
      setPaymentError('Please enter a valid Mobile Money number (Airtel Money or Mpamba)');
      return;
    }

    setPaymentState('initiating');
    setPaymentError(null);

    try {
      const res = await fetch('/api/league/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingCycle,
          phone,
          operatorRefId: detectOperator(phone),
        }),
      });
      const json = await res.json();

      if (!res.ok || json.error) {
        setPaymentState('failed');
        setPaymentError(json.error || 'Failed to initiate payment');
        return;
      }

      setChargeId(json.chargeId);
      setPaymentState('pending');

      // Start polling for payment verification
      pollPaymentStatus(json.chargeId);
    } catch (err: any) {
      setPaymentState('failed');
      setPaymentError(err.message);
    }
  };

  const pollPaymentStatus = async (id: string) => {
    const poll = async () => {
      try {
        const res = await fetch('/api/league/membership/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chargeId: id }),
        });
        const json = await res.json();

        if (json.status === 'success') {
          setPaymentState('success');
          setMessage({ type: 'success', text: json.message || 'Membership activated!' });
          setTimeout(() => {
            setShowPaymentModal(false);
            fetchMembership();
          }, 2000);
          return;
        }

        if (json.status === 'failed') {
          setPaymentState('failed');
          setPaymentError('Payment failed. Please try again.');
          return;
        }

        // Still pending — poll again in 5 seconds
        pollRef.current = setTimeout(poll, 5000);
      } catch {
        pollRef.current = setTimeout(poll, 5000);
      }
    };
    poll();
  };

  const resetPayment = () => {
    setPaymentState('idle');
    setChargeId(null);
    setPaymentError(null);
    if (pollRef.current) clearTimeout(pollRef.current);
  };

  const config = data?.config;
  const membership = data?.membership;
  const hasActive = data?.hasActiveMembership;
  const history = data?.history || [];

  // Convert backend price to visitor's local currency for display
  const baseMonthlyPrice = config?.price || 10000;
  const monthlyPrice = Math.round(baseMonthlyPrice * fxRate);
  const yearlyPrice = monthlyPrice * 10;
  const currencyLabel = fxRate !== 1 ? visitorCurrency : (config?.currency || visitorCurrency);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const daysLeft = membership ? Math.ceil((new Date(membership.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="space-y-6 pb-20 sm:pb-8">

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">

        {/* HERO */}
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ccb-dark via-ccb-surface to-ccb-card border border-ccb-border shadow-2xl p-6 sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-ccb-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-1/3 -bottom-20 w-80 h-80 bg-ccb-accent/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ccb-primary/10 border border-ccb-primary/30 text-ccb-primary text-xs font-semibold tracking-wider uppercase">
              <Crown className="w-3.5 h-3.5" /> CrazyChess Club
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase">
              Unlock <span className="text-ccb-primary">Premium</span> Competitions
            </h1>

            <p className="text-ccb-muted text-sm sm:text-base max-w-2xl mx-auto">
              Join the CrazyChess Club to access premium Premier League competitions, priority tournament entry, and official season rankings. Play. Compete. Climb. Become Champion.
            </p>
          </div>

          {message && (
            <div className={`relative z-10 mt-4 p-3 rounded-xl border text-sm font-medium ${
              message.type === 'success' ? 'bg-ccb-success/10 border-ccb-success/30 text-ccb-success' : 'bg-ccb-danger/10 border-ccb-danger/30 text-ccb-danger'
            }`}>
              {message.type === 'success' ? <Check className="w-4 h-4 inline mr-2" /> : <AlertCircle className="w-4 h-4 inline mr-2" />}
              {message.text}
            </div>
          )}
        </header>

        {/* ACTIVE MEMBERSHIP STATUS */}
        {loading ? (
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-8 animate-pulse h-48" />
        ) : hasActive && membership ? (
          <div className="bg-gradient-to-r from-ccb-primary/10 to-ccb-accent/10 border border-ccb-primary/30 rounded-2xl p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-ccb-primary/20 border border-ccb-primary/30 flex items-center justify-center">
                    <Crown className="w-5 h-5 text-ccb-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-ccb-text">Membership Active</h2>
                    <p className="text-xs text-ccb-muted">{membership.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'} plan</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-ccb-muted">
                  <Calendar className="w-4 h-4" />
                  <span>Expires on {formatDate(membership.end_date)}</span>
                  <span className="text-ccb-success font-semibold">({daysLeft} days left)</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-ccb-primary">{Math.round(membership.price * fxRate).toLocaleString()} {fxRate !== 1 ? visitorCurrency : membership.currency}</div>
                <div className="text-xs text-ccb-muted">per {membership.billing_cycle === 'yearly' ? 'year' : 'month'}</div>
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-ccb-success/10 border border-ccb-success/30 text-ccb-success text-xs font-semibold">
                  <Check className="w-3 h-3" /> Active
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="w-full bg-ccb-surface h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-ccb-primary to-ccb-accent h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, (daysLeft / (membership.billing_cycle === 'yearly' ? 365 : 30)) * 100))}%` }} />
              </div>
            </div>
          </div>
        ) : null}

        {/* PRICING CARDS */}
        {!loading && !hasActive && (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Monthly */}
              <div className={`relative bg-ccb-card border rounded-2xl p-6 sm:p-8 cursor-pointer transition-all ${billingCycle === 'monthly' ? 'border-ccb-primary shadow-xl shadow-ccb-primary/10 scale-[1.02]' : 'border-ccb-border hover:border-ccb-primary/30'}`} onClick={() => setBillingCycle('monthly')}>
                {billingCycle === 'monthly' && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-ccb-primary text-white text-xs font-bold">SELECTED</div>}
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center mx-auto"><Calendar className="w-6 h-6 text-ccb-primary" /></div>
                  <h3 className="text-lg font-bold">Monthly</h3>
                  <div className="text-4xl font-black">{monthlyPrice.toLocaleString()} <span className="text-lg font-normal text-ccb-muted">{currencyLabel}</span></div>
                  <p className="text-xs text-ccb-muted">per month</p>
                  <p className="text-sm text-ccb-muted">Cancel anytime</p>
                </div>
              </div>

              {/* Yearly */}
              <div className={`relative bg-gradient-to-br from-ccb-card to-ccb-surface border rounded-2xl p-6 sm:p-8 cursor-pointer transition-all ${billingCycle === 'yearly' ? 'border-ccb-accent shadow-xl shadow-ccb-accent/10 scale-[1.02]' : 'border-ccb-border hover:border-ccb-accent/30'}`} onClick={() => setBillingCycle('yearly')}>
                {billingCycle === 'yearly' && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-ccb-accent text-white text-xs font-bold">SELECTED</div>}
                <div className="absolute top-4 right-4 px-2 py-1 rounded-full bg-ccb-accent/10 border border-ccb-accent/30 text-ccb-accent text-[10px] font-bold">2 MONTHS FREE</div>
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-ccb-accent/10 border border-ccb-accent/30 flex items-center justify-center mx-auto"><Crown className="w-6 h-6 text-ccb-accent" /></div>
                  <h3 className="text-lg font-bold">Yearly</h3>
                  <div className="text-4xl font-black">{yearlyPrice.toLocaleString()} <span className="text-lg font-normal text-ccb-muted">{currencyLabel}</span></div>
                  <p className="text-xs text-ccb-muted">per year</p>
                  <p className="text-sm text-ccb-success font-medium">Save {(monthlyPrice * 2).toLocaleString()} {currencyLabel}</p>
                </div>
              </div>
            </div>

            {/* Subscribe CTA */}
            <div className="mt-6 text-center">
              <button onClick={() => { resetPayment(); setShowPaymentModal(true); }} className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-ccb-primary/20">
                Subscribe
              </button>
              <p className="text-xs text-ccb-muted mt-3">Pay via TNM Mpamba or Airtel Money</p>
            </div>
          </section>
        )}

        {/* BENEFITS */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Star className="w-5 h-5 text-ccb-accent" /> Membership Benefits</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Trophy, title: 'Premier League', desc: 'Access to premium tiered divisions with promotion and relegation.' },
              { icon: Swords, title: 'Priority Entry', desc: 'Skip the queue for Swiss qualifier tournaments with limited slots.' },
              { icon: TrendingUp, title: 'Official Ranking', desc: 'CrazyChess Club ranking and season points accumulation.' },
              { icon: Sparkles, title: 'Exclusive Events', desc: 'Invitation-only tournaments and special competitions.' },
              { icon: Shield, title: 'Verified Badge', desc: 'Verified player status with identity confirmation.' },
              { icon: Users, title: 'Community', desc: 'Join the elite community of competitive chess players.' },
            ].map((benefit, i) => {
              const Icon = benefit.icon;
              return (
                <div key={i} className="bg-ccb-card border border-ccb-border rounded-xl p-4">
                  <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-ccb-primary" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{benefit.title}</h3>
                  <p className="text-xs text-ccb-muted leading-relaxed">{benefit.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* MEMBERSHIP HISTORY */}
        {history.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-ccb-accent" /> Membership History</h2>
            <div className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
              {history.map((m, i) => (
                <div key={m.id} className={`flex items-center justify-between p-4 ${i < history.length - 1 ? 'border-b border-ccb-border' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${m.status === 'active' ? 'bg-ccb-success/10 text-ccb-success' : m.status === 'expired' ? 'bg-ccb-muted/10 text-ccb-muted' : 'bg-ccb-danger/10 text-ccb-danger'}`}>
                      <Crown className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{m.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'} — {Math.round(m.price * fxRate).toLocaleString()} {fxRate !== 1 ? visitorCurrency : m.currency}</div>
                      <div className="text-xs text-ccb-muted">{formatDate(m.start_date)} → {formatDate(m.end_date)}</div>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${m.status === 'active' ? 'bg-ccb-success/10 text-ccb-success border border-ccb-success/30' : m.status === 'expired' ? 'bg-ccb-muted/10 text-ccb-muted border border-ccb-muted/30' : 'bg-ccb-danger/10 text-ccb-danger border border-ccb-danger/30'}`}>{m.status.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><AlertCircle className="w-5 h-5 text-ccb-accent" /> Questions</h2>
          <div className="space-y-3">
            {[
              { q: 'Can I still play for free without a membership?', a: 'Absolutely. Free competitions, casual games, and free Swiss qualifiers are available to all players. Membership unlocks premium divisions and exclusive events.' },
              { q: 'How do I pay for my membership?', a: 'Payment is via TNM Mpamba or Airtel Money — the same mobile money options used for tournament entries and wallet deposits.' },
              { q: 'Can I cancel my membership?', a: 'Yes. Your membership stays active until the end of your billing period. After that, it will not auto-renew unless you choose to extend.' },
              { q: 'What happens if my membership expires?', a: 'You get a 10-day grace period to renew. After that, you lose your spot in any premium leagues and remaining fixtures are forfeited. Your season points and rankings are preserved.' },
            ].map((faq, i) => (
              <div key={i} className="bg-ccb-card border border-ccb-border rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-1">{faq.q}</h3>
                <p className="text-xs text-ccb-muted leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="text-center pt-4 pb-4">
          <Link href="/league" className="inline-flex items-center gap-2 text-sm text-ccb-muted hover:text-ccb-text transition-colors">
            <ArrowRight className="w-4 h-4 rotate-180" /> Back to Competitions
          </Link>
        </div>
      </div>

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { if (paymentState !== 'pending' && paymentState !== 'initiating' && paymentState !== 'verifying') { setShowPaymentModal(false); resetPayment(); } }}>
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Crown className="w-5 h-5 text-ccb-primary" /> Subscribe to CrazyChess Club</h3>
              {paymentState !== 'pending' && paymentState !== 'initiating' && paymentState !== 'verifying' && (
                <button onClick={() => { setShowPaymentModal(false); resetPayment(); }} className="p-2 rounded-lg hover:bg-ccb-surface transition-colors"><X className="w-5 h-5" /></button>
              )}
            </div>

            {/* Plan Summary */}
            <div className="bg-ccb-surface rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-ccb-muted">Plan</span><span className="font-semibold">{billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}</span></div>
              <div className="flex justify-between text-sm"><span className="text-ccb-muted">Amount</span><span className="font-bold text-ccb-primary">{(billingCycle === 'yearly' ? yearlyPrice : monthlyPrice).toLocaleString()} {currencyLabel}</span></div>
              <div className="flex justify-between text-sm"><span className="text-ccb-muted">Duration</span><span className="font-semibold">{billingCycle === 'yearly' ? '12 months' : '1 month'}</span></div>
            </div>

            {/* Payment States */}
            {paymentState === 'idle' && (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-ccb-muted uppercase tracking-wider mb-2 block">Mobile Money Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ccb-muted" />
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0991 234 567" className="w-full pl-10 pr-4 py-3 rounded-xl border border-ccb-border bg-ccb-surface text-sm focus:border-ccb-primary focus:outline-none" />
                    </div>
                    <p className="text-[11px] text-ccb-muted mt-1.5 flex items-center gap-1">
                      <Smartphone className="w-3 h-3" /> Airtel Money (09xx) or TNM Mpamba (08xx) — detected automatically
                    </p>
                  </div>
                </div>

                {paymentError && <div className="p-3 rounded-xl border border-ccb-danger/30 bg-ccb-danger/10 text-ccb-danger text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {paymentError}</div>}

                <button onClick={handleSubscribe} className="w-full py-3 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-ccb-primary/20 flex items-center justify-center gap-2">
                  Subscribe
                </button>
                <p className="text-[10px] text-ccb-muted text-center">You will receive a mobile money prompt on your phone to authorize the payment.</p>
              </>
            )}

            {paymentState === 'initiating' && (
              <div className="text-center py-8 space-y-3">
                <RefreshCw className="w-8 h-8 text-ccb-accent animate-spin mx-auto" />
                <p className="text-sm text-ccb-muted">Initiating payment...</p>
              </div>
            )}

            {paymentState === 'pending' && (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-ccb-accent/10 border border-ccb-accent/30 flex items-center justify-center mx-auto">
                  <Smartphone className="w-8 h-8 text-ccb-accent animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Check your phone</p>
                  <p className="text-xs text-ccb-muted">A payment prompt has been sent to {phone}. Enter your PIN to authorize.</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-ccb-muted">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Waiting for confirmation...
                </div>
              </div>
            )}

            {paymentState === 'success' && (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-ccb-success/10 border border-ccb-success/30 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-ccb-success" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-bold text-ccb-success">Payment Successful!</p>
                  <p className="text-xs text-ccb-muted">Your CrazyChess Club membership is now active.</p>
                </div>
              </div>
            )}

            {paymentState === 'failed' && (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-ccb-danger/10 border border-ccb-danger/30 flex items-center justify-center mx-auto">
                  <X className="w-8 h-8 text-ccb-danger" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-bold text-ccb-danger">Payment Failed</p>
                  <p className="text-xs text-ccb-muted">{paymentError || 'The payment could not be processed. Please try again.'}</p>
                </div>
                <button onClick={() => { resetPayment(); setPaymentState('idle'); }} className="px-6 py-2.5 rounded-xl border border-ccb-border bg-ccb-surface text-ccb-text font-medium text-sm hover:bg-ccb-card transition-all">Try Again</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
