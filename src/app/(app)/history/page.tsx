import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HistoryClient from "./history-client";


import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Game History — Your Match Record",
  description: "View your complete chess game history on Crazy Chess Battles. Past results, ratings changes, and performance stats.",
  path: "/history",
  noIndex: true
});

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/history");

  // Parallelize profile + games queries
  const [profileRes, gamesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, rating, wins, losses, draws, games_played")
      .eq("id", user.id)
      .single(),
    supabase
      .from("games")
      .select(`
        id, status, winner, time_control, initial_minutes, increment_seconds,
        rated, white_player_id, black_player_id, white_rating, black_rating,
        white_rating_change, black_rating_change, move_count, created_at, ended_at,
        tournament_id
      `)
      .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const profile = profileRes.data;
  const games = gamesRes.data;

  // Get opponent profiles
  const opponentIds = new Set<string>();
  for (const g of games || []) {
    if (g.white_player_id !== user.id) opponentIds.add(g.white_player_id);
    if (g.black_player_id !== user.id) opponentIds.add(g.black_player_id);
  }

  const { data: opponents } = await supabase
    .from("profiles")
    .select("id, username, display_name, rating")
    .in("id", Array.from(opponentIds));

  const opponentMap = new Map((opponents || []).map((o) => [o.id, o]));

  return (
    <HistoryClient
      profile={profile}
      games={games || []}
      opponentMap={Object.fromEntries(opponentMap)}
      currentUserId={user.id}
    />
  );
}
