"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Users, Swords, Trophy } from "lucide-react";

interface Stats {
  activePlayers: number;
  gamesToday: number;
  liveTournaments: number;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export default function HomeStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const supabase = createClient();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const [playersRes, gamesRes, tournamentsRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("games").select("id", { count: "exact", head: true }).gte("created_at", todayISO),
          supabase.from("tournaments").select("id, status").in("status", ["upcoming", "active"]),
        ]);

        setStats({
          activePlayers: playersRes.count || 0,
          gamesToday: gamesRes.count || 0,
          liveTournaments: tournamentsRes.data?.length || 0,
        });
      } catch {
        setStats({
          activePlayers: 0,
          gamesToday: 0,
          liveTournaments: 0,
        });
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1 sm:gap-5 text-center">
        {[...Array(3)].map((_, i) => (
          <div key={i}>
            <div className="text-lg font-bold text-ccb-muted animate-pulse sm:text-3xl">—</div>
            <div className="mt-1 text-[10px] text-ccb-muted sm:text-sm">Loading...</div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    { value: formatNumber(stats.activePlayers), label: "Players", icon: Users },
    { value: formatNumber(stats.gamesToday), label: "Games Today", icon: Swords },
    { value: formatNumber(stats.liveTournaments), label: "Tournaments", icon: Trophy },
  ];

  return (
    <div className="grid grid-cols-3 gap-1 sm:gap-5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-center gap-1.5 sm:gap-2.5">
          <item.icon className={`h-4 w-4 shrink-0 sm:h-5 sm:w-5 ${i === 0 ? "text-cyan-300" : i === 1 ? "text-amber-300" : "text-yellow-300"}`} />
          <div className="text-center sm:text-left">
            <div className="text-lg font-black text-ccb-text sm:text-2xl">{item.value}</div>
            <div className="mt-0.5 text-[9px] text-ccb-muted sm:text-xs">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
