import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import PWAInstaller from "@/components/PWAInstaller";

const inter = Inter({ subsets: ["latin"] });

const BASE_URL = "https://crazychessbattles.live";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Crazy Chess Battles — Play Competitive Chess Online & Win Prizes",
    template: "%s — Crazy Chess Battles",
  },
  description: "Play competitive chess online in ranked battles, tournaments, and leagues. Challenge players worldwide in blitz, bullet, and rapid chess. Climb the leaderboard and win prizes.",
  keywords: [
    "online chess", "chess tournaments", "competitive chess", "play chess online",
    "chess battles", "chess league", "blitz chess", "bullet chess", "rapid chess",
    "chess ranking", "chess prizes", "chess leaderboard", "chess app",
    "international checkers", "draughts online",
  ],
  authors: [{ name: "Crazy Chess Battles" }],
  creator: "Crazy Chess Battles",
  publisher: "Crazy Chess Battles",
  manifest: "/manifest.json",
  applicationName: "Crazy Chess Battles",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Crazy Chess Battles",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Crazy Chess Battles — Play Competitive Chess Online & Win Prizes",
    description: "Join competitive chess battles and tournaments. Play blitz, bullet, and rapid chess against players worldwide. Climb the ranks and win prizes.",
    type: "website",
    url: BASE_URL,
    siteName: "Crazy Chess Battles",
    locale: "en_US",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Crazy Chess Battles — Competitive Chess Online" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Crazy Chess Battles — Play Competitive Chess Online & Win Prizes",
    description: "Join competitive chess battles and tournaments. Play blitz, bullet, and rapid chess against players worldwide.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
  },
  category: "games",
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Crazy Chess Battles",
  url: BASE_URL,
  logo: `${BASE_URL}/logo-badge.png`,
  description: "Competitive chess platform offering tournaments, leagues, and ranked battles.",
  sameAs: [],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Crazy Chess Battles",
  url: BASE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${BASE_URL}/leaderboard?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        {children}
        <PWAInstaller />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
