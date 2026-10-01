import Link from "next/link";
import {
  Users, Smartphone, Swords, Trophy, Wallet, ArrowRight, Check,
  Gamepad2, Clock, Crown, ChevronRight, Zap, Disc3,
} from "lucide-react";
import PublicHomeNav from "@/components/layout/public-home-nav";
import PublicSiteFooter from "@/components/layout/public-site-footer";

export const dynamic = "force-dynamic";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "How It Works — Start Playing Competitive Chess",
  description: "Learn how to join Crazy Chess Battles: create an account, play your first game, enter tournaments, climb the league standings, and prove your rank. A step-by-step guide.",
  path: "/how-it-works",
});

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHomeNav signupUrl="/signup" />

      {/* Hero */}
      <section className="px-4 py-12 sm:py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
            How <span className="text-emerald-300">Crazy Chess Battles</span> works
          </h1>
          <p className="text-sm sm:text-lg text-ccb-muted">
            From zero to your first tournament in minutes. Here&apos;s everything you need to know.
          </p>
        </div>
      </section>

      {/* Step 1: Sign Up */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-400/10 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-300" />
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-ccb-muted text-xs font-mono mb-1">Step 01</div>
                <h2 className="text-lg sm:text-xl font-bold">Create your account</h2>
              </div>
              <p className="text-sm text-ccb-muted">
                Sign up with a username, email, and password. During signup, you&apos;ll pick your chess experience level
                (Beginner, Casual, or Advanced) which sets your initial rating. You can also optionally link your
                Chess.com account to auto-import your real rating and get a verified badge.
              </p>
              <div className="space-y-2">
                {[
                  "Pick a unique username — this is how opponents see you",
                  "Choose your skill level or link Chess.com for auto-rating",
                  "Get a referral link — earn club perks when friends activate",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-ccb-muted">
                    <Check className="w-4 h-4 text-ccb-success shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2: Deposit */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16 bg-ccb-surface/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-ccb-success/10 flex items-center justify-center shrink-0">
              <Smartphone className="w-6 h-6 sm:w-7 sm:h-7 text-ccb-success" />
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-ccb-muted text-xs font-mono mb-1">Step 02</div>
                <h2 className="text-lg sm:text-xl font-bold">Join the Club (optional)</h2>
              </div>
              <p className="text-sm text-ccb-muted">
                Club membership is just $10 a month. Pay with mobile money — go to your Membership page,
                enter your phone number, and authorize the payment on your phone. Your membership activates
                instantly and keeps the leagues, tournaments and rewards running for the whole community.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="card !p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-ccb-success/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-ccb-success">TNM</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">TNM Mpamba</div>
                    <div className="text-xs text-ccb-muted">Deposit from any TNM number</div>
                  </div>
                </div>
                <div className="card !p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-ccb-danger/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-ccb-danger">AIRTEL</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Airtel Money</div>
                    <div className="text-xs text-ccb-muted">Deposit from any Airtel number</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-ccb-muted">
                You can also play for free — casual games, free tournaments, and challenge links don&apos;t require a deposit.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Step 3: Play */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-ccb-accent/10 flex items-center justify-center shrink-0">
              <Swords className="w-6 h-6 sm:w-7 sm:h-7 text-ccb-accent" />
            </div>
            <div className="space-y-4 flex-1">
              <div>
                <div className="text-ccb-muted text-xs font-mono mb-1">Step 03</div>
                <h2 className="text-lg sm:text-xl font-bold">Pick a game mode</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card">
                  <Zap className="w-5 h-5 text-emerald-300 mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Quick Match</h3>
                  <p className="text-xs text-ccb-muted">Get matched with a player at your skill level. Bullet, blitz, or rapid.</p>
                </div>
                <div className="card">
                  <Swords className="w-5 h-5 text-ccb-success mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Challenge a Friend</h3>
                  <p className="text-xs text-ccb-muted">Generate a link and send it. Play ranked or casual — the choice is yours.</p>
                </div>
                <div className="card">
                  <Trophy className="w-5 h-5 text-ccb-accent mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Join a Tournament</h3>
                  <p className="text-xs text-ccb-muted">Enter Swiss tournaments. Win games, climb the bracket, claim the title.</p>
                </div>
                <div className="card">
                  <Disc3 className="w-5 h-5 text-ccb-accent mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Draughts</h3>
                  <p className="text-xs text-ccb-muted">International draughts (10×10). Play vs computer or challenge a friend online.</p>
                </div>
                <div className="card">
                  <Gamepad2 className="w-5 h-5 text-emerald-300 mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Play vs Computer</h3>
                  <p className="text-xs text-ccb-muted">Practice chess or draughts against the AI. No rating impact — just sharpen your skills.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step 4: Win & Withdraw */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16 bg-ccb-surface/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-ccb-accent/10 flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6 sm:w-7 sm:h-7 text-ccb-accent" />
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-ccb-muted text-xs font-mono mb-1">Step 04</div>
                <h2 className="text-lg sm:text-xl font-bold">Win, earn rewards, withdraw</h2>
              </div>
              <p className="text-sm text-ccb-muted">
                When a tournament ends, club rewards are credited automatically to top finishers&apos; wallets based on final ranking.
                Members earn XP in every game, and the weekly league table decides who tops the week.
              </p>
              <p className="text-sm text-ccb-muted">
                Your wallet balance can be withdrawn to your mobile money account at any time. No waiting periods,
                no minimum withdrawal amount.
              </p>
              <div className="flex items-center gap-2 text-sm text-ccb-success">
                <Check className="w-4 h-4" />
                <span>Secure withdrawals via TNM Mpamba or Airtel Money</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Create Tournaments */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16 bg-ccb-surface/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-400/10 flex items-center justify-center shrink-0">
              <Crown className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-300" />
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-ccb-muted text-xs font-mono mb-1">Bonus</div>
                <h2 className="text-lg sm:text-xl font-bold">Host your own tournaments</h2>
              </div>
              <p className="text-sm text-ccb-muted">
                Once you&apos;re eligible, you can host tournaments for the community. Set your own format,
                min/max players, time controls, and schedule.
              </p>
              <div className="space-y-2">
                <div className="text-sm font-medium">Eligibility requirements:</div>
                {[
                  "Free tournaments: Account 3+ days old, 10+ games played",
                  "Hosting larger events: Chess.com verified, 7+ day account, 20+ games played",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-ccb-muted">
                    <ChevronRight className="w-4 h-4 text-emerald-300 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4 bg-emerald-400/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl sm:text-3xl font-bold mb-4">Ready to make your first move?</h2>
          <p className="text-sm text-ccb-muted mb-6">Join Malawi&apos;s competitive chess community.</p>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-8 py-3 text-base font-black text-slate-950 shadow-[0_0_18px_rgba(16,230,143,.22)] transition hover:brightness-110">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <PublicSiteFooter />
    </div>
  );
}
