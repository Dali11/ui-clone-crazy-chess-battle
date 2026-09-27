"use client";

import { useState } from "react";
import {
  Gift, Users, CheckCircle, Clock, Copy, Check, Share2, Send,
  Wallet, ChevronRight, TrendingUp, Crown, UserPlus, Coins, Sparkles,
  ChevronDown, Calculator as CalcIcon,
} from "lucide-react";
import { formatUsd } from "@/lib/geo/format";
import { useCurrency } from "@/hooks/use-currency";

interface Referral {
  id: string;
  status: string;
  created_at: string;
  activated_at: string | null;
  activation_condition: string | null;
  commission_amount: number;
  commission_paid: boolean;
  referred: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    rating: number;
  } | null;
}

interface AffiliateClientProps {
  affiliateEnabled: boolean;
  refCode: string;
  baseUrl: string;
  walletBalance: number;
  totalCommissionEarned: number;
  /** Membership is a single $10/mo USD plan (owner decision 2026-09-15) — no yearly tier. */
  membershipPriceUsd: number;
  commissionRate: number;
  referrals: Referral[];
}

const ACTIVATION_LABELS: Record<string, string> = {
  chess_battle: "Played a cash battle",
  tournament_joined: "Joined a tournament",
  wallet_topup: "Topped up wallet",
  "10_quick_matches": "Played 10 quick matches",
  membership_purchase: "Purchased membership",
  fee_share: "Generating platform fees",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
/** Deterministic "19 Sep" formatting (UTC, fixed month names) — no hydration drift. */
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()] || "";
  return `${day} ${month}`;
}

