import Link from "next/link";
import Image from "next/image";
import {
  Users, Smartphone, Swords, Trophy, Wallet, ArrowRight, Check,
  Gamepad2, Clock, Crown, ChevronRight, Zap, Disc3,
} from "lucide-react";
import HomeStats from "../home-stats";

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
      {/* Nav */}
      <nav className="border-b border-ccb-border bg-ccb-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={32} height={32} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full shrink-0" />
            <span className="font-bold text-sm sm:text-lg truncate">Crazy Chess Battles</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link href="/league" className="btn-ghost text-sm hidden sm:inline-flex">Tournaments</Link>
            <Link href="/league" className="btn-ghost text-sm">Leagues</Link>
            <Link href="/signup" className="btn-primary text-sm px-3 sm:px-4">Sign up</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 py-12 sm:py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
            How <span className="text-ccb-primary">Crazy Chess Battles</span> works
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
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-ccb-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6 sm:w-7 sm:h-7 text-ccb-primary" />
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
                  "Get a referral link — earn MK500 cash when friends activate",
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
                <h2 className="text-lg sm:text-xl font-bold">Fund your wallet (optional)</h2>
              </div>
              <p className="text-sm text-ccb-muted">
                Want to enter paid tournaments? Deposit money into your CCB wallet using mobile money.
                Go to your Wallet page, enter your phone number and the amount, and authorize the payment
                on your phone. Your balance updates instantly.
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
                  <Zap className="w-5 h-5 text-ccb-primary mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Quick Match</h3>
                  <p className="text-xs text-ccb-muted">Get matched with a player at your skill level. Bullet, blitz, or rapid.</p>
                </div>
                <div className="card">
                  <Swords className="w-5 h-5 text-ccb-success mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Challenge a Friend</h3>
                  <p className="text-xs text-ccb-muted">Generate a link and send it. Play ranked or casual, with or without stakes.</p>
                </div>
                <div className="card">
                  <Trophy className="w-5 h-5 text-ccb-accent mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Join a Tournament</h3>
                  <p className="text-xs text-ccb-muted">Enter free or paid Swiss tournaments. Win games, climb the bracket, claim your prize.</p>
                </div>
                <div className="card">
                  <Disc3 className="w-5 h-5 text-ccb-accent mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Draughts</h3>
                  <p className="text-xs text-ccb-muted">International draughts (10×10). Play vs computer or challenge a friend online.</p>
                </div>
                <div className="card">
                  <Gamepad2 className="w-5 h-5 text-ccb-primary mb-2" />
                  <h3 className="font-semibold text-sm mb-1">Play vs Computer</h3>
                  <p className="text-xs text-ccb-muted">Practice chess or draughts against the AI. No stakes, no rating impact — just sharpen your skills.</p>
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
                <h2 className="text-lg sm:text-xl font-bold">Win, get paid, withdraw</h2>
              </div>
              <p className="text-sm text-ccb-muted">
                When a tournament ends, prizes are distributed automatically to winners&apos; wallets based on final ranking.
                The top players split the prize pool — typically 40% to 1st, 20% to 2nd, 18% to 3rd, and so on.
              </p>
              <p className="text-sm text-ccb-muted">
                Your wallet balance can be withdrawn to your mobile money account at any time. No waiting periods,
                no minimum withdrawal amount.
              </p>
              <div className="flex items-center gap-2 text-sm text-ccb-success">
                <Check className="w-4 h-4" />
                <span>Instant payout to TNM Mpamba or Airtel Money</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Competitive Pipeline */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 sm:mb-10">
            <Crown className="w-8 h-8 text-ccb-primary mx-auto mb-3" />
            <h2 className="text-lg sm:text-2xl font-bold mb-2">The Competitive Pipeline</h2>
            <p className="text-sm text-ccb-muted">From your first casual game to season champion — here&apos;s the path</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="card text-center">
              <div className="text-ccb-muted text-xs font-mono mb-2">Stage 01</div>
              <Swords className="w-7 h-7 text-ccb-accent mx-auto mb-3" />
              <h3 className="font-semibold text-sm mb-2">Swiss Qualifiers</h3>
              <p className="text-xs text-ccb-muted">Compete in Swiss tournaments with Buchholz tiebreakers. Top finishers earn qualification spots for the Premier League.</p>
            </div>
            <div className="card text-center">
              <div className="text-ccb-muted text-xs font-mono mb-2">Stage 02</div>
              <Trophy className="w-7 h-7 text-ccb-primary mx-auto mb-3" />
              <h3 className="font-semibold text-sm mb-2">Premier League</h3>
              <p className="text-xs text-ccb-muted">Round-robin league with football-style scoring — 3 points for a win, 1 for a draw. Climb the table across weekly fixtures.</p>
            </div>
            <div className="card text-center">
              <div className="text-ccb-muted text-xs font-mono mb-2">Stage 03</div>
              <Crown className="w-7 h-7 text-ccb-success mx-auto mb-3" />
              <h3 className="font-semibold text-sm mb-2">Season Champion</h3>
              <p className="text-xs text-ccb-muted">Accumulate season points across all competitions. Top players fight for the championship title and prizes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Create Tournaments */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16 bg-ccb-surface/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-ccb-primary/10 flex items-center justify-center shrink-0">
              <Crown className="w-6 h-6 sm:w-7 sm:h-7 text-ccb-primary" />
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-ccb-muted text-xs font-mono mb-1">Bonus</div>
                <h2 className="text-lg sm:text-xl font-bold">Host your own tournaments</h2>
              </div>
              <p className="text-sm text-ccb-muted">
                Once you&apos;re eligible, you can create tournaments and earn a 40% profit share of the entry fees
                (after the 10% platform cut). Set your own entry fee, min/max players, time controls, and schedule.
              </p>
              <div className="space-y-2">
                <div className="text-sm font-medium">Eligibility requirements:</div>
                {[
                  "Free tournaments: Account 3+ days old, 10+ games played",
                  "Paid tournaments: Chess.com verified, 1+ deposit, 7+ day account, 20+ games played",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-ccb-muted">
                    <ChevronRight className="w-4 h-4 text-ccb-primary shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4 bg-ccb-primary/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl sm:text-3xl font-bold mb-4">Ready to make your first move?</h2>
          <p className="text-sm text-ccb-muted mb-6">Join Malawi&apos;s competitive chess community.</p>
          <Link href="/signup" className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ccb-border py-6 sm:py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row-reverse items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={24} height={24} className="w-6 h-6 rounded-full shrink-0" />
            <span className="text-xs sm:text-sm text-ccb-muted">© 2026 Crazy Chess Battles</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm text-ccb-muted flex-wrap justify-center">
            <Link href="/" className="hover:text-ccb-text transition-colors">Home</Link>
            <Link href="/league" className="hover:text-ccb-text transition-colors">Leagues</Link>
            <Link href="/league" className="hover:text-ccb-text transition-colors">Tournaments</Link>
            <Link href="/faq" className="hover:text-ccb-text transition-colors">FAQ</Link>
            <Link href="/about" className="hover:text-ccb-text transition-colors">About</Link>
            <Link href="/terms" className="hover:text-ccb-text transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-ccb-text transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
