'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Crown, Check, Zap, Shield, Star, Trophy, Swords, TrendingUp,
  Sparkles, Calendar, RefreshCw, AlertCircle, ArrowRight, X, Users,
} from 'lucide-react';
import LeagueNav from '@/components/league/league-nav';

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

export default function SubscriptionPage() {
  const [data, setData] = useState<MembershipResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const fetchMembership = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/league/membership');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembership();
  }, []);

  const handleSubscribe = async () => {
    setSubscribing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/league/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingCycle,
          paymentMethod: 'mobile_money',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: json.message });
        setShowPaymentModal(false);
        fetchMembership();
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to subscribe' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubscribing(false);
    }
  };

  const config = data?.config;
  const membership = data?.membership;
  const hasActive = data?.hasActiveMembership;
  const history = data?.history || [];

  const monthlyPrice = config?.price || 5000;
  const yearlyPrice = monthlyPrice * 10; // 2 months free
  const currencyLabel = config?.currency || 'MWK';

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const daysLeft = membership ? Math.ceil((new Date(membership.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      <LeagueNav />

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

          {/* Message toast */}
          {message && (
            <div className={`relative z-10 mt-4 p-3 rounded-xl border text-sm font-medium ${
              message.type === 'success'
                ? 'bg-ccb-success/10 border-ccb-success/30 text-ccb-success'
                : 'bg-ccb-danger/10 border-ccb-danger/30 text-ccb-danger'
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
                    <p className="text-xs text-ccb-muted">
                      {membership.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'} plan
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-ccb-muted">
                  <Calendar className="w-4 h-4" />
                  <span>Expires on {formatDate(membership.end_date)}</span>
                  <span className="text-ccb-success font-semibold">({daysLeft} days left)</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-black text-ccb-primary">
                  {membership.price.toLocaleString()} {membership.currency}
                </div>
                <div className="text-xs text-ccb-muted">per {membership.billing_cycle === 'yearly' ? 'year' : 'month'}</div>
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-ccb-success/10 border border-ccb-success/30 text-ccb-success text-xs font-semibold">
                  <Check className="w-3 h-3" /> Active
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="w-full bg-ccb-surface h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-ccb-primary to-ccb-accent h-full rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, (daysLeft / (membership.billing_cycle === 'yearly' ? 365 : 30)) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* PRICING CARDS */}
        {!loading && !hasActive && (
          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Monthly */}
              <div
                className={`relative bg-ccb-card border rounded-2xl p-6 sm:p-8 cursor-pointer transition-all ${
                  billingCycle === 'monthly'
                    ? 'border-ccb-primary shadow-xl shadow-ccb-primary/10 scale-[1.02]'
                    : 'border-ccb-border hover:border-ccb-primary/30'
                }`}
                onClick={() => setBillingCycle('monthly')}
              >
                {billingCycle === 'monthly' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-ccb-primary text-white text-xs font-bold">
                    SELECTED
                  </div>
                )}
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-ccb-primary/10 border border-ccb-primary/30 flex items-center justify-center mx-auto">
                    <Calendar className="w-6 h-6 text-ccb-primary" />
                  </div>
                  <h3 className="text-lg font-bold">Monthly</h3>
                  <div className="text-4xl font-black">
                    {monthlyPrice.toLocaleString()} <span className="text-lg font-normal text-ccb-muted">{currencyLabel}</span>
                  </div>
                  <p className="text-xs text-ccb-muted">per month</p>
                  <p className="text-sm text-ccb-muted">Cancel anytime</p>
                </div>
              </div>

              {/* Yearly */}
              <div
                className={`relative bg-gradient-to-br from-ccb-card to-ccb-surface border rounded-2xl p-6 sm:p-8 cursor-pointer transition-all ${
                  billingCycle === 'yearly'
                    ? 'border-ccb-accent shadow-xl shadow-ccb-accent/10 scale-[1.02]'
                    : 'border-ccb-border hover:border-ccb-accent/30'
                }`}
                onClick={() => setBillingCycle('yearly')}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-ccb-accent text-ccb-dark text-xs font-bold">
                  BEST VALUE
                </div>
                {billingCycle === 'yearly' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-ccb-accent text-ccb-dark text-xs font-bold" style={{ marginTop: '-2px' }}>
                    SELECTED
                  </div>
                )}
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-ccb-accent/10 border border-ccb-accent/30 flex items-center justify-center mx-auto">
                    <Sparkles className="w-6 h-6 text-ccb-accent" />
                  </div>
                  <h3 className="text-lg font-bold">Yearly</h3>
                  <div className="text-4xl font-black">
                    {yearlyPrice.toLocaleString()} <span className="text-lg font-normal text-ccb-muted">{currencyLabel}</span>
                  </div>
                  <p className="text-xs text-ccb-muted">per year (2 months free!)</p>
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-ccb-success/10 border border-ccb-success/30 text-ccb-success text-xs font-semibold">
                    Save {(monthlyPrice * 2).toLocaleString()} {currencyLabel}
                  </div>
                </div>
              </div>
            </div>

            {/* Subscribe CTA */}
            <div className="mt-6">
              <button
                onClick={() => setShowPaymentModal(true)}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-lg hover:opacity-90 transition-all shadow-xl shadow-ccb-primary/20"
              >
                <Crown className="w-5 h-5" />
                Subscribe — {billingCycle === 'yearly' ? `${yearlyPrice.toLocaleString()} ${currencyLabel}/year` : `${monthlyPrice.toLocaleString()} ${currencyLabel}/month`}
              </button>
              <p className="text-center text-xs text-ccb-muted mt-3">
                Secure payment via TNM Mpamba or Airtel Money. Cancel anytime.
              </p>
            </div>
          </section>
        )}

        {/* BENEFITS */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-ccb-accent" /> What You Get
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: Trophy, title: 'Premium League Access', desc: 'Join membership-only Premier League competitions with season points and official rankings.' },
              { icon: Swords, title: 'Priority Swiss Qualifiers', desc: 'Get early access to Swiss qualifier tournaments. Secure your spot before free entries fill up.' },
              { icon: TrendingUp, title: 'Season Rankings', desc: 'Accumulate season points across all competitions. Climb the official CrazyChess rankings.' },
              { icon: Crown, title: 'Verified Badge', desc: 'Display your CrazyChess Club status with a verified badge on your profile.' },
              { icon: Calendar, title: 'Exclusive Events', desc: 'Invitations to members-only tournaments, special cups, and championship events.' },
              { icon: Shield, title: 'Fair Play Priority', desc: 'Membership subscriptions support our anti-cheat systems and fair play enforcement.' },
            ].map((benefit, i) => {
              const Icon = benefit.icon;
              return (
                <div key={i} className="bg-ccb-card border border-ccb-border rounded-xl p-4 hover:border-ccb-accent/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 border border-ccb-primary/20 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-ccb-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm mb-1">{benefit.title}</h3>
                      <p className="text-xs text-ccb-muted leading-relaxed">{benefit.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* FREE vs MEMBERSHIP COMPARISON */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-ccb-accent" /> Free vs. Membership
          </h2>
          <div className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
            <div className="grid grid-cols-3 text-sm">
              <div className="p-4 border-b border-ccb-border font-semibold text-ccb-muted">Feature</div>
              <div className="p-4 border-b border-ccb-border text-center font-semibold text-ccb-muted">Free</div>
              <div className="p-4 border-b border-ccb-border text-center font-semibold text-ccb-primary bg-ccb-primary/5">Club Member</div>

              {[
                { feature: 'Casual games', free: true, paid: true },
                { feature: 'Free tournaments', free: true, paid: true },
                { feature: 'Wallet & payouts', free: true, paid: true },
                { feature: 'Leaderboard ranking', free: true, paid: true },
                { feature: 'Swiss qualifiers (standard)', free: true, paid: true },
                { feature: 'Premier League (free divisions)', free: true, paid: true },
                { feature: 'Premier League (premium divisions)', free: false, paid: true },
                { feature: 'Priority qualifier entry', free: false, paid: true },
                { feature: 'Season points & rankings', free: false, paid: true },
                { feature: 'Verified club badge', free: false, paid: true },
                { feature: 'Exclusive events & cups', free: false, paid: true },
                { feature: 'Championship eligibility', free: false, paid: true },
              ].map((row, i) => (
                <React.Fragment key={i}>
                  <div className={`p-3 ${i % 2 === 0 ? 'bg-ccb-surface/30' : ''} text-ccb-text text-xs sm:text-sm`}>{row.feature}</div>
                  <div className={`p-3 text-center ${i % 2 === 0 ? 'bg-ccb-surface/30' : ''}`}>
                    {row.free ? <Check className="w-4 h-4 text-ccb-success mx-auto" /> : <X className="w-4 h-4 text-ccb-muted mx-auto" />}
                  </div>
                  <div className={`p-3 text-center ${i % 2 === 0 ? 'bg-ccb-surface/30' : ''} bg-ccb-primary/5`}>
                    {row.paid ? <Check className="w-4 h-4 text-ccb-primary mx-auto" /> : <X className="w-4 h-4 text-ccb-muted mx-auto" />}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* MEMBERSHIP HISTORY */}
        {history.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-ccb-accent" /> Membership History
            </h2>
            <div className="bg-ccb-card border border-ccb-border rounded-2xl overflow-hidden">
              {history.map((m, i) => (
                <div key={m.id} className={`flex items-center justify-between p-4 ${i < history.length - 1 ? 'border-b border-ccb-border' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      m.status === 'active' ? 'bg-ccb-success/10 text-ccb-success' :
                      m.status === 'expired' ? 'bg-ccb-muted/10 text-ccb-muted' :
                      'bg-ccb-danger/10 text-ccb-danger'
                    }`}>
                      <Crown className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {m.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'} — {m.price.toLocaleString()} {m.currency}
                      </div>
                      <div className="text-xs text-ccb-muted">
                        {formatDate(m.start_date)} → {formatDate(m.end_date)}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    m.status === 'active' ? 'bg-ccb-success/10 text-ccb-success border border-ccb-success/30' :
                    m.status === 'expired' ? 'bg-ccb-muted/10 text-ccb-muted border border-ccb-muted/30' :
                    'bg-ccb-danger/10 text-ccb-danger border border-ccb-danger/30'
                  }`}>
                    {m.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-ccb-accent" /> Questions
          </h2>
          <div className="space-y-3">
            {[
              { q: 'Can I still play for free without a membership?', a: 'Absolutely. Free competitions, casual games, and free Swiss qualifiers are available to all players. Membership unlocks premium divisions and exclusive events.' },
              { q: 'How do I pay for my membership?', a: 'Payment is via TNM Mpamba or Airtel Money — the same mobile money options used for tournament entries and wallet deposits.' },
              { q: 'Can I cancel my membership?', a: 'Yes. Your membership stays active until the end of your billing period. After that, it will not auto-renew unless you choose to extend.' },
              { q: 'What happens to my season points if my membership expires?', a: 'Your season points and rankings are preserved. However, you will only accumulate new points in premium competitions while your membership is active.' },
            ].map((faq, i) => (
              <div key={i} className="bg-ccb-card border border-ccb-border rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-1">{faq.q}</h3>
                <p className="text-xs text-ccb-muted leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA to league */}
        <div className="text-center pt-4 pb-4">
          <Link
            href="/league"
            className="inline-flex items-center gap-2 text-sm text-ccb-muted hover:text-ccb-text transition-colors"
          >
            <ArrowRight className="w-4 h-4 rotate-180" /> Back to Competitions
          </Link>
        </div>
      </div>

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Crown className="w-5 h-5 text-ccb-primary" /> Confirm Subscription
            </h3>
            
            <div className="bg-ccb-surface rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ccb-muted">Plan</span>
                <span className="font-semibold">{billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ccb-muted">Amount</span>
                <span className="font-bold text-ccb-primary">
                  {(billingCycle === 'yearly' ? yearlyPrice : monthlyPrice).toLocaleString()} {currencyLabel}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ccb-muted">Duration</span>
                <span className="font-semibold">{billingCycle === 'yearly' ? '12 months' : '1 month'}</span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-ccb-muted text-center">Select your payment method:</p>
              <div className="grid grid-cols-2 gap-3">
                <button className="p-3 rounded-xl border border-ccb-border bg-ccb-surface hover:border-ccb-primary/30 transition-colors text-sm font-medium flex flex-col items-center gap-1">
                  <SmartphoneIcon />
                  <span>TNM Mpamba</span>
                </button>
                <button className="p-3 rounded-xl border border-ccb-border bg-ccb-surface hover:border-ccb-primary/30 transition-colors text-sm font-medium flex flex-col items-center gap-1">
                  <SmartphoneIcon />
                  <span>Airtel Money</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-3 rounded-xl border border-ccb-border bg-ccb-surface text-ccb-text font-medium text-sm hover:bg-ccb-card transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubscribe}
                disabled={subscribing}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50"
              >
                {subscribing ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm & Pay'}
              </button>
            </div>

            <p className="text-[10px] text-ccb-muted text-center">
              By subscribing, you agree to the CrazyChess Club terms. Your membership activates immediately after payment confirmation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SmartphoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ccb-primary">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12" y2="18" />
    </svg>
  );
}
