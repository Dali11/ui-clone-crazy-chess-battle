import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Trophy, Zap, Shield, Users, Heart, Quote, BookOpen, Disc3, Crown } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "About — Competitive Chess for Everyone",
  description: "Crazy Chess Battles is a global chess competition platform where players of all levels battle in tournaments, leagues, and ranked matches. Learn our story and mission.",
  alternates: { canonical: "https://crazychessbattles.live/about" },
};

export default function AboutPage() {
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
            <Link href="/leaderboard" className="btn-ghost text-sm">Leaderboard</Link>
            <Link href="/signup" className="btn-primary text-sm px-3 sm:px-4">Sign up</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 py-12 sm:py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
            Chess is <span className="text-ccb-primary">everyone&apos;s</span> game
          </h1>
          <p className="text-sm sm:text-lg text-ccb-muted leading-relaxed">
            Crazy Chess Battles was built for one reason: to give chess players a place to compete,
            earn, and grow — without needing a credit card or a foreign bank account.
          </p>
          <p className="text-sm sm:text-lg text-ccb-muted leading-relaxed mt-4">
            Deposit with mobile money. Play opponents at your level. Win tournaments and get paid
            to your phone. Simple as that.
          </p>
        </div>
      </section>

      {/* Founder's Story */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-20 bg-ccb-surface/30">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-ccb-border bg-ccb-card px-4 py-1.5 mb-4">
              <Quote className="w-3.5 h-3.5 text-ccb-accent" />
              <span className="text-xs sm:text-sm text-ccb-muted">A note from the founder</span>
            </div>
            <h2 className="text-lg sm:text-2xl font-bold">Why I built Crazy Chess Battles</h2>
          </div>

          <div className="space-y-4 text-sm text-ccb-muted leading-relaxed">
            <p>
              Hi, my name is Arthur Chibondo, and I learned how to play chess in 2017 when I was in Form 3
              at Zomba Catholic Secondary School.
            </p>
            <p>
              I was not a very good player, but I loved the game such that given the opportunity I was playing.
            </p>
            <p>
              The first time I played online chess was in 2022 when I joined chess.com, and I loved the whole
              experience.
            </p>
            <p>
              In 2025, I found myself spending too much time playing chess on my phone, such that I once searched
              for the concept of chess addiction because I felt addicted.
            </p>

            <blockquote className="border-l-2 border-ccb-primary pl-4 py-2 my-6 space-y-1 italic text-ccb-text/80">
              <p>&ldquo;Do you go to tournaments?&rdquo;</p>
              <p>&ldquo;You are always on chess!&rdquo;</p>
              <p>&ldquo;You have 5 chess apps? Damn!&rdquo;</p>
              <p>&ldquo;Are you that good at chess?&rdquo;</p>
              <p>&ldquo;Did you play in the Vice Chancellor&apos;s Trophy?&rdquo;</p>
            </blockquote>

            <p>People would ask me.</p>
            <p>But no.</p>
            <p>I have never been so good at chess to compete at the big stage.</p>

            <p className="text-ccb-text font-medium">
              Which is why I created Crazy Chess Battles.
            </p>

            <p>
              So that I could find people like me who were willing to join a battle, and compete in a tournament.
            </p>
            <p>
              Today, Crazy Chess Battles is more than just battles — it&apos;s a full competitive ecosystem with Swiss qualifiers, a Premier League, season rankings, and real cash prizes. We&apos;re building the future of competitive chess, one match at a time.
            </p>

            <p>
              Crazy Chess Battles features both free and paid tournaments, which means, instead of just playing
              for free, players can earn money by doing what they love.
            </p>

            <p className="text-lg font-semibold text-ccb-text">Chess.</p>

            <p>
              When I first floated this idea to my friend, they said it was too complicated to work.
            </p>
            <p>But I said bring it on.</p>
            <p>I love me a good challenge.</p>

            <p className="text-lg font-semibold text-ccb-text">
              Chess is fun when it&apos;s crazy.
            </p>
            <p className="text-lg font-semibold text-ccb-text">
              Chess is fun when it makes your blood boil.
            </p>

            <p>
              Join a chess battle today, and I promise you, you will never quit until you become a general.
            </p>

            <p>I will see you in the lobby.</p>

            <p className="text-base font-medium text-ccb-text">
              Cheers ❤️⚔️
            </p>

            <div className="flex items-center gap-2 pt-4 border-t border-ccb-border mt-6">
              <div className="w-8 h-8 rounded-full bg-ccb-primary/20 flex items-center justify-center text-xs font-bold text-ccb-primary">A</div>
              <div>
                <div className="text-sm font-medium text-ccb-text">Arthur Chibondo</div>
                <div className="text-xs text-ccb-muted">Founder & CEO, Crazy Chess Battles</div>
              </div>
            </div>

            {/* Read full story button */}
            <div className="pt-4">
              <a
                href="https://apmchibondo.blog/articles/why-i-built-crazy-chess-battles"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-ccb-border bg-ccb-card px-5 py-2.5 text-sm font-medium text-ccb-text transition-colors hover:border-ccb-primary hover:bg-ccb-primary/5"
              >
                <BookOpen className="w-4 h-4 text-ccb-primary" />
                Read the full story on the blog
                <ArrowRight className="w-3.5 h-3.5 text-ccb-muted" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-lg sm:text-xl font-bold text-center mb-8 sm:mb-10">What we stand for</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="card">
              <Zap className="w-6 h-6 text-ccb-primary mb-3" />
              <h3 className="font-semibold mb-2 text-sm">Mobile money payments</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">
                Built around mobile money — the way players actually pay. No PayPal, no Stripe, no friction.
              </p>
            </div>
            <div className="card">
              <Trophy className="w-6 h-6 text-ccb-accent mb-3" />
              <h3 className="font-semibold mb-2 text-sm">Real competition</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">
                Glicko-2 ratings, Swiss tournaments, ranked games. Fair matchmaking that respects your skill level.
              </p>
            </div>
            <div className="card">
              <Shield className="w-6 h-6 text-ccb-success mb-3" />
              <h3 className="font-semibold mb-2 text-sm">Transparent economics</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">
                10% platform fee, 40% to tournament creators, 50% to the prize pool. Every cent is accounted for.
              </p>
            </div>
            <div className="card">
              <Crown className="w-6 h-6 text-ccb-primary mb-3" />
              <h3 className="font-semibold mb-2 text-sm">Competitive pipeline</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">
                From casual games to Swiss qualifiers to Premier League to Season Champion. A real path from your first game to the title.
              </p>
            </div>
            <div className="card">
              <Users className="w-6 h-6 text-ccb-primary mb-3" />
              <h3 className="font-semibold mb-2 text-sm">Community-owned</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">
                Players can create their own tournaments, earn from organizing, and build their own chess communities.
              </p>
            </div>
            <div className="card">
              <Disc3 className="w-6 h-6 text-ccb-accent mb-3" />
              <h3 className="font-semibold mb-2 text-sm">Draughts too</h3>
              <p className="text-xs sm:text-sm text-ccb-muted">
                Not just chess — play International draughts on the side. Same wallet, same community.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ccb-border py-12 sm:py-20 px-4 bg-ccb-primary/5">
        <div className="max-w-2xl mx-auto text-center">
          <Heart className="w-8 h-8 text-ccb-accent mx-auto mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold mb-3">Join the community</h2>
          <p className="text-sm text-ccb-muted mb-6">
            Whether you&apos;re a casual player or a tournament organizer, there&apos;s a place for you at CCB.
          </p>
          <Link href="/signup" className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2">
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ccb-border py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row-reverse items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={24} height={24} className="w-6 h-6 rounded-full shrink-0" />
            <span className="text-xs sm:text-sm text-ccb-muted">© 2026 Crazy Chess Battles</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm text-ccb-muted flex-wrap justify-center">
            <Link href="/" className="hover:text-ccb-text transition-colors">Home</Link>
            <Link href="/how-it-works" className="hover:text-ccb-text transition-colors">How it Works</Link>
            <Link href="/leaderboard" className="hover:text-ccb-text transition-colors">Leaderboard</Link>
            <Link href="/league" className="hover:text-ccb-text transition-colors">Tournaments</Link>
            <Link href="/faq" className="hover:text-ccb-text transition-colors">FAQ</Link>
            <Link href="/about" className="hover:text-ccb-text transition-colors">About</Link>
            <Link href="/privacy" className="hover:text-ccb-text transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-ccb-text transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
