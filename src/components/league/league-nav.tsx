"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Swords, Crown, LayoutDashboard, Crown as Membership } from "lucide-react";

const leagueNavItems = [
  { href: "/league/tournaments", label: "Tournaments", icon: Swords },
  { href: "/league", label: "Leagues", icon: Crown },
  { href: "/league/dashboard", label: "My Stats", icon: LayoutDashboard },
  { href: "/league/subscribe", label: "Membership", icon: Membership },
];

export default function LeagueNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-ccb-border bg-ccb-surface/50 backdrop-blur-sm sticky top-16 z-40">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar h-12">
        {leagueNavItems.map((item) => {
          const Icon = item.icon;
          let isActive;
          if (item.href === "/league") {
            isActive = pathname === "/league";
          } else if (item.href === "/league/subscribe") {
            isActive = pathname === "/league/subscribe";
          } else {
            isActive = pathname.startsWith(item.href);
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? "text-ccb-primary bg-ccb-primary/10"
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
  );
}
