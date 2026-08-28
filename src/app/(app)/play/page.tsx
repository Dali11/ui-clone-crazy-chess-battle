import type { Metadata } from "next";
import PlayClient from "./play-client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Play Chess Online — Live Games",
  description: "Play chess online against players worldwide. Choose from blitz, bullet, and rapid time controls. Find a match instantly on Crazy Chess Battles.",
  path: "/play",
});

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  // ── Tournament game redirect ──
  // Block access to the play page if the user has an active tournament
  // game where it's their turn. They need to finish their tournament
  // round first.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const admin = createAdminClient();
    const { data: activeTournaments } = await admin
      .from("tournament_participants")
      .select("tournament_id")
      .eq("player_id", user.id)
      .eq("eliminated", false);

    if (activeTournaments && activeTournaments.length > 0) {
      const tournamentIds = activeTournaments.map((t) => t.tournament_id);
      const { data: activeGame } = await admin
        .from("games")
        .select("id, tournament_id, status, turn, white_player_id, black_player_id")
        .in("tournament_id", tournamentIds)
        .eq("status", "playing")
        .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
        .limit(1)
        .maybeSingle();

      if (activeGame) {
        const { data: tournament } = await admin
          .from("tournaments")
          .select("status")
          .eq("id", activeGame.tournament_id)
          .single();

        if (tournament?.status === "active") {
          const isWhite = activeGame.white_player_id === user.id;
          const isBlack = activeGame.black_player_id === user.id;
          const myTurn = (activeGame.turn === "white" && isWhite) || (activeGame.turn === "black" && isBlack);
          if (myTurn) {
            redirect(`/game/${activeGame.id}`);
          }
        }
      }
    }
  }

  return <PlayClient />;
}
