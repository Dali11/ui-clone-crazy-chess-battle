"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurrencySymbol } from "@/lib/geo/fx";

interface Stats {
  activePlayers: number;
  gamesToday: number;
  liveTournaments: number;
  totalPrizePool: number; // in MWK cents (base currency)
}

interface CurrencyInfo {
  currencyCode: string;
  rate: number; // MWK -> currencyCode
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function formatMoney(cents: number, currencyCode: string): string {
  const symbol = getCurrencySymbol(currencyCode);
  const units = Math.floor(cents);
  if (units >= 1_000_000) return `${symbol} ${(units / 1_000_000).toFixed(1)}M`;
  if (units >= 1_000) return `${symbol} ${(units / 1_000).toFixed(0)}K`;
  return `${symbol} ${units.toLocaleString("en-US")}`;
}

export default function HomeStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [currency, setCurrency] = useState<CurrencyInfo>({ currencyCode: "MWK", rate: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const supabase = createClient();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const [playersRes, gamesRes, tournamentsRes, currencyRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("games").select("id", { count: "exact", head: true }).gte("created_at", todayISO),
          supabase.from("tournaments").select("prize_pool, status").in("status", ["upcoming", "active"]),
          // Detect visitor's currency + live MWK exchange rate so the prize
          // pool displays converted to whatever currency they use locally.
          fetch("/api/currency").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        const totalPrizePool = (tournamentsRes.data || []).reduce(
          (sum, t) => sum + (t.prize_pool || 0),
          0
        );

        if (currencyRes?.currencyCode && currencyRes?.rate) {
          setCurrency({ currencyCode: currencyRes.currencyCode, rate: currencyRes.rate });
        }

        setStats({
          activePlayers: playersRes.count || 0,
          gamesToday: gamesRes.count || 0,
          liveTournaments: tournamentsRes.data?.length || 0,
          totalPrizePool,
        });
      } catch {
        setStats({
          activePlayers: 0,
          gamesToday: 0,
          liveTournaments: 0,
          totalPrizePool: 0,
        });
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 text-center">
        {[...Array(4)].map((_, i) => (
          <div key={i}>
            <div className="text-3xl font-bold text-ccb-muted animate-pulse">—</div>
            <div className="text-sm text-ccb-muted mt-1">Loading...</div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const convertedPrizePool = Math.round(stats.totalPrizePool * currency.rate);

  const items = [
    { value: formatNumber(stats.activePlayers), label: "Players" },
    { value: formatNumber(stats.gamesToday), label: "Games Today" },
    { value: formatNumber(stats.liveTournaments), label: "Live Tournaments" },
    {
      value:
        convertedPrizePool > 0
          ? formatMoney(convertedPrizePool, currency.currencyCode)
          : `${getCurrencySymbol(currency.currencyCode)} 0`,
      label: "Prize Pool",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 text-center">
      {items.map((item, i) => (
        <div key={i}>
          <div className="text-2xl sm:text-3xl font-bold text-ccb-primary">{item.value}</div>
          <div className="text-xs sm:text-sm text-ccb-muted mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
