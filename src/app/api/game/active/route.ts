import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Returns ANY active game (status = 'playing') for the authenticated user,
 * regardless of game type (free play, battle, tournament, league) and
 * regardless of whose turn it is.
 *
 * Used by ActiveGameRedirect to pull players back to their game when they
 * navigate elsewhere in the app — like chess.com, the only way out is
 * to resign (or the game ends naturally).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find any game where the user is a player and the game is still in progress.
  // This catches free play, battle, tournament, and league games — they all
  // live in the same `games` table with status = 'playing'.
  const { data: game } = await admin
    .from("games")
    .select("id, status, turn, move_count, white_player_id, black_player_id, tournament_id, league_fixture_id")
    .eq("status", "playing")
    .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!game) {
    return NextResponse.json({ active: false });
  }

  // Determine game type for the toast message
  let gameType: "free" | "battle" | "tournament" | "league" = "free";
  if (game.tournament_id) gameType = "tournament";
  else if (game.league_fixture_id) gameType = "league";
  else {
    // Check if it's a battle game by looking up the battles table
    const { data: battle } = await admin
      .from("battles")
      .select("id")
      .eq("game_id", game.id)
      .limit(1)
      .maybeSingle();
    if (battle) gameType = "battle";
  }

  const isWhite = game.white_player_id === user.id;
  const myTurn = (game.turn === "white" && isWhite) || (game.turn === "black" && !isWhite);

  return NextResponse.json({
    active: true,
    gameId: game.id,
    gameType,
    myTurn,
    moveCount: game.move_count || 0,
  });
}
