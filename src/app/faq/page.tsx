import Link from "next/link";
import { ChevronDown, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const FAQ_SECTIONS = [
  {
    title: "Getting Started",
    questions: [
      {
        q: "Is Crazy Chess Battles free to play?",
        a: "Yes! You can play unlimited casual games and join free tournaments without ever depositing money. Paid tournaments are optional — you only spend money when you choose to enter one.",
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
        a: "Your wallet balance is held securely in the platform. Entry fees for tournaments are locked when you join and refunded automatically if a tournament is cancelled or doesn't meet minimum players.",
      },
      {
        q: "What fees does CCB charge?",
        a: "CCB takes a 10% platform fee on paid tournament entry fees. The remaining 90% is split between the tournament creator (40% by default) and the prize pool (50% by default). There are no deposit or withdrawal fees.",
      },
    ],
  },
  {
    title: "Tournaments",
    questions: [
      {
        q: "How do tournaments work?",
        a: "CCB uses the Swiss tournament format. You play a set number of rounds, and in each round you're paired with someone at a similar score. After all rounds, players are ranked by total score. The top players split the prize pool.",
      },
      {
        q: "What happens if a tournament doesn't get enough players?",
        a: "If a tournament doesn't meet its minimum player count by the start time, it's automatically cancelled and all entry fees are refunded to participants' wallets instantly.",
      },
      {
        q: "Can I create my own tournaments?",
        a: "Yes! Once you meet the eligibility requirements, you can create both free and paid tournaments. You'll earn a 40% profit share of entry fees (after the 10% platform cut). Set your own entry fee, player limits, time controls, and schedule.",
      },
      {
        q: "What are the eligibility requirements to create tournaments?",
        a: "Free tournaments: your account must be at least 3 days old and you must have played 10+ games. Paid tournaments: you need a verified Chess.com account, at least 1 prior mobile money deposit, a 7+ day old account, and 20+ games played.",
      },
      {
        q: "How are prizes distributed?",
        a: "Prizes are distributed automatically when the tournament ends. The standard split is: 1st place 40%, 2nd place 20%, 3rd place 18%, 4th place 12%, 5th place 10%. Winnings are credited to your wallet instantly.",
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
        a: "Bullet (1+0), Blitz (3+0, 5+0), Rapid (10+0), and Classical (30+0). You can also create custom time controls when hosting tournaments.",
      },
      {
        q: "How does matchmaking work?",
        a: "Quick Match pairs you with a player whose rating is close to yours. The system widens the search range if no exact match is found within a few seconds, so you always get a game.",
      },
      {
        q: "Can I play with friends?",
        a: "Yes! Use the 'Challenge' feature to generate a link. Send it to your friend via WhatsApp, SMS, or any messenger. They click the link and the game starts. Choose ranked or casual, with or without stakes.",
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
      {/* Nav */}
      <nav className="border-b border-ccb-border bg-ccb-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-ccb-primary flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm sm:text-lg">♞</span>
            </div>
            <span className="font-bold text-sm sm:text-lg truncate">Crazy Chess Battles</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link href="/league" className="btn-ghost text-sm hidden sm:inline-flex">Tournaments</Link>
            <Link href="/leaderboard" className="btn-ghost text-sm">Leaderboard</Link>
            <Link href="/signup" className="btn-primary text-sm px-3 sm:px-4">Sign up</Link>
          </div>
        </div>
      </nav>

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
              <h2 className="text-base sm:text-lg font-bold mb-4 text-ccb-primary">{section.title}</h2>
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
      <section className="border-t border-ccb-border py-12 px-4 bg-ccb-primary/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-bold mb-3">Still have questions?</h2>
          <p className="text-sm text-ccb-muted mb-6">
            Join the platform and explore — it&apos;s free to start playing.
          </p>
          <Link href="/signup" className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2">
            Get Started <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ccb-border py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row-reverse items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-ccb-primary flex items-center justify-center shrink-0">
              <span className="text-white text-sm">♞</span>
            </div>
            <span className="text-xs sm:text-sm text-ccb-muted">© 2026 Crazy Chess Battles</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm text-ccb-muted flex-wrap justify-center">
            <Link href="/" className="hover:text-ccb-text transition-colors">Home</Link>
            <Link href="/how-it-works" className="hover:text-ccb-text transition-colors">How it Works</Link>
            <Link href="/leaderboard" className="hover:text-ccb-text transition-colors">Leaderboard</Link>
            <Link href="/league" className="hover:text-ccb-text transition-colors">Tournaments</Link>
            <Link href="/about" className="hover:text-ccb-text transition-colors">About</Link>
            <Link href="/terms" className="hover:text-ccb-text transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-ccb-text transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
