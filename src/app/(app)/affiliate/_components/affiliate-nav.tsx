"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Gift, Users, Wallet, BookOpen, ScrollText,
} from "lucide-react";

const TABS = [
  { href: "/affiliate", label: "Overview", icon: Gift },
  { href: "/affiliate/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/affiliate/team", label: "My Team", icon: Users },
  { href: "/affiliate/earnings", label: "Earnings", icon: Wallet },
  { href: "/affiliate/how-it-works", label: "Guide", icon: BookOpen },
  { href: "/affiliate/terms", label: "Terms", icon: ScrollText },
];

export default function AffiliateNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Affiliate pages" className="sticky top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/affiliate" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                "flex items-center gap-1.5 shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors " +
                (active
                  ? "bg-ccb-primary text-white border-ccb-primary"
                  : "bg-ccb-card text-ccb-muted border-ccb-border hover:text-foreground")
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
