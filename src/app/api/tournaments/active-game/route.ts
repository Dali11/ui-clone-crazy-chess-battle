import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Returns the active tournament game for the authenticated user — a game
 * that is "playing" inside a tournament that is "active", where it's the
 * user's turn (or the game just started and nobody has moved yet).
 *
 * Used by the ActiveTournamentWatcher to redirect players to their
 * tournament game as soon as they open the app.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find tournaments the user is registered for that are currently active
  const { data: activeTournaments } = await admin
    .from("tournament_participants")
    .select("tournament_id")
    .eq("player_id", user.id)
    .eq("eliminated", false);

  if (!activeTournaments || activeTournaments.length === 0) {
    return NextResponse.json({ active: false });
  }

  const tournamentIds = activeTournaments.map((t) => t.tournament_id);

  // Find games that are "playing" in those active tournaments where the
  // user is a participant.
  const { data: games } = await admin
    .from("games")
    .select("id, tournament_id, status, turn, move_count, white_player_id, black_player_id")
    .in("tournament_id", tournamentIds)
    .eq("status", "playing")
    .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
    .limit(5);

  if (!games || games.length === 0) {
    return NextResponse.json({ active: false });
  }

  // Verify the tournament is actually "active" (live)
  const game = games[0];
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, status, type")
    .eq("id", game.tournament_id)
    .single();

  if (!tournament || tournament.status !== "active") {
    return NextResponse.json({ active: false });
  }

  // It's the player's turn if:
  // - game.turn matches their color, OR
  // - move_count is 0 (white's turn, game just started)
  const isWhite = game.white_player_id === user.id;
  const isBlack = game.black_player_id === user.id;
  const myTurn = (game.turn === "white" && isWhite) || (game.turn === "black" && isBlack);

  if (!myTurn) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    gameId: game.id,
    tournamentId: tournament.id,
    tournamentType: tournament.type,
  });
}
