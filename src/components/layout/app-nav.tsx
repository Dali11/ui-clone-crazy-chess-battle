"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Home, Swords, User, Wallet, Shield, Coins,
  Crown, Menu, X, Trophy, Radio, Settings, MessageCircle,
  Megaphone, Gift, BadgeCheck,
} from "lucide-react";
import NotificationBell from "./notification-bell";
import { useCurrency } from "@/hooks/use-currency";
import { useChatsUnread } from "@/hooks/use-chats-unread";
import { isGameRoute as checkIsGameRoute } from "@/lib/is-game-route";
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

// ─── Navigation model ─────────────────────────────────────────────────────
// The menu is deliberately short: pages absorb their sub-features —
//   · /play offers vs Player / vs Computer / Draughts
//   · Membership & Affiliate are top-level menu entries (2026-09-28)
//   · /settings links Academy + Game History
// The same groups drive the desktop sidebar (lg+) and the menu overlay.
const navGroups = [
  {
    title: "Play",
    items: [
      { href: "/play", label: "Play", icon: Swords },
      { href: "/battles", label: "Cash Battles", icon: Coins },
    ],
  },
  {
    title: "Compete",
    items: [
      { href: "/league", label: "Premium Leagues", icon: Crown },
      { href: "/tournaments", label: "Tournaments", icon: Trophy },
      { href: "/live", label: "Live Matches", icon: Radio },
    ],
  },
  {
    title: "Me",
    items: [
      { href: "/settings", label: "Settings & Profile", icon: Settings },
      { href: "/wallet", label: "Wallet", icon: Wallet },
      { href: "/chats", label: "Chats", icon: MessageCircle },
      { href: "/friends", label: "Friends", icon: Users },
      { href: "/membership", label: "Membership", icon: BadgeCheck },
      { href: "/affiliate", label: "Affiliate & Referrals", icon: Gift },
      { href: "/advertise", label: "Advertise", icon: Megaphone },
    ],
  },
];

const adminGroup = {
  title: "Admin",
  items: [{ href: "/admin", label: "Admin Panel", icon: Shield }],
};

// Tablet top bar (sm–lg). On lg+ the persistent sidebar takes over.
const tabletNav = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/play", label: "Play", icon: Swords },
  { href: "/battles", label: "Battles", icon: Coins },
  { href: "/league", label: "Leagues", icon: Crown },
  { href: "/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/friends", label: "Friends", icon: Users },
];

