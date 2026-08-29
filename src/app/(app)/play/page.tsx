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
    // Redirect to ANY active game — free play, battle, tournament, or league.
    // No turn restriction — like chess.com, you go to your game until it's done.
    const { data: activeGame } = await admin
      .from("games")
      .select("id, status")
      .eq("status", "playing")
      .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeGame) {
      redirect(`/game/${activeGame.id}`);
    }
  }

  return <PlayClient />;
}
