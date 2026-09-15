"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Home, Swords, User, Wallet, Shield, Coins, Gift,
  Crown, Disc3, Menu, X, Trophy, Radio, Clock, Play, Settings, MessageCircle,
  GraduationCap,
} from "lucide-react";
import NotificationBell from "./notification-bell";
import { useCurrency } from "@/hooks/use-currency";
import { useChatsUnread } from "@/hooks/use-chats-unread";
import { Users } from "lucide-react";

interface Profile {
  username: string | null;
  display_name: string | null;
  rating: number | null;
  avatar_url: string | null;
  is_admin: boolean | null;
  wallet_balance: number | null;
  country: string | null;
}

// Exact active check — avoids /league matching /league/tournaments etc.
function isPathActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  // For top-level routes, match exactly or with trailing slash
  const next = href + "/";
  return pathname === href || pathname.startsWith(next);
}

export default function AppNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const { formatMoney: fmtCurrency } = useCurrency();
  const isGameRoute = pathname.startsWith("/game/") || pathname.startsWith("/play/computer") || pathname.startsWith("/draughts/game/");
  const [menuOpen, setMenuOpen] = useState(false);
  const chatsUnread = useChatsUnread();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  // Bottom nav: Play · Battles · Academy · Tournaments · Leagues
  // (Chats moved to a floating bubble — bottom-right, above this nav)
  const bottomNav = [
    { href: "/play", label: "Play", icon: Swords },
    { href: "/battles", label: "Battles", icon: Coins },
    { href: "/academy", label: "Academy", icon: GraduationCap },
    { href: "/tournaments", label: "Tournaments", icon: Trophy },
    { href: "/league", label: "Leagues", icon: Crown },
  ];

  // Desktop nav — primary actions
  const desktopNav = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/play", label: "Play", icon: Swords },
    { href: "/battles", label: "Battles", icon: Coins },
    { href: "/history", label: "History", icon: Clock },
    { href: "/league", label: "Leagues", icon: Crown },
    { href: "/tournaments", label: "Tournaments", icon: Trophy },
    { href: "/chats", label: "Chats", icon: MessageCircle },
    { href: "/friends", label: "Friends", icon: Users },
  ];

  // Menu — categorized, ordered by relevance
  const menuSections = [
    {
      title: "Play",
      items: [
        { href: "/play", label: "Quick Match", icon: Swords },
        { href: "/play/computer", label: "Play Computer", icon: Play },
        { href: "/draughts", label: "Draughts", icon: Disc3 },
        { href: "/battles", label: "Cash Battles", icon: Coins },
      ],
    },
    {
      title: "Compete",
      items: [
        { href: "/league", label: "Premium Leagues", icon: Crown },
        { href: "/tournaments", label: "Tournaments", icon: Trophy },
        { href: "/live", label: "Live Matches", icon: Radio },
        { href: "/chats", label: "Chats", icon: MessageCircle },
        { href: "/friends", label: "Friends", icon: Users },
      ],
    },
    {
      title: "Account",
      items: [
        { href: "/settings", label: "Settings & Profile", icon: Settings },
        { href: "/wallet", label: "Wallet", icon: Wallet },
        { href: "/affiliate", label: "Affiliate", icon: Gift },
        { href: "/academy", label: "Chess Academy", icon: GraduationCap },
      { href: "/membership", label: "Club Membership", icon: Crown },
        { href: "/history", label: "Game History", icon: Clock },
      ],
    },
  ];

  if (profile?.is_admin) {
    menuSections.push({
      title: "Admin",
      items: [
        { href: "/admin", label: "Admin Panel", icon: Shield },
      ],
    });
  }

  const formatBalance = (cents: number | null | undefined) => {
    return fmtCurrency(cents ?? 0);
  };

  return (
    <>
      {/* === DESKTOP NAV === */}
      <nav className="hidden sm:block border-b border-ccb-border bg-ccb-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={32} height={32} className="w-8 h-8 rounded-full" />
              <span className="font-bold">CCB</span>
            </Link>
            <div className="flex items-center gap-1">
              {desktopNav.map((item) => {
                const Icon = item.icon;
                const active = isPathActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                      active
                        ? "bg-ccb-primary/10 text-ccb-primary"
                        : "text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={() => setMenuOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface transition-colors"
              >
                <Menu className="w-4 h-4" />
                <span>More</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-sm hover:bg-ccb-accent/10 transition-colors"
            >
              <Wallet className="w-4 h-4 text-ccb-accent" />
              <span className="font-bold text-ccb-text">{formatBalance(profile?.wallet_balance)}</span>
            </Link>
            <Link href="/settings" className="flex items-center gap-2 text-sm text-ccb-muted hover:text-ccb-text">
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

      {/* === MOBILE HEADER: Menu·Bell · Brand · Wallet·Profile === */}
      {!isGameRoute && (
        <header className="sm:hidden sticky top-0 z-50 border-b border-ccb-border bg-ccb-dark">
          <div className="flex items-center justify-between px-3 h-12">
            {/* Left: Menu + Bell (mirrors Wallet + Profile on right) */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMenuOpen(true)}
                className="p-2 rounded-md text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <NotificationBell />
            </div>

            {/* Center: Brand */}
            <Link href="/dashboard" className="flex items-center gap-1.5">
              <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={24} height={24} className="w-6 h-6 rounded-full" />
              <span className="font-bold text-sm tracking-tight">CCB</span>
            </Link>

            {/* Right: Wallet + Profile */}
            <div className="flex items-center gap-1">
              <Link href="/wallet" className="flex items-center gap-1 px-2 py-1 rounded-md bg-ccb-surface border border-ccb-border">
                <Wallet className="w-3.5 h-3.5 text-ccb-accent" />
                <span className="text-[11px] font-bold text-ccb-text">{formatBalance(profile?.wallet_balance)}</span>
              </Link>
              <Link href="/settings" className="flex items-center p-1">
                <div className="w-6 h-6 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
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

      {/* === FULL-SCREEN MENU OVERLAY === */}
      {menuOpen && (
        <div className="fixed inset-0 z-[200] bg-ccb-dark flex flex-col">
          {/* Top bar — close button */}
          <div className="flex items-center justify-between px-4 h-12 border-b border-ccb-border shrink-0">
            <span className="font-bold text-sm">Menu</span>
            <button
              onClick={() => setMenuOpen(false)}
              className="p-2 rounded-md text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User mini-profile */}
          <Link href="/settings" className="flex items-center gap-3 px-4 py-3 border-b border-ccb-border hover:bg-ccb-surface transition-colors shrink-0">
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

          {/* Scrollable menu sections */}
          <div className="flex-1 overflow-y-auto">
            {menuSections.map((section, si) => (
              <div key={si} className={si > 0 ? "border-t border-ccb-border" : ""}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted px-4 pt-3 pb-1">
                  {section.title}
                </p>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isPathActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={true}
                      className={`flex items-center gap-3 px-4 py-2 hover:bg-ccb-surface transition-all active:scale-95 ${
                        active ? "text-ccb-primary" : "text-ccb-text"
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <p className="text-sm font-medium">{item.label}</p>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === MOBILE BOTTOM NAV: Play · Battles · Academy · Tournaments · Leagues === */}
      {!isGameRoute && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-[100] border-t border-gray-200 bg-white sm:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-stretch justify-around h-14">
            {bottomNav.map((item) => {
              const Icon = item.icon;
              const active = isPathActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 relative active:bg-gray-100 active:scale-95 transition-all duration-150"
                >
                  {active && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-ccb-primary" />
                  )}
                  <Icon className={`w-5 h-5 transition-colors ${active ? "text-ccb-primary" : "text-gray-400"}`} />
                  <span className={`text-[9px] font-medium transition-colors ${active ? "text-ccb-primary" : "text-gray-500"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* === FLOATING CHATS BUBBLE (mobile): bottom-right, above the bottom nav === */}
      {!isGameRoute && !pathname.startsWith("/chats") && (
        <Link
          href="/chats"
          prefetch={true}
          aria-label={`Chats${chatsUnread > 0 ? ` (${chatsUnread} unread)` : ""}`}
          className="sm:hidden fixed right-4 z-[90] w-14 h-14 rounded-full bg-ccb-primary text-white flex items-center justify-center shadow-xl shadow-black/25 active:scale-90 transition-transform"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}
        >
          <MessageCircle className="w-6 h-6" />
          {chatsUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md border-2 border-ccb-dark">
              {chatsUnread > 99 ? "99+" : chatsUnread}
            </span>
          )}
        </Link>
      )}
    </>
  );
}
