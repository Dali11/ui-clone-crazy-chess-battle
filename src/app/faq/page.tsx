import Link from "next/link";
import { ChevronDown, ArrowRight } from "lucide-react";
import PublicHomeNav from "@/components/layout/public-home-nav";
import PublicSiteFooter from "@/components/layout/public-site-footer";

export const dynamic = "force-dynamic";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "FAQ — How Crazy Chess Battles Works",
  description: "Get answers to common questions about Crazy Chess Battles: how tournaments work, weekly XP leagues, membership, ratings, game rules, and more.",
  path: "/faq",
});

const FAQ_SECTIONS = [
  {
    title: "Getting Started",
    questions: [
      {
        q: "Is Crazy Chess Battles free to play?",
        a: "Yes! You can play unlimited casual games and join free tournaments forever. Club membership ($10 a month) is optional and unlocks the ad-free experience plus the weekly XP league rewards.",
      },
      {
        q: "Do I need a Chess.com account?",
        a: "No, but we recommend it. Linking your Chess.com account during signup auto-imports your rating and gives you a verified badge. You can also play with a self-selected skill level (Beginner, Casual, or Advanced) instead.",
      },
      {
        q: "What devices does CCB work on?",
        a: "CCB works on any device with a modern web browser — phone, tablet, or computer. The board is fully optimized for touch (tap-to-select, tap-to-move) and for mouse/trackpad.",
      },
      {
        q: "How long does signup take?",
        a: "Less than 2 minutes. Pick a username, enter your email, choose your skill level, and set a password. That's it.",
      },
    ],
  },
  {
    title: "Deposits & Withdrawals",
    questions: [
      {
        q: "How do I deposit money?",
        a: "Go to your Wallet page, enter your phone number and the amount, and choose your operator (TNM Mpamba or Airtel Money). You'll receive a prompt on your phone to authorize the payment. Your wallet updates instantly once authorized.",
      },
      {
        q: "How do I withdraw my winnings?",
        a: "Go to your Wallet page and tap 'Withdraw'. Enter the amount and your phone number. The money is sent to your mobile money account. There's no minimum withdrawal amount and no waiting period.",
      },
      {
        q: "Is my money safe on CCB?",
        a: "Your account balance is held securely by the platform. Tournament entries are recorded when you join and released automatically if a tournament is cancelled or doesn't meet minimum players.",
      },
      {
        q: "What fees does CCB charge?",
        a: "The platform is funded by a simple $10 monthly membership — that's what keeps the weekly XP leagues, tournaments and community rewards running. There are no deposit or withdrawal fees.",
      },
    ],
  },
  {
    title: "Tournaments",
    questions: [
      {
        q: "How do tournaments work?",
        a: "CCB uses the Swiss tournament format. You play a set number of rounds, and in each round you're paired with someone at a similar score. After all rounds, players are ranked by total score. Your final ranking earns you titles, trophies and club rewards.",
      },
      {
        q: "What happens if a tournament doesn't get enough players?",
        a: "If a tournament doesn't meet its minimum player count by the start time, it's automatically cancelled and everyone is notified instantly.",
      },
      {
        q: "Can I create my own tournaments?",
        a: "Yes! Once you meet the eligibility requirements, you can create your own tournaments and host them for the community. Set your own format, player limits, time controls, and schedule.",
      },
      {
        q: "What are the eligibility requirements to create tournaments?",
        a: "Free tournaments: your account must be at least 3 days old and you must have played 10+ games. Larger events: you need a verified Chess.com account, a 7+ day old account, and 20+ games played.",
      },
      {
        q: "How do league rewards work?",
        a: "Every game earns you League XP (Win 3, Draw 1, Loss 0) toward the weekly XP league table. When the week ends, top finishers receive club rewards credited to their account automatically. Your membership of $10 a month funds the reward pools.",
      },
    ],
  },
  {
    title: "Gameplay & Rating",
    questions: [
      {
        q: "What rating system does CCB use?",
        a: "We use the Glicko-2 rating system — the same algorithm Chess.com uses. Your rating adjusts after every rated game based on your opponent's rating and the result. Unrated games (vs computer) don't affect your rating.",
      },
      {
        q: "What time controls are available?",
        a: "The default time control for casual play and battles is 15+10 (15 minutes + 10 seconds increment). Tournaments can also use Bullet (1+0), Blitz (3+0, 5+0), Rapid (10+0), and Classical (30+0). You can set custom time controls when hosting tournaments.",
      },
      {
        q: "How does matchmaking work?",
        a: "Quick Match pairs you with a player whose rating is close to yours. The system widens the search range if no exact match is found within a few seconds, so you always get a game.",
      },
      {
        q: "Can I play with friends?",
        a: "Yes! Use the 'Challenge' feature to generate a link. Send it to your friend via WhatsApp, SMS, or any messenger. They click the link and the game starts. Choose ranked or casual.",
      },
    ],
  },
  {
    title: "Account & Security",
    questions: [
      {
        q: "How do I reset my password?",
        a: "Click 'Forgot password' on the login page. Enter your email and we'll send you a reset link. The link expires after 1 hour for security.",
      },
      {
        q: "Can I change my username?",
        a: "Usernames are permanent once chosen. Choose carefully during signup — this is how other players see you on the platform.",
      },
      {
        q: "Is my personal information safe?",
        a: "We only store what's needed to run the platform: your username, email, and chess rating. Phone numbers are used only for mobile money deposits and withdrawals. We never share your data with third parties.",
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHomeNav signupUrl="/signup" />

      {/* Hero */}
      <section className="px-4 py-10 sm:py-16 text-center">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">Frequently asked questions</h1>
        <p className="text-sm text-ccb-muted max-w-xl mx-auto">
          Everything about playing, depositing, tournaments, and getting paid on CCB.
        </p>
      </section>

      {/* FAQ Sections */}
      <section className="px-4 pb-16 flex-1">
        <div className="max-w-2xl mx-auto space-y-10">
          {FAQ_SECTIONS.map((section, si) => (
            <div key={si}>
              <h2 className="text-base sm:text-lg font-bold mb-4 text-emerald-300">{section.title}</h2>
              <div className="space-y-3">
                {section.questions.map((faq, qi) => (
                  <details key={qi} className="card group">
                    <summary className="flex items-center justify-between cursor-pointer list-none font-medium text-sm sm:text-base">
                      <span>{faq.q}</span>
                      <ChevronDown className="w-4 h-4 text-ccb-muted shrink-0 group-open:rotate-180 transition-transform" />
                    </summary>
                    <p className="text-sm text-ccb-muted mt-3 leading-relaxed">{faq.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ccb-border py-12 px-4 bg-emerald-400/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-bold mb-3">Still have questions?</h2>
          <p className="text-sm text-ccb-muted mb-6">
            Join the platform and explore — it&apos;s free to start playing.
          </p>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-8 py-3 text-base font-black text-slate-950 shadow-[0_0_18px_rgba(16,230,143,.22)] transition hover:brightness-110 items-center gap-2">
            Get Started <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <PublicSiteFooter />
    </div>
  );
}
