import Link from "next/link";
import Image from "next/image";
import {
  Trophy, Swords, TrendingUp, Zap, Crown, ArrowRight, Check, Download,
  Shield, Disc3, GraduationCap, Headphones, Ban,
} from "lucide-react";
import AppBanner from "@/components/layout/app-banner";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { detectCountry, detectCountryCode, formatMembershipPrice, type MarketConfig } from "@/lib/geo/country-detect";
import { currencyForCountry } from "@/lib/geo/currency-map";
import { getExchangeRate, getCurrencySymbol } from "@/lib/geo/fx";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Crazy Chess Battles — Weekly XP Leagues, Tournaments & Chess Community",
  description: "Compete in weekly XP leagues and live chess tournaments with a community of players. Play blitz, bullet, and rapid chess online. Club membership is just $10 a month.",
  path: "/",
});

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  
  // Detect visitor country via IP geolocation
  const headersList = await headers();
  const req = new Request("https://ccb.mw", {
    headers: Object.fromEntries(headersList.entries()),
  });
  const market = await detectCountry(req as any);

  // Convert the membership price to the visitor's local currency using a
  // live exchange rate, instead of always showing it in Malawi Kwacha.
  const visitorCountryCode = await detectCountryCode(req as any);
  const visitorCurrency = currencyForCountry(visitorCountryCode);
  const fxRate = await getExchangeRate(market.currency, visitorCurrency);
  const convertedMembershipPrice = Math.round(market.membershipPrice * fxRate);
  const membershipDisplaySymbol = getCurrencySymbol(visitorCurrency);
  
  // Build signup URL with country + optional ref
  const signupParams = new URLSearchParams();
  signupParams.set("country", market.countryCode);
  if (ref) signupParams.set("ref", ref);
  const signupUrl = `/signup?${signupParams.toString()}`;

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
            <span className="font-bold text-sm sm:text-lg truncate">Crazy Chess Battles</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link href="/league" className="btn-ghost text-sm hidden sm:inline-flex">Compete</Link>
            <Link href="/league" className="btn-ghost text-sm">Leagues</Link>
            <Link href="/download" className="btn-ghost text-sm hidden sm:inline-flex items-center gap-1.5"><Download className="w-3.5 h-3.5" />App</Link>
            <Link href="/how-it-works" className="btn-ghost text-sm hidden sm:inline-flex">How it Works</Link>
            <Link href={signupUrl} className="btn-primary text-sm px-3 sm:px-4">Sign up</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden flex-1 flex items-center justify-center px-4 py-16 sm:py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-ccb-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute -right-20 -top-20 w-72 h-72 bg-ccb-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-3xl text-center relative">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tight mb-4 sm:mb-6 leading-tight">
            Do you think you got it in you?
          </h1>
          <p className="text-base sm:text-lg text-ccb-muted mb-8 sm:mb-10 max-w-2xl mx-auto px-2">
            Play chess, climb the weekly XP leagues, and compete in tournaments with a community that loves the game as much as you do.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4">
            <Link href={signupUrl} className="btn-primary text-base px-8 py-3 w-full sm:w-auto">
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
              <span>Weekly XP leagues</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-ccb-success" />
              <span>Tournaments &amp; community</span>
            </div>
          </div>
        </div>
      </section>

      {/* The Pitch — Why Switch */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4 bg-ccb-surface/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-xl sm:text-3xl font-bold mb-4">You already play chess online. So why are we here?</h2>
          <p className="text-sm sm:text-base text-ccb-muted mb-8 max-w-2xl mx-auto leading-relaxed">
            On other platforms, you grind for rating points that live on a screen. On Crazy Chess Battles, every game earns XP, every week brings a fresh league table to climb, and every tournament takes you closer to the title — in a community that tracks every move.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-left max-w-2xl mx-auto">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ccb-primary/10 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-ccb-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Weekly XP Leagues</h3>
                <p className="text-xs sm:text-sm text-ccb-muted">Every game earns XP — Win 3, Draw 1 — and a fresh league table starts every week.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ccb-accent/10 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4 text-ccb-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Tournaments</h3>
                <p className="text-xs sm:text-sm text-ccb-muted">Swiss and knockout events for every level — compete for titles, trophies and club rewards.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ccb-primary/10 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4 text-ccb-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Premier League</h3>
                <p className="text-xs sm:text-sm text-ccb-muted">A structured competitive season, not just random matchmaking.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ccb-success/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-ccb-success" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Season Rankings</h3>
                <p className="text-xs sm:text-sm text-ccb-muted">Every game counts toward your season standing.</p>
              </div>
            </div>
          </div>
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
              <p className="text-sm text-ccb-muted">Compete in qualifier tournaments. Win matches, climb the bracket, and earn your qualification spot.</p>
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
              <p className="text-sm text-ccb-muted">Climb the standings, accumulate season points, and fight for the championship title. Top players earn glory and the championship title.</p>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link href={signupUrl} className="btn-primary inline-flex items-center gap-2">
              Start Your Journey <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Draughts as accessory */}
      <section className="border-t border-ccb-border py-8 px-4 bg-ccb-surface/30">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs sm:text-sm text-ccb-muted">
            <Disc3 className="w-3.5 h-3.5 inline mr-1.5 text-ccb-accent" />
            Also featuring Draughts — because a great mind deserves more than one battlefield.
          </p>
        </div>
      </section>

      {/* Membership */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-ccb-primary/30 bg-ccb-primary/10 px-4 py-1.5 mb-6">
            <Crown className="w-4 h-4 text-ccb-primary" />
            <span className="text-xs sm:text-sm text-ccb-primary font-semibold">Crazy Chess Battles Club</span>
          </div>
          <h2 className="text-xl sm:text-3xl font-bold mb-4">Join the Club, Kill the Ads</h2>
          <p className="text-sm sm:text-base text-ccb-muted mb-8 max-w-2xl mx-auto">
            One flat membership — just $10 a month ({formatMembershipPrice(convertedMembershipPrice, membershipDisplaySymbol)} in your local currency) — for a completely ad-free experience. Your membership powers the weekly XP leagues, tournaments and community events.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-left max-w-2xl mx-auto mb-8">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ccb-primary/10 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4 text-ccb-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">You Power the Club</h3>
                <p className="text-xs sm:text-sm text-ccb-muted">Your $10 membership funds the weekly XP league rewards, tournaments and community events for everyone.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ccb-accent/10 flex items-center justify-center shrink-0">
                <GraduationCap className="w-4 h-4 text-ccb-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">First Look at New Perks</h3>
                <p className="text-xs sm:text-sm text-ccb-muted">Member-only features land in your account first as the Club grows.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ccb-success/10 flex items-center justify-center shrink-0">
                <Headphones className="w-4 h-4 text-ccb-success" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">No Lost Days</h3>
                <p className="text-xs sm:text-sm text-ccb-muted">Renew anytime — extra days stack on top of your current membership, never restart it.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-ccb-primary/10 flex items-center justify-center shrink-0">
                <Ban className="w-4 h-4 text-ccb-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">No Ads</h3>
                <p className="text-xs sm:text-sm text-ccb-muted">A clean, distraction-free experience. Nothing between you and the board.</p>
              </div>
            </div>
          </div>

          <Link href="/membership" className="btn-primary inline-flex items-center gap-2">
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
          <Link href={signupUrl} className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2">
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ccb-border py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={24} height={24} className="w-6 h-6 rounded-full" />
            <span className="font-bold text-sm">Crazy Chess Battles</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm text-ccb-muted">
            <Link href="/league" className="hover:text-ccb-text transition-colors">Compete</Link>
            <Link href="/league" className="hover:text-ccb-text transition-colors">Leagues</Link>
            <Link href="/how-it-works" className="hover:text-ccb-text transition-colors">How it Works</Link>
            <span>·</span>
            <Link href="/dashboard" className="hover:text-ccb-text transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
      <AppBanner />
    </div>
  );
}
