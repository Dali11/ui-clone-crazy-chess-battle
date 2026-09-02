"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Table2, CalendarDays, History } from "lucide-react";

const subNavItems = [
  { href: "/league/table", label: "Table", icon: Table2 },
  { href: "/league/matchday/1", label: "Fixtures", icon: CalendarDays },
  { href: "/league/seasons", label: "Seasons", icon: History },
];

export default function LeagueSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      {subNavItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/league/table"
            ? pathname === "/league/table"
            : item.href === "/league/seasons"
            ? pathname === "/league/seasons" || pathname.startsWith("/league/seasons/")
            : pathname.startsWith("/league/matchday");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "text-ccb-accent bg-ccb-accent/10"
                : "text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
