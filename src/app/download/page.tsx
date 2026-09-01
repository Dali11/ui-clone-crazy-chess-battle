import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Swords, TrendingUp, Shield, Smartphone, Zap, Users, Check, ChevronRight } from "lucide-react";
import { pageMetadata } from "@/lib/seo/metadata";
import DownloadClient from "./download-client";

export const metadata: Metadata = pageMetadata({
  title: "Download Crazy Chess Battles — Android App",
  description: "Download the Crazy Chess Battles Android app. Play competitive chess tournaments, ranked battles, and win real prizes.",
  path: "/download",
});

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-ccb-dark text-ccb-text">
      {/* Nav */}
      <nav className="border-b border-ccb-border bg-ccb-surface">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-bold ccb-gold-text">CCB</span>
            <span className="text-sm text-ccb-muted hidden sm:inline">Crazy Chess Battles</span>
          </Link>
          <Link href="/" className="text-sm text-ccb-muted hover:text-ccb-text transition-colors flex items-center gap-1">
            Back to site <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <DownloadClient />

        {/* Features grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mb-12">
            {[
              { icon: Trophy, title: "Tournaments", desc: "Live cash-prize tournaments" },
              { icon: Swords, title: "Ranked Battles", desc: "Climb the ELO ladder" },
              { icon: Shield, title: "Secure Payments", desc: "Airtel Money & TNM Mpamba" },
            ].map((f) => (
              <div key={f.title} className="card text-center">
                <div className="w-10 h-10 rounded-lg bg-ccb-primary/10 flex items-center justify-center mx-auto mb-2">
                  <f.icon className="w-5 h-5 text-ccb-primary" />
                </div>
                <div className="text-sm font-semibold">{f.title}</div>
                <div className="text-xs text-ccb-muted">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Install instructions */}
          <div className="w-full max-w-2xl text-left">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-ccb-primary" />
              How to install
            </h2>
            <div className="space-y-3">
              {[
                { step: 1, title: "Download the APK", desc: "Tap the download button above. The file will be saved to your Downloads folder." },
                { step: 2, title: "Open the file", desc: "Tap the downloaded CCB.apk file in your notifications or Downloads folder." },
                { step: 3, title: "Allow installation", desc: "If prompted, go to Settings → Security and enable \"Install unknown apps\" for your browser, then tap Install." },
                { step: 4, title: "Open & play", desc: "Launch Crazy Chess Battles, sign up or log in, and start playing!" },
              ].map((s) => (
                <div key={s.step} className="flex gap-3 items-start">
                  <div className="w-7 h-7 rounded-full bg-ccb-primary/20 text-ccb-primary flex items-center justify-center text-sm font-bold shrink-0">
                    {s.step}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{s.title}</div>
                    <div className="text-xs text-ccb-muted">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* QR code for easy mobile download */}
          <div className="mt-12 mb-4">
            <p className="text-xs text-ccb-muted mb-3">Or scan this QR code on your phone</p>
            <div className="inline-block p-3 bg-white rounded-xl">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://crazychessbattles.live/download/CCB.apk`}
                alt="QR code to download CCB APK"
                width={160}
                height={160}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-ccb-border w-full max-w-2xl text-center">
            <p className="text-xs text-ccb-muted/60 mb-2">
              This app is not yet on the Google Play Store. You're downloading the APK directly.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-ccb-muted/50">
              <Link href="/" className="hover:text-ccb-text transition-colors">Home</Link>
              <span>·</span>
              <Link href="/how-it-works" className="hover:text-ccb-text transition-colors">How it works</Link>
              <span>·</span>
              <Link href="/faq" className="hover:text-ccb-text transition-colors">FAQ</Link>
            </div>
          </div>
        </div>
      </div>
  );
}
