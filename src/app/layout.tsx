import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import PWAInstaller from "@/components/PWAInstaller";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Crazy Chess Battles — Compete. Win. Dominate.",
  description: "Malawi's competitive chess arena. Real-money tournaments, ranked battles, and prizes. Play blitz, bullet, and rapid chess for stakes.",
  keywords: ["chess", "online chess", "chess tournaments", "competitive chess", "chess ranking", "Malawi chess", "chess prizes", "blitz chess"],
  authors: [{ name: "Crazy Chess Battles" }],
  manifest: "/manifest.json",
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
    title: "Crazy Chess Battles — Compete. Win. Dominate.",
    description: "Malawi's competitive chess arena. Tournaments, prizes, and ranked battles.",
    type: "website",
    url: "https://crazychessbattles.live",
    siteName: "Crazy Chess Battles",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Crazy Chess Battles" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Crazy Chess Battles — Compete. Win. Dominate.",
    description: "Malawi's competitive chess arena. Tournaments, prizes, and ranked battles.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>
        {children}
        <PWAInstaller />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
