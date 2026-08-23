"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crown, Table2, CalendarDays, LayoutDashboard } from "lucide-react";

const leagueNavItems = [
  { href: "/league", label: "Home", icon: Crown },
  { href: "/league/table", label: "Table", icon: Table2 },
  { href: "/league/matchday/1", label: "Fixtures", icon: CalendarDays },
  { href: "/league/dashboard", label: "My Stats", icon: LayoutDashboard },
];

export default function LeagueNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-ccb-border bg-ccb-surface/50 backdrop-blur-sm sticky top-16 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar h-12">
          {leagueNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/league"
                ? pathname === "/league"
                : pathname.startsWith(item.href.replace(/\/\d+$/, ""));
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
    </div>
  );
}