export default function AffiliateClient({
  affiliateEnabled,
  refCode,
  baseUrl,
  walletBalance,
  totalCommissionEarned,
  membershipPriceUsd,
  commissionRate,
  referrals,
}: AffiliateClientProps) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [activeFriends, setActiveFriends] = useState(10);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { formatWallet, formatMoney: fmtCurrency } = useCurrency();

  const referralLink = `${baseUrl}/signup?ref=${refCode}`;
  const commissionPct = Math.round(commissionRate * 100);
  const membershipEarn = formatUsd(membershipPriceUsd * commissionRate);
  const perFriendMonthly = membershipPriceUsd * commissionRate;
  const estimateMonthly = formatUsd(activeFriends * perFriendMonthly);

  const copy = (what: "code" | "link") => {
    navigator.clipboard.writeText(what === "code" ? refCode : referralLink);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareText = `Join me on Crazy Chess Battles — play chess, compete in leagues & tournaments, and battle for cash!`;
  const waShare = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`;
  const nudgeShare = `https://wa.me/?text=${encodeURIComponent(`Come play your first cash battle on Crazy Chess Battles 🏆 Grab a membership and let\u2019s go! ${referralLink}`)}`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Crazy Chess Battles", text: shareText, url: referralLink });
        return;
      } catch {}
    }
    copy("link");
  };

  // Stats
  const totalRefs = referrals.length;
  const activatedRefs = referrals.filter(
    (r) => r.status === "activated" || r.status === "rewarded" || !!r.activated_at
  ).length;
  const pendingRefs = totalRefs - activatedRefs;

  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-10 animate-fade-in">
      {/* Paused notice — tracking still works, payouts wait for the switch */}
      {!affiliateEnabled && (
        <div className="rounded-xl border border-ccb-accent/30 bg-ccb-accent/10 p-4 text-center">
          <p className="text-sm font-semibold text-ccb-accent">Commissions are paused for a moment</p>
          <p className="text-xs text-ccb-muted mt-1">
            Your referral links still track every sign-up — commissions will be credited automatically when the program resumes.
          </p>
        </div>
      )}

      {/* DESKTOP: two-column. Left = hero + link. Right = stats. Mobile: stacked. */}
      <div className="grid lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* ================= LEFT COLUMN ================= */}
        <div className="lg:col-span-7 space-y-4 sm:space-y-6">
          {/* HERO */}
          <div className="relative overflow-hidden bg-gradient-to-br from-ccb-primary/25 via-ccb-card to-ccb-card border border-ccb-primary/30 rounded-2xl p-5 sm:p-7">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-ccb-primary/20 rounded-full blur-3xl" aria-hidden />
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl bg-ccb-primary/25 border border-ccb-primary/40 flex items-center justify-center shrink-0">
                  <Gift className="w-4 h-4 text-ccb-primary" />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-ccb-muted">Affiliate Program</p>
              </div>

              <h1 className="text-2xl sm:text-4xl font-extrabold leading-tight">
                Earn <span className="text-ccb-primary">{commissionPct}%</span> of every fee<br className="hidden sm:block" /> your friends generate
              </h1>
              <p className="text-sm sm:text-base text-ccb-muted mt-2 max-w-lg">
                Every cash battle they play, every paid tournament they enter, every membership renewal — paid to your wallet, forever. No limit.
              </p>

              {/* Commission showcase — membership is a single $10/mo USD plan
                  (owner decision 2026-09-15), no yearly tier. Fixed dollar
                  price shown to every player, same as the league ladder. */}
              <div className="mt-5 grid sm:grid-cols-[1fr_auto] gap-2 items-stretch">
                <div className="bg-ccb-surface/70 rounded-xl p-3.5 border border-ccb-border/70 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-ccb-accent/15 border border-ccb-accent/30 flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4 text-ccb-accent" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Membership (per friend, per month)</p>
                    <p className="text-sm font-bold">
                      {formatUsd(membershipPriceUsd)}<span className="text-xs text-ccb-muted font-medium">/mo</span>
                      <span className="text-ccb-muted mx-1.5">×</span>
                      <span className="text-ccb-muted font-medium">{commissionPct}%</span>
                      <span className="text-ccb-muted mx-1.5">=</span>
                      <span className="text-ccb-success">{membershipEarn}</span>
                      <span className="text-ccb-muted"> to you</span>
                    </p>
                  </div>
                </div>
                <div className="bg-ccb-success/10 border border-ccb-success/25 rounded-xl px-4 py-3 flex items-center gap-2 justify-center">
                  <TrendingUp className="w-4 h-4 text-ccb-success shrink-0" />
                  <p className="text-xs font-semibold text-ccb-success">Recurring &amp; unlimited</p>
                </div>
              </div>
            </div>
          </div>

          {/* REFERRAL LINK CARD */}
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Your referral link</label>
              <span className="text-[10px] font-mono text-ccb-muted hidden sm:inline">{refCode}</span>
            </div>

            <div className="flex gap-2">
              <input
                readOnly
                value={referralLink}
                className="flex-1 min-w-0 bg-ccb-surface border border-ccb-border rounded-xl px-3.5 py-3 text-xs sm:text-sm text-ccb-muted truncate font-mono"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => copy("link")}
                className="shrink-0 px-4 rounded-xl bg-ccb-primary text-white font-semibold text-sm active:scale-95 transition-transform flex items-center gap-2"
                aria-label="Copy link"
              >
                {copied === "link" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">{copied === "link" ? "Copied" : "Copy"}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleShare}
                className="flex-1 h-11 rounded-xl bg-ccb-surface border border-ccb-border text-sm font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" /> Share link
              </button>
              <button
                onClick={() => copy("code")}
                className="flex-1 h-11 rounded-xl bg-ccb-surface border border-ccb-border text-sm font-semibold active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                {copied === "code" ? <Check className="w-4 h-4 text-ccb-success" /> : <Coins className="w-4 h-4" />}
                {copied === "code" ? "Code copied" : "Copy code only"}
              </button>
              <a
                href={waShare}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 h-11 rounded-xl bg-[#25D366]/15 border border-[#25D366]/40 text-[#25D366] text-sm font-bold active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" /> WhatsApp
              </a>
            </div>
            <p className="text-[11px] text-ccb-muted">
              Tip: friends must sign up through your link — their account is linked to you automatically, once.
            </p>
          </div>

          {/* EARNINGS CALCULATOR */}
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted flex items-center gap-1.5">
                <CalcIcon className="w-3.5 h-3.5" /> Earnings calculator
              </label>
              <span className="text-[10px] text-ccb-muted">memberships alone</span>
            </div>
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-sm font-semibold">
                {activeFriends} active {activeFriends === 1 ? "friend" : "friends"}
              </p>
              <p className="text-xl sm:text-2xl font-extrabold text-ccb-success">≈ {estimateMonthly}/mo</p>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={activeFriends}
              onChange={(e) => setActiveFriends(Number(e.target.value))}
              className="w-full accent-ccb-primary cursor-pointer"
              aria-label="Number of active friends"
            />
            <p className="text-[11px] text-ccb-muted mt-2">
              Every friend pays you {membershipEarn} per month they hold a membership — plus {commissionPct}% of every battle fee, tournament entry and ad they buy.
            </p>
          </div>
        </div>

        {/* ================= RIGHT COLUMN ================= */}
        <div className="lg:col-span-5 space-y-4 sm:space-y-6">
          {/* STATS */}
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-2 sm:gap-4">
            <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-ccb-primary/15 border border-ccb-primary/25 flex items-center justify-center shrink-0">
                <UserPlus className="w-5 h-5 text-ccb-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-extrabold leading-none">{totalRefs}</p>
                <p className="text-[10px] text-ccb-muted uppercase tracking-wider mt-1">Invited</p>
              </div>
            </div>
            <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-ccb-success/15 border border-ccb-success/25 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-ccb-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-extrabold leading-none text-ccb-success">{activatedRefs}</p>
                <p className="text-[10px] text-ccb-muted uppercase tracking-wider mt-1">
                  Active{totalRefs > 0 && pendingRefs > 0 ? ` · ${pendingRefs} pending` : ""}
                </p>
              </div>
            </div>
            <div className="bg-ccb-card border border-ccb-primary/30 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-ccb-primary/15 border border-ccb-primary/30 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-ccb-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-extrabold leading-none text-ccb-primary">{fmtCurrency(totalCommissionEarned)}</p>
                <p className="text-[10px] text-ccb-muted uppercase tracking-wider mt-1">Earned</p>
              </div>
            </div>
          </div>

          {/* WALLET */}
          <a
            href="/wallet"
            className="bg-ccb-card border border-ccb-border rounded-2xl p-4 flex items-center justify-between hover:border-ccb-primary/40 transition-colors group"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Wallet balance</p>
              <p className="text-xl font-extrabold mt-1">{formatWallet(walletBalance)}</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-ccb-surface border border-ccb-border flex items-center justify-center group-hover:border-ccb-primary/40 transition-colors">
              <ChevronRight className="w-4 h-4 text-ccb-muted" />
            </div>
          </a>

          {/* HOW IT WORKS — horizontal 3 steps on desktop, vertical on mobile */}
          <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted mb-4">How it works</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-ccb-primary/20 text-ccb-primary text-xs font-bold flex items-center justify-center shrink-0">1</div>
                <div>
                  <p className="text-sm font-semibold">Share your link</p>
                  <p className="text-xs text-ccb-muted mt-0.5">Send it to friends on WhatsApp or social media.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-ccb-primary/20 text-ccb-primary text-xs font-bold flex items-center justify-center shrink-0">2</div>
                <div>
                  <p className="text-sm font-semibold">Friend signs up &amp; verifies</p>
                  <p className="text-xs text-ccb-muted mt-0.5">They register through your link and verify their identity — that unlocks your earnings.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-ccb-success/20 text-ccb-success text-xs font-bold flex items-center justify-center shrink-0">3</div>
                <div>
                  <p className="text-sm font-semibold">You earn {commissionPct}% of their fees — forever</p>
                  <p className="text-xs text-ccb-muted mt-0.5">
                    Every cash battle, paid tournament, and {membershipEarn} per membership renewal. Ads they buy pay you {commissionPct}% of their first campaign and 10% after. Credited automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* REFERRALS LIST */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ccb-muted flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Your referrals
          </h3>
          <span className="text-[10px] text-ccb-muted">{totalRefs} total</span>
        </div>

        {referrals.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-xl border border-dashed border-ccb-border">
            <div className="w-12 h-12 rounded-2xl bg-ccb-primary/10 border border-ccb-primary/20 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-5 h-5 text-ccb-primary" />
            </div>
            <p className="text-sm font-semibold">No referrals yet</p>
            <p className="text-xs text-ccb-muted mt-1 max-w-xs mx-auto">
              Share your link — every friend who joins earns you {commissionPct}% of their fees, forever.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <a
                href={waShare}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-4 rounded-xl bg-[#25D366]/15 border border-[#25D366]/40 text-[#25D366] text-xs font-bold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> WhatsApp
              </a>
              <button
                onClick={() => copy("link")}
                className="h-9 px-4 rounded-xl bg-ccb-primary text-white text-xs font-bold flex items-center gap-1.5"
              >
                {copied === "link" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === "link" ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {referrals.map((ref) => {
              const isActive = ref.status === "activated" || ref.status === "rewarded" || !!ref.activated_at;
              const name = ref.referred?.display_name || ref.referred?.username || "Pending registration";
              const initials = name.charAt(0).toUpperCase();
              return (
                <div key={ref.id} className="flex items-center gap-3 px-3 py-3 rounded-xl bg-ccb-surface border border-ccb-border/50">
                  {ref.referred?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ref.referred.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-ccb-primary/10 border border-ccb-border flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-ccb-primary">{initials}</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      {isActive ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ccb-success/15 text-ccb-success shrink-0">ACTIVE</span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ccb-muted/10 text-ccb-muted shrink-0">PENDING</span>
                      )}
                    </div>
                    <p className="text-[10px] text-ccb-muted mt-0.5 flex items-center gap-1">
                      {isActive ? (
                        <>
                          <CheckCircle className="w-3 h-3 text-ccb-success" />
                          {ref.activation_condition ? ACTIVATION_LABELS[ref.activation_condition] || "Activated" : "Activated"}
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3" />
                          {ref.activation_condition
                            ? `Unlocks: ${ACTIVATION_LABELS[ref.activation_condition] || "first paid activity"}`
                            : "Joined — awaiting first paid activity"}
                        </>
                      )}
                      <span className="text-ccb-border">|</span>
                      <span>{shortDate(ref.created_at)}</span>
                    </p>
                  </div>

                  {isActive && ref.commission_amount > 0 ? (
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-ccb-success">+{fmtCurrency(ref.commission_amount)}</p>
                      <p className="text-[10px] text-ccb-muted">commission</p>
                    </div>
                  ) : !isActive ? (
                    <a
                      href={nudgeShare}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-ccb-primary/15 border border-ccb-primary/30 text-ccb-primary flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      <Send className="w-3 h-3" /> Nudge
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAQ */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-4">Questions, answered</h3>
        <div className="divide-y divide-ccb-border">
          {[
            {
              q: "When do I get paid?",
              a: "The moment your friend pays — commission lands in your wallet automatically, every time. Withdraw from your wallet anytime.",
            },
            {
              q: "Why is my friend still pending?",
              a: "A referral activates once your friend makes their first paid move — buying a membership. Until then they show as pending, and a quick nudge helps.",
            },
            {
              q: "What if my friend already has an account?",
              a: "Referral links only work for brand-new signups. Each player can only ever be linked to one referrer.",
            },
            {
              q: "Does my friend pay more through my link?",
              a: `No — the price is exactly the same. Your ${commissionPct}% comes out of the platform's share, never theirs.`,
            },
            {
              q: "Can I refer myself?",
              a: "No — self-referrals are blocked, and every commission is tied to a real payment.",
            },
          ].map((item, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-3 py-3 text-left"
              >
                <span className="text-sm font-semibold">{item.q}</span>
                <ChevronDown
                  className={"w-4 h-4 text-ccb-muted shrink-0 transition-transform " + (openFaq === i ? "rotate-180" : "")}
                />
              </button>
              {openFaq === i && <p className="text-xs text-ccb-muted pb-3 pr-6">{item.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
