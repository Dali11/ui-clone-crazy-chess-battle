export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Share2, UserPlus, Coins, Zap, ChevronDown } from "lucide-react";
import { referralLink, ACTIVATION_LABELS } from "@/lib/affiliate/labels";
import { pageMetadata } from "@/lib/seo/metadata";
import ShareTemplates from "../_components/share-templates";

export const metadata = pageMetadata({
  title: "Affiliate Guide — How It Works",
  description: "Everything about the Crazy Chess Battles affiliate program: steps, activation rules, share templates and FAQ.",
  path: "/affiliate/how-it-works",
  noIndex: true,
});

const FAQ = [
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
    a: "No — the price is exactly the same. Your 25% comes out of the platform's share, never theirs.",
  },
  {
    q: "Can I refer myself?",
    a: "No — self-referrals are blocked, and every commission is tied to a real payment.",
  },
  {
    q: "Do commissions expire?",
    a: "Never. As long as your friend keeps playing and paying, you keep earning 25% of every fee they generate.",
  },
];

export default async function HowItWorksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/affiliate/how-it-works");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, referral_code")
    .eq("id", user.id)
    .single();

  const refCode = profile?.referral_code || profile?.username || "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://crazychessbattles.live";
  const link = referralLink(baseUrl, refCode);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Steps */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-4">Three steps, forever earning</h2>
        <div className="space-y-3">
          {[
            {
              icon: Share2,
              t: "Share your link",
              d: "Send your referral link to friends, chess groups, club mates — anyone who plays. It works everywhere: WhatsApp, Telegram, anywhere you like.",
            },
            {
              icon: UserPlus,
              t: "They join through your link",
              d: "Their new account is linked to you automatically — once, permanently. No codes to type, nothing for them to remember.",
            },
            {
              icon: Coins,
              t: "You earn 25% of every fee",
              d: "Cash battles, paid tournaments, membership renewals, ads — 25% of each fee lands in your wallet instantly, forever.",
            },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="flex gap-3.5 bg-ccb-surface/70 border border-ccb-border/70 rounded-xl p-3.5">
              <div className="w-10 h-10 rounded-xl bg-ccb-primary/15 border border-ccb-primary/30 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-ccb-primary" />
              </div>
              <div>
                <p className="text-sm font-bold">{t}</p>
                <p className="text-xs text-ccb-muted mt-1 leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What counts as activation */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-ccb-accent" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-ccb-muted">When a friend counts as active</h2>
        </div>
        <p className="text-xs text-ccb-muted mb-3">
          A referral flips from <span className="font-semibold text-ccb-accent">pending</span> to{" "}
          <span className="font-semibold text-ccb-success">active</span> on their first paid move — usually a
          membership purchase. After that, every fee they generate pays you.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Object.values(ACTIVATION_LABELS).map((label) => (
            <span key={label} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted">
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Share templates */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-1">Ready-to-send messages</h2>
        <p className="text-[11px] text-ccb-muted mb-4">Copy or send directly — each one already includes your link.</p>
        <ShareTemplates referralLink={link} />
      </div>

      {/* Tips */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-3">What works best</h2>
        <ul className="space-y-2.5">
          {[
            "Personal beats broadcast — a direct message to a chess friend converts far better than a group blast.",
            "Chess clubs & school clubs are gold: one club organizer can bring ten players through your link.",
            "Show, don't tell — challenge them to a first game right after they join; activation follows play.",
            "Nudge pending friends after a few days with the ready-made nudge template above.",
          ].map((tip) => (
            <li key={tip} className="flex gap-2.5 text-xs text-ccb-muted leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-ccb-primary mt-1.5 shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      {/* FAQ */}
      <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-4">Questions, answered</h2>
        <div className="divide-y divide-ccb-border">
          {FAQ.map((item) => (
            <details key={item.q} className="group">
              <summary className="w-full flex items-center justify-between gap-3 py-3 text-left cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold">{item.q}</span>
                <ChevronDown className="w-4 h-4 text-ccb-muted shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="text-xs text-ccb-muted pb-3 pr-6">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