export default function AppNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const { formatWallet } = useCurrency();
  const isGameRoute = checkIsGameRoute(pathname);
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

  const groups = profile?.is_admin ? [...navGroups, adminGroup] : navGroups;

  // Bottom nav (redesign C, owner-approved 2026-09-26): dark bar with a
  // raised central Play FAB — Battles · Advertise · [PLAY] · Tournaments ·
  // Leagues. Layout is rendered inline below. Chats remains a floating
  // bubble at bottom-right, above this nav.

  // Wallet balances are stored in the player's OWN currency (local wallets)
  const formatBalance = (bal: number | null | undefined) => formatWallet(bal ?? 0);

  const SidebarItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Home }) => {
    const active = isPathActive(pathname, href);
    return (
      <Link
        href={href}
        prefetch={true}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          active
            ? "bg-ccb-primary/10 text-ccb-primary"
            : "text-ccb-text hover:bg-ccb-accent/10"
        }`}
      >
        <Icon className="w-[18px] h-[18px] shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* === DESKTOP SIDEBAR (lg+) — hidden on game routes so the board
          gets the full width, matching chess.com's two-column layout === */}
      {!isGameRoute && (
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-ccb-border bg-ccb-surface">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-4 h-16 border-b border-ccb-border shrink-0">
          <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={32} height={32} className="w-8 h-8 rounded-full" />
          <span className="font-bold">CCB</span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted px-3 pb-1.5">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarItem key={item.href} href={item.href} label={item.label} icon={item.icon} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer — notifications first (bell moved here from the
            top bar, owner 2026-09-26), then wallet, then profile */}
        <div className="border-t border-ccb-border p-3 space-y-1 shrink-0">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Notifications</span>
            <NotificationBell />
          </div>
          <Link
            href="/wallet"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm hover:bg-ccb-accent/10 transition-colors"
          >
            <Wallet className="w-4 h-4 text-ccb-accent shrink-0" />
            <span className="font-bold text-ccb-text truncate">{formatBalance(profile?.wallet_balance)}</span>
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ccb-muted hover:text-ccb-text hover:bg-ccb-accent/10 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center overflow-hidden shrink-0">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-ccb-text truncate">{profile?.username ?? "Player"}</p>
              <p className="text-[11px] text-ccb-muted">Rating: {profile?.rating ?? "—"}</p>
            </div>
          </Link>
        </div>
      </aside>
      )}

      {/* === TOP BAR (sm+) — links for tablets only; right cluster for all desktop === */}
      <nav className="hidden sm:block border-b border-ccb-border bg-ccb-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            {/* Brand — tablets only (sidebar carries it on lg+) */}
            <Link href="/dashboard" className="lg:hidden flex items-center gap-2">
              <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={32} height={32} className="w-8 h-8 rounded-full" />
              <span className="font-bold">CCB</span>
            </Link>
            <div className="lg:hidden flex items-center gap-1">
              {tabletNav.map((item) => {
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

      {/* === MOBILE HEADER (owner correction 2026-09-26): Menu · Brand ·
          Wallet · Profile. The menu button is back on the left (the
          avatar had taken over opening the menu); the avatar links to
          the profile. The notification bell stays in the menu overlay's
          top bar. === */}
      {!isGameRoute && (
        <header className="sm:hidden sticky top-0 z-50 border-b border-ccb-border bg-ccb-dark">
          <div className="flex items-center justify-between px-3 h-12">
            {/* Left: Menu then Brand */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMenuOpen(true)}
                className="p-2 rounded-md text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <Link href="/dashboard" className="flex items-center gap-1.5">
                <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={24} height={24} className="w-6 h-6 rounded-full" />
                <span className="font-bold text-sm tracking-tight">CCB</span>
              </Link>
            </div>

            {/* Right: Wallet then Profile */}
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

      {/* === FULL-SCREEN MENU OVERLAY (mobile + tablet "More") === */}
      {menuOpen && (
        <div className="fixed inset-0 z-[200] bg-ccb-dark flex flex-col">
          {/* Top bar — notifications + close (bell moved here from the
              mobile header, owner 2026-09-26) */}
          <div className="flex items-center justify-between px-4 h-12 border-b border-ccb-border shrink-0">
            <span className="font-bold text-sm">Menu</span>
            <div className="flex items-center">
              <NotificationBell />
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 rounded-md text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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
            {groups.map((section, si) => (
              <div key={section.title} className={si > 0 ? "border-t border-ccb-border" : ""}>
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

      {/* === MOBILE BOTTOM NAV — redesign C (owner-approved 2026-09-26):
            dark bar · Battles · Referrals · [raised Play FAB] · Tournaments · Leagues
            (2026-09-28: Advertise → Referrals, owner request) === */}
      {!isGameRoute && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-[100] border-t border-ccb-border bg-ccb-dark sm:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="relative flex items-stretch justify-around h-14">
            {/* Left pair */}
            {[
              { href: "/battles", label: "Battles", icon: Coins },
              { href: "/affiliate", label: "Referrals", icon: Gift },
            ].map((item) => {
              const Icon = item.icon;
              const active = isPathActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative active:scale-95 transition-all duration-150 ${
                    active ? "text-ccb-primary" : "text-ccb-muted"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className={`text-[9px] font-medium ${active ? "text-ccb-primary" : "text-ccb-muted"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}

            {/* Center: raised Play FAB — the hero action */}
            <Link
              href="/play"
              prefetch={true}
              aria-label="Play"
              className="relative w-16 flex items-center justify-center"
            >
              <span
                className={`absolute -top-5 w-12 h-12 rounded-full flex items-center justify-center bg-ccb-primary ring-4 ring-ccb-dark shadow-xl shadow-black/40 transition-transform duration-150 active:scale-90 ${
                  isPathActive(pathname, "/play") ? "scale-105" : ""
                }`}
              >
                <Swords className="w-6 h-6 text-white" />
              </span>
            </Link>

            {/* Right pair */}
            {[
              { href: "/tournaments", label: "Tournaments", icon: Trophy },
              { href: "/league", label: "Leagues", icon: Crown },
            ].map((item) => {
              const Icon = item.icon;
              const active = isPathActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative active:scale-95 transition-all duration-150 ${
                    active ? "text-ccb-primary" : "text-ccb-muted"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className={`text-[9px] font-medium ${active ? "text-ccb-primary" : "text-ccb-muted"}`}>
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
