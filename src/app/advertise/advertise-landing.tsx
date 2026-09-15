import Link from "next/link";
import Image from "next/image";
import {
  Megaphone,
  MousePointerClick,
  Eye,
  Crosshair,
  BarChart3,
  ShieldCheck,
  BadgeCheck,
  ArrowRight,
} from "lucide-react";

/**
 * Public /advertise landing for logged-out visitors — sells the
 * self-serve ad offer and funnels to signup. Pricing comes live from
 * the admin-configured platform settings.
 */
export default function AdvertiseLanding({
  pricePerWeekMwk,
  enabled,
}: {
  pricePerWeekMwk: number;
  enabled: boolean;
}) {
  const price = (w: number) => w * pricePerWeekMwk;
  const mk = (n: number) => `MK${n.toLocaleString()}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-ccb-border bg-ccb-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Image
              src="/logo-badge.png"
              alt="Crazy Chess Battles"
              width={32}
              height={32}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full shrink-0"
            />
            <span className="font-bold text-sm sm:text-lg truncate">
              Crazy Chess Battles
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link href="/how-battles-work" className="btn-ghost text-sm hidden sm:inline-flex">
              How it works
            </Link>
            <Link href="/login" className="btn-ghost text-sm">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary text-sm px-3 sm:px-4">
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 pt-14 sm:pt-20 pb-10 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-ccb-primary/30 bg-ccb-primary/10 px-4 py-1.5 mb-5">
            <Megaphone className="w-4 h-4 text-ccb-primary" />
            <span className="text-xs sm:text-sm text-ccb-primary font-semibold">
              Advertise on Crazy Chess Battles
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4 leading-tight">
            Put your business in front of{" "}
            <span className="text-ccb-primary">thousands of engaged players</span>
          </h1>
          <p className="text-sm sm:text-lg text-ccb-muted leading-relaxed">
            Your banner runs inside the app where players check their matches, leagues and
            tournaments every day. Flat weekly rates — no bidding, no auction, no surprises.
          </p>
          {enabled ? (
            <Link
              href="/signup"
              className="btn-primary inline-flex items-center gap-2 mt-6 px-6 py-3 text-sm sm:text-base font-bold"
            >
              Start your campaign <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <p className="mt-6 text-sm text-ccb-muted">
              Ad slots open periodically — sign up to get first access.
            </p>
          )}
        </div>
      </section>

      {/* Sample ad preview */}
      <section className="px-4 pb-12 sm:pb-16">
        <div className="max-w-md mx-auto">
          <p className="text-[10px] uppercase tracking-widest text-ccb-muted/60 mb-1 text-center">
            Your ad, as players see it
          </p>
          <div className="w-full overflow-hidden rounded-lg border border-ccb-border bg-ccb-surface">
            <div className="w-full h-24 sm:h-28 flex items-center justify-center bg-gradient-to-br from-ccb-primary/20 via-ccb-primary/5 to-transparent">
              <p className="text-xs sm:text-sm font-semibold text-ccb-muted">
                Your banner image
              </p>
            </div>
            <div className="px-3 py-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ccb-text truncate">
                  Your headline goes here
                </p>
                <p className="text-[11px] text-ccb-muted truncate">
                  Supporting line for your offer
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-bold text-ccb-primary">Visit →</span>
            </div>
          </div>
        </div>
      </section>

      {/* Why advertise */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16 bg-ccb-surface/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-lg sm:text-2xl font-bold text-center mb-8">
            Why businesses advertise with us
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                icon: Crosshair,
                title: "Targeted reach",
                text: "Show your ad only in Malawi, Zambia or Kenya — to men, women, or everyone.",
              },
              {
                icon: BarChart3,
                title: "Live stats",
                text: "Watch impressions and clicks grow in real time from your campaign dashboard.",
              },
              {
                icon: MousePointerClick,
                title: "Flat weekly pricing",
                text: "One flat rate per week. No bidding wars, no CPM math, no hidden fees.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-ccb-border bg-ccb-card p-5 text-center"
              >
                <f.icon className="w-6 h-6 text-ccb-primary mx-auto mb-3" />
                <p className="text-sm font-semibold mb-1.5">{f.title}</p>
                <p className="text-xs text-ccb-muted leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      {enabled && (
        <section className="border-t border-ccb-border px-4 py-12 sm:py-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-lg sm:text-2xl font-bold text-center mb-2">
              Flat weekly rates
            </h2>
            <p className="text-xs sm:text-sm text-ccb-muted text-center mb-8">
              Your banner serves in ad slots across the whole app for the full run.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { weeks: 1, label: "1 week" },
                { weeks: 2, label: "2 weeks" },
                { weeks: 4, label: "4 weeks", best: true },
              ].map((p) => (
                <div
                  key={p.weeks}
                  className={`rounded-xl border p-6 text-center ${
                    p.best
                      ? "border-ccb-primary bg-ccb-primary/5"
                      : "border-ccb-border bg-ccb-card"
                  }`}
                >
                  {p.best && (
                    <span className="inline-block rounded-full bg-ccb-primary text-ccb-primary-foreground text-[10px] font-bold px-2.5 py-0.5 mb-3">
                      Best value
                    </span>
                  )}
                  <p className="text-sm text-ccb-muted mb-1">{p.label}</p>
                  <p className="text-xl sm:text-2xl font-bold mb-1">{mk(price(p.weeks))}</p>
                  <p className="text-[11px] text-ccb-muted mb-4">
                    {mk(pricePerWeekMwk)} / week
                  </p>
                  <Link
                    href="/signup"
                    className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold ${
                      p.best
                        ? "bg-ccb-primary text-ccb-primary-foreground"
                        : "border border-ccb-border text-ccb-text hover:border-ccb-primary/50"
                    }`}
                  >
                    Get started
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16 bg-ccb-surface/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-lg sm:text-2xl font-bold text-center mb-8">How it works</h2>
          <div className="space-y-4">
            {[
              {
                n: 1,
                title: "Create an account",
                text: "Sign up in under a minute — mobile money users are right at home.",
              },
              {
                n: 2,
                title: "Build your campaign",
                text: "Upload your banner, write your headline, set your destination link and pick your audience.",
              },
              {
                n: 3,
                title: "We review it — then it goes live",
                text: "Our team checks every ad (usually same day). Once approved, it serves across the app and your stats start rolling.",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="flex gap-4 rounded-xl border border-ccb-border bg-ccb-card p-4 sm:p-5"
              >
                <span className="w-8 h-8 shrink-0 rounded-full bg-ccb-primary/10 text-ccb-primary font-bold text-sm flex items-center justify-center">
                  {s.n}
                </span>
                <div>
                  <p className="text-sm font-semibold mb-1">{s.title}</p>
                  <p className="text-xs sm:text-sm text-ccb-muted leading-relaxed">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust + final CTA */}
      <section className="border-t border-ccb-border px-4 py-12 sm:py-16 text-center">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-center gap-5 sm:gap-8 mb-8 text-ccb-muted">
            <div className="flex flex-col items-center gap-1">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-[10px] sm:text-xs">Human-reviewed ads</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Eye className="w-5 h-5" />
              <span className="text-[10px] sm:text-xs">Transparent stats</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <BadgeCheck className="w-5 h-5" />
              <span className="text-[10px] sm:text-xs">Quality placements</span>
            </div>
          </div>
          <h2 className="text-lg sm:text-2xl font-bold mb-3">
            Ready to reach the community?
          </h2>
          <p className="text-sm text-ccb-muted mb-6">
            Create your account, top up your wallet with mobile money, and launch your first
            campaign today.
          </p>
          <Link
            href="/signup"
            className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-bold"
          >
            Create your campaign <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ccb-border px-4 py-6 text-center">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-ccb-muted">
          <Link href="/" className="hover:text-ccb-text">Home</Link>
          <Link href="/how-battles-work" className="hover:text-ccb-text">How it works</Link>
          <Link href="/about" className="hover:text-ccb-text">About</Link>
          <Link href="/faq" className="hover:text-ccb-text">FAQ</Link>
          <Link href="/privacy" className="hover:text-ccb-text">Privacy</Link>
          <Link href="/terms" className="hover:text-ccb-text">Terms</Link>
        </div>
        <p className="text-[11px] text-ccb-muted/60 mt-3">
          © {new Date().getFullYear()} Crazy Chess Battles
        </p>
      </footer>
    </div>
  );
}
