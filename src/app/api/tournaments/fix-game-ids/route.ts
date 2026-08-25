import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ccb-cron-secret-2026`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const tournamentId = "72070961-022e-4026-a846-f87dbd32883e";

  // Get all games for this tournament
  const { data: games, error: gamesError } = await admin
    .from("games")
    .select("id, white_player_id, black_player_id, tournament_round")
    .eq("tournament_id", tournamentId);

  if (gamesError) {
    return NextResponse.json({ error: gamesError.message }, { status: 500 });
  }

  // Get the current round
  const { data: rounds, error: roundsError } = await admin
    .from("tournament_rounds")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("round_number", 1)
    .single();

  if (roundsError) {
    return NextResponse.json({ error: roundsError.message }, { status: 500 });
  }

  // Match games to pairings by white/black player IDs
  const pairings = rounds.pairings as any[];
  const updatedPairings = pairings.map((pairing) => {
    const game = games?.find(
      (g) =>
        g.white_player_id === pairing.white &&
        g.black_player_id === pairing.black
    );
    if (game) {
      return { ...pairing, game_id: game.id };
    }
    return pairing;
  });

  // Update the round with game_ids
  const { error: updateError } = await admin
    .from("tournament_rounds")
    .update({ pairings: updatedPairings })
    .eq("id", rounds.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const linked = updatedPairings.filter((p) => p.game_id).length;
  return NextResponse.json({
    success: true,
    linked,
    total: pairings.length,
    pairings: updatedPairings.map((p) => ({
      board: p.board,
      game_id: p.game_id || "MISSING",
      white: p.white?.slice(0, 8),
      black: p.black?.slice(0, 8),
    })),
  });
}
