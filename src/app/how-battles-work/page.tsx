import Link from "next/link";
import Image from "next/image";
import {
  Wallet, Swords, Clock, Trophy, Zap, Timer, EyeOff,
  Scale, TrendingUp, ArrowRight,
} from "lucide-react";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "How Battles Work — Staked Chess Matches Explained",
  description: "The complete guide to Crazy Chess Battles: how stakes lock in escrow, the 2-minute join window, payouts, armageddon draw deciders, no-show rules, and how battles earn Elo and League XP.",
  path: "/how-battles-work",
});

const SECTIONS = [
  {
    icon: Wallet,
    title: "Stake & Lock",
    body: "Both players lock the same stake from their wallets before the game starts. Your stake always displays in your own currency — the amounts match exactly, no matter where each player is.",
  },
  {
    icon: Swords,
    title: "Find Your Opponent",
    body: "Two ways to battle: Quick Match pairs you with a waiting opponent instantly, or send a Challenge link to a friend or group. Unaccepted challenges auto-refund your stake.",
  },
  {
    icon: Clock,
    title: "The Join Window",
    body: "When the game is created, the clock stays frozen for up to 2 minutes while both players get to the board. The game starts the moment you're both there — your stake can never burn on a game you didn't know had started.",
  },
  {
    icon: Trophy,
    title: "Winner Takes the Pot",
    body: "Both stakes form the pot. The winner takes it minus a small 5% platform fee, and the payout lands in your wallet automatically the second the game ends.",
  },
  {
    icon: Zap,
    title: "Choose Your Speed",
    body: "Bullet 1+0, Blitz 3+2, Blitz 5+0, Rapid 10+0, Rapid 15+10, or Classical 30+0 — pick the time control that suits your style.",
  },
  {
    icon: Timer,
    title: "No-Shows Settle Fairly",
    body: "After the join window, you have 2 minutes to make your first move. Miss it and the battle settles against you — but only once the game has genuinely started with both players present.",
  },
  {
    icon: EyeOff,
    title: "Stay at the Board",
    body: "Going silent for more than 2 minutes mid-game counts as an automatic resignation and the battle settles normally. Close the tab when you're ready to concede — don't just disappear.",
  },
  {
    icon: Scale,
    title: "Draws Get Settled Fair",
    body: "A drawn battle triggers an Armageddon decider — white gets more time, but a draw counts for black. Three draws in a row and both stakes are refunded. And per FIDE rule 6.9, a timeout against insufficient mating material is a draw, not a win — no cheap victories on a bare king.",
  },
  {
    icon: TrendingUp,
    title: "Every Battle Counts",
    body: "Battles are Elo-rated AND earn League XP — Win 3 / Draw 1 / Loss 0 — toward your weekly League rewards, alongside normal games.",
  },
];

export default function HowBattlesWorkPage() {
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
            <Link href="/battles" className="btn-ghost text-sm hidden sm:inline-flex">Battles</Link>
            <Link href="/signup" className="btn-primary text-sm px-3 sm:px-4">Sign up</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 py-12 sm:py-16 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
            How <span className="text-ccb-primary">Battles</span> work
          </h1>
          <p className="text-sm sm:text-lg text-ccb-muted">
            Everything about staked matches on Crazy Chess Battles — from locking your stake to getting paid. Stake what you can afford. Play hard.
          </p>
        </div>
      </section>

      {/* Sections */}
      <section className="px-4 pb-8">
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {SECTIONS.map((s, i) => (
            <div key={s.title} className="p-5 sm:p-6 rounded-2xl border border-ccb-border bg-ccb-surface/50 flex items-start gap-4 sm:gap-5">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-ccb-primary/10 flex items-center justify-center shrink-0">
                <s.icon className="w-5 h-5 sm:w-6 sm:h-6 text-ccb-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-ccb-muted text-xs font-mono mb-1">{String(i + 1).padStart(2, "0")}</div>
                <h2 className="text-base sm:text-lg font-bold mb-1.5">{s.title}</h2>
                <p className="text-sm text-ccb-muted leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-12 sm:py-16 text-center border-t border-ccb-border mt-8">
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">Ready to battle?</h2>
          <p className="text-sm text-ccb-muted mb-6">
            Lock your stake, find an opponent, and play for the pot.
          </p>
          <Link
            href="/battles"
            className="btn-primary inline-flex items-center gap-2 text-base px-6 py-3.5"
          >
            <Swords className="w-5 h-5" /> Find a Battle <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
