import Link from "next/link";
import {
  Trophy, Swords, TrendingUp, Zap, Wallet, Crown, ArrowRight, Check,
  Users, Smartphone, Shield, Clock, ChevronDown, Star, Gamepad2, Coins,
} from "lucide-react";
import HomeStats from "./home-stats";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const FAQS = [
  {
    q: "Is Crazy Chess Battles free to play?",
    a: "Yes! You can play unlimited casual games for free. Paid tournaments have an entry fee, but there are also free tournaments with berry prizes. You only spend money when you choose to enter a paid tournament.",
  },
  {
    q: "How do I deposit money?",
    a: "Deposit via TNM Mpamba or Airtel Money directly in the app. Go to your Wallet, enter your phone number and amount, and authorize the payment on your phone. Your wallet updates instantly.",
  },
  {
    q: "How do prize payouts work?",
    a: "When a tournament ends, prizes are distributed automatically to winners' wallets based on their final ranking. You can withdraw your wallet balance to your mobile money account anytime.",
  },
  {
    q: "Do I need a Chess.com account?",
    a: "No, but we recommend it. Linking your Chess.com account during signup auto-imports your rating and gives you a verified badge. You can also play with a self-selected skill level instead.",
  },
  {
    q: "Can I create my own tournaments?",
    a: "Yes! Once you meet the eligibility requirements (account age, games played, and verified Chess.com for paid tournaments), you can create both free and paid tournaments and earn a share of the entry fees.",
  },
  {
    q: "What rating system does CCB use?",
    a: "We use the Glicko-2 rating system — the same algorithm Chess.com uses. Your rating adjusts after every rated game based on your opponent's rating and the result.",
  },
];

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const refParam = ref ? `?ref=${ref}` : "";

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user && !ref) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {ref && (
        <div className="bg-red-500/10 border-b border-red-500/20 py-2 px-4 text-center">
          <p className="text-sm text-red-500 font-medium">
            🍒 You were referred! Sign up to earn CRAZYCHESSBERRY rewards!
          </p>
        </div>
      )}

      {/* Nav */}
      <nav className="border-b border-ccb-border bg-ccb-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-ccb-primary flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm sm:text-lg">♞</span>
            </div>
            <span className="font-bold text-sm sm:text-lg truncate">Crazy Chess Battles</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link href="/league" className="btn-ghost text-sm hidden sm:inline-flex">Tournaments</Link>
            <Link href="/leaderboard" className="btn-ghost text-sm">Leaderboard</Link>
            <Link href="/how-it-works" className="btn-ghost text-sm hidden sm:inline-flex">How it Works</Link>
            <Link href={`/signup${refParam}`} className="btn-primary text-sm px-3 sm:px-4">Sign up</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden flex-1 flex items-center justify-center px-4 py-16 sm:py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-ccb-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-3xl text-center relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-ccb-border bg-ccb-card px-3 sm:px-4 py-1.5 mb-6">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-ccb-accent shrink-0" />
            <span className="text-xs sm:text-sm text-ccb-muted">Tournaments · Prizes · Rankings</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold tracking-tight mb-4 sm:mb-6 leading-tight">
            Compete. Win. <span className="text-ccb-primary">Dominate.</span>
          </h1>
          <p className="text-base sm:text-lg text-ccb-muted mb-8 sm:mb-10 max-w-2xl mx-auto px-2">
            Malawi&apos;s competitive chess arena. Enter paid tournaments, climb the rankings, and claim your prize. Play for free or raise the stakes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4">
            <Link href={`/signup${refParam}`} className="btn-primary text-base px-8 py-3 w-full sm:w-auto">
              Start Playing Free
            </Link>
            <Link href="/how-it-works" className="btn-secondary text-base px-8 py-3 w-full sm:w-auto">
              How it Works
            </Link>
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-6 mt-8 sm:mt-10 text-xs sm:text-sm text-ccb-muted flex-wrap">
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>TNM & Airtel Money</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>Instant payouts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>Glicko-2 ratings</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>Free to join</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <section className="border-t border-ccb-border py-8 sm:py-12 px-4 bg-ccb-surface/30">
        <div className="max-w-4xl mx-auto">
          <HomeStats />
        </div>
      </section>

      {/* How It Works — 3 steps */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-bold text-center mb-2">Start in 3 steps</h2>
          <p className="text-sm text-ccb-muted text-center mb-10 sm:mb-12">From signup to your first game in under 2 minutes</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-ccb-primary/10 flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-ccb-primary" />
              </div>
              <div className="text-ccb-muted text-sm font-mono mb-2">Step 01</div>
              <h3 className="font-semibold mb-2">Create your account</h3>
              <p className="text-sm text-ccb-muted">Pick a username, set your skill level, and optionally link your Chess.com profile to auto-import your rating.</p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-ccb-success/10 flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-7 h-7 text-ccb-success" />
              </div>
              <div className="text-ccb-muted text-sm font-mono mb-2">Step 02</div>
              <h3 className="font-semibold mb-2">Deposit (optional)</h3>
              <p className="text-sm text-ccb-muted">Add funds via TNM Mpamba or Airtel Money to enter paid tournaments. Or skip this and play for free.</p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-ccb-accent/10 flex items-center justify-center mx-auto mb-4">
                <Swords className="w-7 h-7 text-ccb-accent" />
              </div>
              <div className="text-ccb-muted text-sm font-mono mb-2">Step 03</div>
              <h3 className="font-semibold mb-2">Play & win</h3>
              <p className="text-sm text-ccb-muted">Jump into quick match or enter tournaments. Win and get paid to your wallet.</p>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link href={`/signup${refParam}`} className="btn-primary inline-flex items-center gap-2">
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4 bg-ccb-surface/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-bold text-center mb-8 sm:mb-10">Why CCB?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="card card-hover">
              <Swords className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-primary mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Real-Time Battles</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Blitz, bullet, or rapid chess against opponents matched to your skill level.</p>
            </div>
            <div className="card card-hover">
              <Trophy className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-accent mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Paid Tournaments</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Enter Swiss tournaments with real prize pools. Win and get paid instantly to your wallet.</p>
            </div>
            <div className="card card-hover">
              <TrendingUp className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-success mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Rankings</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Glicko-2 ratings. Climb from Bronze to Master. Track every win.</p>
            </div>
            <div className="card card-hover">
              <Wallet className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-primary mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Wallet & Deposits</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Deposit via TNM Mpamba or Airtel Money. Entry fees and prize payouts handled in-app.</p>
            </div>
            <div className="card card-hover">
              <Crown className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-accent mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Create Tournaments</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Host your own tournaments. Set entry fees, earn a creator profit share, and build your community.</p>
            </div>
            <div className="card card-hover">
              <Zap className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-success mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Challenge Friends</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Generate a link and play with friends. Ranked or casual — your choice.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Prize split highlight */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-ccb-border bg-ccb-card px-4 py-1.5 mb-6">
            <Coins className="w-4 h-4 text-ccb-accent" />
            <span className="text-xs sm:text-sm text-ccb-muted">Tournament Economics</span>
          </div>
          <h2 className="text-xl sm:text-3xl font-bold mb-4">Where does the money go?</h2>
          <p className="text-sm text-ccb-muted mb-8 max-w-xl mx-auto">
            Every paid tournament on CCB is transparent. Here&apos;s how entry fees are split:
          </p>

          <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-2xl mx-auto">
            <div className="p-4 sm:p-6 rounded-xl bg-ccb-surface/50 border border-ccb-surface">
              <div className="text-3xl sm:text-4xl font-bold text-ccb-muted">10%</div>
              <div className="text-xs sm:text-sm text-ccb-muted mt-2">Platform fee (keeps CCB running)</div>
            </div>
            <div className="p-4 sm:p-6 rounded-xl bg-ccb-success/10 border border-ccb-success/20">
              <div className="text-3xl sm:text-4xl font-bold text-ccb-success">40%</div>
              <div className="text-xs sm:text-sm text-ccb-muted mt-2">Tournament creator earnings</div>
            </div>
            <div className="p-4 sm:p-6 rounded-xl bg-ccb-accent/10 border border-ccb-accent/20">
              <div className="text-3xl sm:text-4xl font-bold text-ccb-accent">50%</div>
              <div className="text-xs sm:text-sm text-ccb-muted mt-2">Prize pool for winners</div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials / Social proof */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4 bg-ccb-surface/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-bold text-center mb-2">Built for Malawian chess</h2>
          <p className="text-sm text-ccb-muted text-center mb-10">Play locally, pay locally, win locally</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="card">
              <div className="flex items-center gap-1 mb-3">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-ccb-accent text-ccb-accent" />
                ))}
              </div>
              <p className="text-sm text-ccb-text mb-4">
                &ldquo;I deposited with Airtel Money and was playing my first tournament in less than 5 minutes. The payouts hit my wallet instantly after winning.&rdquo;
              </p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-ccb-primary/20 flex items-center justify-center text-xs font-bold text-ccb-primary">T</div>
                <span className="text-sm font-medium">Thabo, Blantyre</span>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-1 mb-3">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-ccb-accent text-ccb-accent" />
                ))}
              </div>
              <p className="text-sm text-ccb-text mb-4">
                &ldquo;I created a weekly blitz tournament for my chess club. The 40% creator share means I actually earn from organizing. Game changer.&rdquo;
              </p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-ccb-success/20 flex items-center justify-center text-xs font-bold text-ccb-success">C</div>
                <span className="text-sm font-medium">Chisomo, Lilongwe</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-bold text-center mb-2">Frequently asked questions</h2>
          <p className="text-sm text-ccb-muted text-center mb-8 sm:mb-10">Everything you need to know before you start</p>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <details key={i} className="card group">
                <summary className="flex items-center justify-between cursor-pointer list-none font-medium text-sm sm:text-base">
                  <span>{faq.q}</span>
                  <ChevronDown className="w-4 h-4 text-ccb-muted shrink-0 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="text-sm text-ccb-muted mt-3 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link href="/faq" className="text-sm text-ccb-primary hover:underline">See all FAQs →</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4 bg-ccb-primary/5">
        <div className="max-w-2xl mx-auto text-center">
          <Gamepad2 className="w-10 h-10 text-ccb-primary mx-auto mb-4" />
          <h2 className="text-xl sm:text-3xl font-bold mb-3 sm:mb-4">Ready to battle?</h2>
          <p className="text-sm sm:text-base text-ccb-muted mb-6 sm:mb-8">
            Create your free account. Deposit with mobile money. Start winning prizes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href={`/signup${refParam}`} className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2 w-full sm:w-auto">
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/leaderboard" className="btn-secondary text-base px-8 py-3 w-full sm:w-auto">
              View Rankings
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ccb-border py-6 sm:py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row-reverse items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-ccb-primary flex items-center justify-center shrink-0">
              <span className="text-white text-sm">♞</span>
            </div>
            <span className="text-xs sm:text-sm text-ccb-muted">© 2026 Crazy Chess Battles</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm text-ccb-muted flex-wrap justify-center">
            <Link href="/leaderboard" className="hover:text-ccb-text transition-colors">Leaderboard</Link>
            <Link href="/league" className="hover:text-ccb-text transition-colors">Tournaments</Link>
            <Link href="/how-it-works" className="hover:text-ccb-text transition-colors">How it Works</Link>
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
