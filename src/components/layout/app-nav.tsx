"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Swords, TrendingUp, User, Wallet, Shield, Coins, Gift, Crown, Disc3 } from "lucide-react";
import NotificationBell from "./notification-bell";

interface Profile {
  username: string | null;
  display_name: string | null;
  rating: number | null;
  avatar_url: string | null;
  is_admin: boolean | null;
  wallet_balance_cents: number | null;
}

export default function AppNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const isGameRoute = pathname.startsWith("/game/") || pathname.startsWith("/play/computer") || pathname.startsWith("/draughts/game/");

  // Mobile bottom nav — Wallet replaced by Draughts (Wallet moves to header)
  const navItems = [
    { href: "/play", label: "Play", icon: Swords },
    { href: "/battles", label: "Battles", icon: Coins },
    { href: "/league", label: "Compete", icon: Crown },
    { href: "/draughts", label: "Draughts", icon: Disc3 },
    { href: "/settings", label: "Profile", icon: User },
  ];

  const desktopItems = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/play", label: "Play", icon: Swords },
    { href: "/battles", label: "Battles", icon: Coins },
    { href: "/league", label: "Compete", icon: Crown },
    { href: "/draughts", label: "Draughts", icon: Disc3 },
    { href: "/earn", label: "Earn CCB", icon: Gift },
    { href: "/leaderboard", label: "Ranks", icon: TrendingUp },
    { href: "/history", label: "History", icon: TrendingUp },
    ...(profile?.is_admin ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  const formatBalance = (cents: number | null | undefined) => {
    const value = cents ?? 0;
    const kwacha = Math.floor(value / 100);
    return `MK ${kwacha.toLocaleString()}`;
  };

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden sm:block border-b border-ccb-border bg-ccb-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-ccb-primary flex items-center justify-center">
                <span className="text-white font-bold">♞</span>
              </div>
              <span className="font-bold">CCB</span>
            </Link>
            <div className="flex items-center gap-1">
              {desktopItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-ccb-primary/10 text-ccb-primary"
                        : "text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link href="/earn" className="flex items-center gap-1.5 text-sm">
              <Gift className="w-4 h-4 text-orange-500" />
              <span className="font-bold">Earn CCB</span>
            </Link>
            {/* Wallet balance — replaces rating display */}
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-sm hover:bg-ccb-accent/10 transition-colors"
            >
              <Wallet className="w-4 h-4 text-ccb-accent" />
              <span className="font-bold text-ccb-text">{formatBalance(profile?.wallet_balance_cents)}</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-2 text-sm text-ccb-muted hover:text-ccb-text"
            >
              <div className="w-8 h-8 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <span>{profile?.username ?? "Player"}</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Mobile header */}
      {!isGameRoute && (
      <header className="sm:hidden sticky top-0 z-50 border-b border-ccb-border bg-ccb-dark">
        <div className="flex items-center justify-between px-4 h-12">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-ccb-primary flex items-center justify-center">
              <span className="text-white font-bold text-sm">♞</span>
            </div>
            <span className="font-bold text-sm">CCB</span>
          </Link>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link href="/earn" className="flex items-center gap-1">
              <Gift className="w-4 h-4 text-orange-500" />
              <span className="text-xs font-bold">Earn</span>
            </Link>
            {/* Wallet balance — replaces rating display */}
            <Link
              href="/wallet"
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-ccb-surface border border-ccb-border"
            >
              <Wallet className="w-3.5 h-3.5 text-ccb-accent" />
              <span className="text-xs font-bold text-ccb-text">{formatBalance(profile?.wallet_balance_cents)}</span>
            </Link>
            <Link href="/settings" className="flex items-center gap-2 text-ccb-muted">
              <div className="w-7 h-7 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
            </Link>
          </div>
        </div>
      </header>
      )}

      {/* Mobile bottom nav */}
      {!isGameRoute && (
      <nav
        className="fixed bottom-0 left-0 right-0 z-[100] border-t border-gray-200 bg-white sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch justify-around h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 relative"
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-ccb-primary" />
                )}
                <Icon className={`w-5 h-5 transition-colors ${isActive ? "text-ccb-primary" : "text-gray-400"}`} />
                <span className={`text-[10px] font-medium transition-colors ${isActive ? "text-ccb-primary" : "text-gray-500"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      )}
    </>
  );
}
