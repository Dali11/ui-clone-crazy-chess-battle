'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle, User, Sparkles,
  X, ChevronRight, PartyPopper, Trophy,
} from 'lucide-react';

interface WelcomeChecklistData {
  profileComplete: boolean;
  displayName: string | null;
  country: string | null;
  hasMembership: boolean;
}

const DISMISS_KEY = 'ccb-league-welcome-dismissed';

function shouldShow(): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) return true;
    // Re-show if dismissed more than 24h ago
    return Date.now() - parseInt(dismissed, 10) >= 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  } catch {}
}

export default function LeagueWelcomeChecklist() {
  const [data, setData] = useState<WelcomeChecklistData | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!shouldShow()) return;

      try {
        const res = await fetch('/api/league/premium-leagues');
        if (!res.ok) return;
        const json = await res.json();

        const d: WelcomeChecklistData = {
          profileComplete: !!json.profileComplete,
          displayName: json.displayName || null,
          country: json.country || null,
          hasMembership: !!json.hasMembership,
        };

        setData(d);

        // Show the checklist modal when profile is incomplete
        // (membership is auto-covered by the free trial — never a blocker)
        if (!d.profileComplete) {
          setVisible(true);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    markDismissed();
    setVisible(false);
  };

  if (loading || !visible || !data) return null;

  const allDone = data.profileComplete;

  const items = [
    {
      icon: User,
      label: 'Complete Your Profile',
      description: data.profileComplete
        ? `${data.displayName} · ${data.country}`
        : 'Set your display name and country to join',
      done: data.profileComplete,
      action: data.profileComplete ? null : '/settings',
      actionLabel: 'Edit Profile',
      badge: null as string | null,
    },
    {
      icon: Sparkles,
      label: 'Membership Fee',
      description: data.hasMembership
        ? 'Active membership'
        : 'Covered by your 30-day free trial',
      done: true,
      action: null,
      actionLabel: null,
      badge: data.hasMembership ? null : 'FREE TRIAL',
    },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 animate-fade-in">
      <div className="w-full max-w-md bg-ccb-card border border-ccb-border rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-ccb-primary to-ccb-accent px-5 py-4 pr-10">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-white/90 hover:text-white p-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              {allDone ? <PartyPopper className="w-5 h-5 text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-tight leading-tight">
                {allDone ? "You're All Set!" : 'Welcome to Season 1'}
              </h2>
              <p className="text-xs text-white/80 leading-tight mt-0.5">
                {allDone ? 'Go pick your league and start competing' : 'Quick checklist before you join'}
              </p>
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="px-5 py-4 space-y-3">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                  item.done
                    ? 'border-ccb-success/30 bg-ccb-success/5'
                    : 'border-ccb-border bg-ccb-surface'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    item.done
                      ? 'bg-ccb-success/15 text-ccb-success'
                      : 'bg-ccb-primary/10 text-ccb-primary'
                  }`}
                >
                  {item.done ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-ccb-text">{item.label}</p>
                    {item.badge && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-ccb-success/15 text-ccb-success border border-ccb-success/20">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ccb-muted mt-0.5">{item.description}</p>
                  {item.action && (
                    <Link
                      href={item.action}
                      onClick={handleDismiss}
                      className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-ccb-primary hover:text-ccb-primary/80 transition-colors"
                    >
                      {item.actionLabel}
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          {allDone ? (
            <button
              onClick={handleDismiss}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent hover:opacity-90 text-white text-sm font-bold px-4 py-3 transition-all"
            >
              <Trophy className="w-4 h-4" />
              Browse Leagues
            </button>
          ) : (
            <>
              <button
                onClick={handleDismiss}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-ccb-surface border border-ccb-border hover:border-ccb-primary/30 text-ccb-text text-sm font-semibold px-4 py-3 transition-colors"
              >
                Browse Leagues Anyway
              </button>
              <p className="text-[11px] text-ccb-muted text-center mt-2.5">
                You can join any tier — your rating is just a suggestion.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
