import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard — Global Chess Rankings",
  description: "See the top chess players on Crazy Chess Battles. View global rankings, win rates, ratings, and tournament champions. Climb the leaderboard by winning ranked games.",
  alternates: { canonical: "https://crazychessbattles.live/leaderboard" },
};

import { createClient } from "@/lib/supabase/server";
import { Crown, Medal } from "lucide-react";
import Link from "next/link";

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data: players } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, rating, games_played, wins, tournaments_won")
    .eq("is_banned", false)
    .order("rating", { ascending: false })
    .limit(50);

  const getTier = (rating: number) => {
    if (rating >= 2400) return { label: "Grandmaster", color: "text-purple-400", bg: "bg-purple-400/10" };
    if (rating >= 2200) return { label: "Master", color: "text-fuchsia-400", bg: "bg-fuchsia-400/10" };
    if (rating >= 1900) return { label: "Diamond", color: "text-cyan-400", bg: "bg-cyan-400/10" };
    if (rating >= 1600) return { label: "Platinum", color: "text-emerald-400", bg: "bg-emerald-400/10" };
    if (rating >= 1300) return { label: "Gold", color: "text-ccb-accent", bg: "bg-ccb-accent/10" };
    if (rating >= 1000) return { label: "Silver", color: "text-ccb-silver", bg: "bg-ccb-silver/10" };
    if (rating >= 700) return { label: "Bronze", color: "text-ccb-bronze", bg: "bg-ccb-bronze/10" };
    return { label: "Rookie", color: "text-ccb-muted", bg: "bg-ccb-muted/10" };
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-ccb-muted mt-1">Top players ranked by rating</p>
      </div>

      {/* Top 3 podium */}
      {players && players.length >= 3 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {players.slice(0, 3).map((player, idx) => {
            const tier = getTier(player.rating);
            const medals = ["text-yellow-400", "text-gray-400", "text-orange-400"];
            const sizes = ["order-2", "order-1", "order-3"];
            const heights = ["mt-0", "mt-0", "mt-4"];
            return (
              <div
                key={player.username}
                className={`card text-center ${sizes[idx]} ${heights[idx]}`}
              >
                <div className="flex justify-center mb-2">
                  {idx === 0 ? (
                    <Crown className={`w-8 h-8 ${medals[0]}`} />
                  ) : (
                    <Medal className={`w-6 h-6 ${medals[idx]}`} />
                  )}
                </div>
                <div className="text-xs text-ccb-muted">#{idx + 1}</div>
                <Link href={`/profile/${player.username}`} className="font-bold text-sm truncate block hover:text-ccb-primary">
                  {player.display_name || player.username}
                </Link>
                <div className={`text-lg font-bold ${tier.color}`}>{player.rating}</div>
                <div className={`inline-block rounded-full px-2 py-0.5 text-xs ${tier.bg} ${tier.color} mt-1`}>
                  {tier.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full leaderboard */}
      <div className="card overflow-hidden p-0">
        <div className="px-3 sm:px-6 py-3 border-b border-ccb-border text-xs text-ccb-muted grid grid-cols-12 gap-2 sm:gap-4">
          <div className="col-span-1">#</div>
          <div className="col-span-5">Player</div>
          <div className="col-span-2 text-center">Rating</div>
          <div className="col-span-2 text-center hidden sm:block">Games</div>
          <div className="col-span-2 text-center hidden sm:block">Wins</div>
        </div>
        <div className="divide-y divide-ccb-border">
          {players?.map((player, idx) => {
            const tier = getTier(player.rating);
            return (
              <div
                key={player.username}
                className="px-3 sm:px-6 py-3 grid grid-cols-12 gap-2 sm:gap-4 items-center hover:bg-ccb-surface transition-colors"
              >
                <div className="col-span-1 text-sm text-ccb-muted font-mono">{idx + 1}</div>
                <div className="col-span-5">
                  <Link href={`/profile/${player.username}`} className="text-xs sm:text-sm font-medium hover:text-ccb-primary">
                    {player.display_name || player.username}
                  </Link>
                  <div className={`text-xs ${tier.color}`}>{tier.label}</div>
                </div>
                <div className={`col-span-2 text-center font-bold ${tier.color}`}>{player.rating}</div>
                <div className="col-span-2 text-center text-sm hidden sm:block">{player.games_played}</div>
                <div className="col-span-2 text-center text-sm hidden sm:block">{player.wins}</div>
              </div>
            );
          })}
        </div>
      </div>

      {players?.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-sm text-ccb-muted">No players yet. Be the first to join!</p>
        </div>
      )}
    </div>
  );
}
