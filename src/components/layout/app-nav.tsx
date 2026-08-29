"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Home, Swords, TrendingUp, User, Wallet, Shield, Coins, Gift, Crown, Disc3, Menu, X, Trophy, BookOpen, Radio, Clock } from "lucide-react";
import NotificationBell from "./notification-bell";

interface Profile {
  username: string | null;
  display_name: string | null;
  rating: number | null;
  avatar_url: string | null;
  is_admin: boolean | null;
  wallet_balance: number | null;
}

export default function AppNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const isGameRoute = pathname.startsWith("/game/") || pathname.startsWith("/play/computer") || pathname.startsWith("/draughts/game/");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // Mobile bottom nav — Premium Leagues replaces Draughts (Draughts → sidebar)
  const navItems = [
    { href: "/play", label: "Play", icon: Swords },
    { href: "/battles", label: "Battles", icon: Coins },
    { href: "/league", label: "Leagues", icon: Crown },
    { href: "/live", label: "Live", icon: Radio },
    { href: "/settings", label: "Profile", icon: User },
  ];

  const desktopItems = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/play", label: "Play", icon: Swords },
    { href: "/battles", label: "Battles", icon: Coins },
    { href: "/league", label: "Leagues", icon: Crown },
    { href: "/live", label: "Live Matches", icon: Radio },
    { href: "/earn", label: "Earn CCB", icon: Gift },
    { href: "/leaderboard", label: "Ranks", icon: TrendingUp },
    { href: "/history", label: "History", icon: Clock },
    ...(profile?.is_admin ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  // Secondary links in the drawer
  const drawerItems = [
    { href: "/draughts", label: "Draughts", icon: Disc3, desc: "Play checkers" },
    { href: "/live", label: "Live Matches", icon: Radio, desc: "Watch ongoing games" },
    { href: "/leaderboard", label: "Ranks", icon: Trophy, desc: "Global standings" },
    { href: "/history", label: "Game History", icon: Clock, desc: "Your past games" },
    { href: "/earn", label: "Earn CCB", icon: Gift, desc: "Rewards & bonuses" },
    { href: "/wallet", label: "Wallet", icon: Wallet, desc: "Balance & transactions" },
    ...(profile?.is_admin ? [{ href: "/admin", label: "Admin Panel", icon: Shield, desc: "Manage platform" }] : []),
  ];

  const formatBalance = (cents: number | null | undefined) => {
    const value = cents ?? 0;
    const kwacha = Math.floor(value);
    return `MK ${kwacha.toLocaleString()}`;
  };

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden sm:block border-b border-ccb-border bg-ccb-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={32} height={32} className="w-8 h-8 rounded-full" />
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
              {/* More button — opens drawer on desktop too */}
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface transition-colors"
              >
                <Menu className="w-4 h-4" />
                <span>More</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link href="/earn" className="flex items-center gap-1.5 text-sm">
              <Gift className="w-4 h-4 text-orange-500" />
              <span className="font-bold">Earn CCB</span>
            </Link>
            {/* Wallet balance */}
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-sm hover:bg-ccb-accent/10 transition-colors"
            >
              <Wallet className="w-4 h-4 text-ccb-accent" />
              <span className="font-bold text-ccb-text">{formatBalance(profile?.wallet_balance)}</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-2 text-sm text-ccb-muted hover:text-ccb-text"
            >
              <div className="w-8 h-8 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4" />
                )}
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
            <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={28} height={28} className="w-7 h-7 rounded-full" />
            <span className="font-bold text-sm">CCB</span>
          </Link>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-1.5 rounded-md text-ccb-muted hover:text-ccb-text"
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/wallet" className="flex items-center gap-1 px-2 py-1 rounded-md bg-ccb-surface border border-ccb-border">
              <Wallet className="w-3.5 h-3.5 text-ccb-accent" />
              <span className="text-xs font-bold text-ccb-text">{formatBalance(profile?.wallet_balance)}</span>
            </Link>
            <Link href="/settings" className="flex items-center gap-2 text-ccb-muted">
              <div className="w-7 h-7 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-3.5 h-3.5" />
                )}
              </div>
            </Link>
          </div>
        </div>
      </header>
      )}

      {/* Drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[200] sm:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 animate-in fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer panel */}
          <div className="absolute right-0 top-0 bottom-0 w-[78vw] max-w-xs bg-ccb-card border-l border-ccb-border flex flex-col">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-12 border-b border-ccb-border shrink-0">
              <span className="font-bold text-sm">Menu</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-md text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* User profile mini */}
            <Link href="/settings" className="flex items-center gap-3 px-4 py-3 border-b border-ccb-border hover:bg-ccb-surface transition-colors">
              <div className="w-10 h-10 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{profile?.display_name || profile?.username || "Player"}</p>
                <p className="text-xs text-ccb-muted">Rating: {profile?.rating ?? "—"}</p>
              </div>
            </Link>
            {/* Drawer links */}
            <div className="flex-1 overflow-y-auto py-2">
              {drawerItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-ccb-surface transition-colors ${
                      isActive ? "text-ccb-primary" : "text-ccb-text"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-[10px] text-ccb-muted">{item.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
            {/* Footer — wallet + earn */}
            <div className="border-t border-ccb-border p-3 space-y-2 shrink-0">
              <Link
                href="/wallet"
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Wallet className="w-4 h-4 text-ccb-accent" />
                  <span className="font-bold text-ccb-text">{formatBalance(profile?.wallet_balance)}</span>
                </span>
              </Link>
              <Link
                href="/earn"
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-ccb-primary to-ccb-accent text-white text-sm font-bold"
              >
                <Gift className="w-4 h-4" />
                Earn CCB
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Desktop drawer (slide-down panel) */}
      {drawerOpen && (
        <div className="hidden sm:block fixed inset-0 z-[200]">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-ccb-card border-l border-ccb-border flex flex-col">
            <div className="flex items-center justify-between px-5 h-14 border-b border-ccb-border shrink-0">
              <span className="font-bold">More</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-md text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {drawerItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-3 hover:bg-ccb-surface transition-colors ${
                      isActive ? "text-ccb-primary" : "text-ccb-text"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-ccb-muted">{item.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
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
