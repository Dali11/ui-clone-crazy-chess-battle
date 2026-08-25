import Link from "next/link";
import Image from "next/image";
import {
  Trophy, Swords, TrendingUp, Zap, Crown, ArrowRight, Check,
  Users, Smartphone, Shield, Star, Gamepad2, Disc3,
} from "lucide-react";
import HomeStats from "./home-stats";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

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
      {/* Nav */}
      <nav className="border-b border-ccb-border bg-ccb-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-2 min-w-0">
            <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={32} height={32} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full shrink-0" />
            <span className="font-bold text-sm sm:text-lg truncate">CrazyChess</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link href="/league" className="btn-ghost text-sm hidden sm:inline-flex">Compete</Link>
            <Link href="/leaderboard" className="btn-ghost text-sm">Ranks</Link>
            <Link href="/draughts" className="btn-ghost text-sm hidden sm:inline-flex">Draughts</Link>
            <Link href="/how-it-works" className="btn-ghost text-sm hidden sm:inline-flex">How it Works</Link>
            <Link href={`/signup${refParam}`} className="btn-primary text-sm px-3 sm:px-4">Sign up</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden flex-1 flex items-center justify-center px-4 py-16 sm:py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-ccb-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute -right-20 -top-20 w-72 h-72 bg-ccb-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-3xl text-center relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-ccb-border bg-ccb-card px-3 sm:px-4 py-1.5 mb-6">
            <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-ccb-accent shrink-0" />
            <span className="text-xs sm:text-sm text-ccb-muted">Chess · Draughts · Swiss Qualifiers · Premier League · Championships</span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tight mb-4 sm:mb-6 leading-tight">
            Play. Compete. <span className="text-ccb-primary">Climb.</span>
          </h1>
          <p className="text-xl sm:text-2xl font-bold text-ccb-accent mb-6 sm:mb-8 tracking-wide">
            Become Champion.
          </p>
          <p className="text-base sm:text-lg text-ccb-muted mb-8 sm:mb-10 max-w-2xl mx-auto px-2">
            Malawi&apos;s competitive chess and draughts arena. Play casual battles, qualify through Swiss tournaments, earn your place in the Premier League, and climb the rankings to become champion.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4">
            <Link href={`/signup${refParam}`} className="btn-primary text-base px-8 py-3 w-full sm:w-auto">
              Start Playing Free
            </Link>
            <Link href="/league" className="btn-secondary text-base px-8 py-3 w-full sm:w-auto">
              View Competitions
            </Link>
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-6 mt-8 sm:mt-10 text-xs sm:text-sm text-ccb-muted flex-wrap">
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>Free to join</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>Glicko-2 ratings</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>Real prizes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>Chess &amp; Draughts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>Mobile money</span>
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

      {/* Competitive Pipeline */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-bold text-center mb-2">Your Path to Champion</h2>
          <p className="text-sm text-ccb-muted text-center mb-10 sm:mb-12">Three stages from first game to championship title</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-ccb-accent/10 flex items-center justify-center mx-auto mb-4">
                <Swords className="w-7 h-7 text-ccb-accent" />
              </div>
              <div className="text-ccb-muted text-sm font-mono mb-2">Stage 01</div>
              <h3 className="font-semibold mb-2">Qualify</h3>
              <p className="text-sm text-ccb-muted">Compete in Swiss qualifier tournaments. Win matches, climb the bracket, and earn your qualification spot.</p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-ccb-primary/10 flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-7 h-7 text-ccb-primary" />
              </div>
              <div className="text-ccb-muted text-sm font-mono mb-2">Stage 02</div>
              <h3 className="font-semibold mb-2">Compete</h3>
              <p className="text-sm text-ccb-muted">Enter the Premier League. Play weekly fixtures against other qualified players. Earn points with every win.</p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-ccb-success/10 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-7 h-7 text-ccb-success" />
              </div>
              <div className="text-ccb-muted text-sm font-mono mb-2">Stage 03</div>
              <h3 className="font-semibold mb-2">Climb</h3>
              <p className="text-sm text-ccb-muted">Climb the standings, accumulate season points, and fight for the championship title. Top players earn glory and prizes.</p>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link href={`/signup${refParam}`} className="btn-primary inline-flex items-center gap-2">
              Start Your Journey <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4 bg-ccb-surface/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl sm:text-3xl font-bold text-center mb-8 sm:mb-10">Why CrazyChess?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="card card-hover">
              <Swords className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-primary mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Real-Time Battles</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Blitz, bullet, or rapid chess against opponents matched to your skill level.</p>
            </div>
            <div className="card card-hover">
              <Disc3 className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-accent mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Draughts Arena</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">International, English, and Russian draughts on 8×8. Play vs computer or challenge friends online.</p>
            </div>
            <div className="card card-hover">
              <Trophy className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-accent mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Swiss Qualifiers</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Compete in structured Swiss tournaments with Buchholz tiebreakers. Earn your place in the Premier League.</p>
            </div>
            <div className="card card-hover">
              <Crown className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-primary mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Premier League</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Round-robin league with football-style scoring. 3 points for a win, 1 for a draw. Climb the table.</p>
            </div>
            <div className="card card-hover">
              <TrendingUp className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-success mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Season Rankings</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Accumulate season points across all competitions. Track your progress on the official CrazyChess rankings.</p>
            </div>
            <div className="card card-hover">
              <Smartphone className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-accent mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Mobile Money</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">Deposit and withdraw via TNM Mpamba or Airtel Money. Instant payouts to your wallet.</p>
            </div>
            <div className="card card-hover">
              <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-ccb-primary mb-3 sm:mb-4" />
              <h3 className="font-semibold mb-2 text-sm sm:text-base">Glicko-2 Ratings</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">The same rating algorithm used by Chess.com. Your rating adjusts after every rated game.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Membership Teaser */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-ccb-primary/30 bg-ccb-primary/10 px-4 py-1.5 mb-6">
            <Crown className="w-4 h-4 text-ccb-primary" />
            <span className="text-xs sm:text-sm text-ccb-primary font-semibold">CrazyChess Club</span>
          </div>
          <h2 className="text-xl sm:text-3xl font-bold mb-4">Unlock Premium Competitions</h2>
          <p className="text-sm sm:text-base text-ccb-muted mb-6 max-w-2xl mx-auto">
            Join the CrazyChess Club for MK5,000/month to access premium Premier League divisions, priority qualifier entry, season rankings, and exclusive championship events. Membership is configurable per country as we expand across Africa.
          </p>
          <Link href="/league/subscribe" className="btn-primary inline-flex items-center gap-2">
            <Crown className="w-4 h-4" /> View Membership Plans
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4 bg-gradient-to-b from-transparent to-ccb-primary/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-xl sm:text-3xl font-bold mb-4">Ready to Compete?</h2>
          <p className="text-sm sm:text-base text-ccb-muted mb-6">
            Sign up free, play your first game in under 2 minutes, and start your journey to becoming champion.
          </p>
          <Link href={`/signup${refParam}`} className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2">
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ccb-border py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={24} height={24} className="w-6 h-6 rounded-full" />
            <span className="font-bold text-sm">CrazyChess</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm text-ccb-muted">
            <Link href="/league" className="hover:text-ccb-text transition-colors">Compete</Link>
            <Link href="/leaderboard" className="hover:text-ccb-text transition-colors">Ranks</Link>
            <Link href="/draughts" className="hover:text-ccb-text transition-colors">Draughts</Link>
            <Link href="/how-it-works" className="hover:text-ccb-text transition-colors">How it Works</Link>
            <Link href="/about" className="hover:text-ccb-text transition-colors">About</Link>
            <Link href="/faq" className="hover:text-ccb-text transition-colors">FAQ</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
