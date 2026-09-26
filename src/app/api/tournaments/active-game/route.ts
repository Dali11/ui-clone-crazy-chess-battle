import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Returns where a registered player in a LIVE tournament is required to
 * be RIGHT NOW — the single source of truth for the app-wide
 * ActiveTournamentWatcher (owner rule 2026-09-26: a player in a live
 * tournament must be pulled back to it from anywhere in the app):
 *
 *  - destination "game": their round game exists — waiting for the
 *    round's scheduled start, or already playing → they belong on
 *    /game/[id]
 *  - destination "tournament": the tournament is live, they're still in
 *    it, but no game of theirs exists yet (arena between waves, swiss/
 *    knockout between rounds, waiting for pairings) → they belong on
 *    /tournament/[id]
 *  - active false: no obligation — logged out, not registered, or only
 *    in tournaments that are upcoming/paused/completed. Eliminated
 *    players are never bound.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const admin = createAdminClient();

  // Tournaments the user is registered for and not eliminated from
  const { data: registrations } = await admin
    .from("tournament_participants")
    .select("tournament_id")
    .eq("player_id", user.id)
    .eq("eliminated", false);

  if (!registrations || registrations.length === 0) {
    return NextResponse.json({ active: false });
  }

  const tournamentIds = registrations.map((r) => r.tournament_id);

  // Only LIVE tournaments bind the player
  const { data: liveTournaments } = await admin
    .from("tournaments")
    .select("id, type")
    .in("id", tournamentIds)
    .eq("status", "active")
    .order("starts_at", { ascending: false });

  if (!liveTournaments || liveTournaments.length === 0) {
    return NextResponse.json({ active: false });
  }

  const liveIds = liveTournaments.map((t) => t.id);

  // Their round game in a live tournament — waiting (round start
  // scheduled, they must be at the board for the countdown) or playing.
  const { data: games } = await admin
    .from("games")
    .select("id, tournament_id, status, white_player_id, black_player_id")
    .in("tournament_id", liveIds)
    .in("status", ["waiting", "playing"])
    .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
    .limit(5);

  if (games && games.length > 0) {
    // Prefer a playing game over a waiting one (arena could momentarily
    // have a next-round pairing while the previous is still finishing).
    const game = games.find((g) => g.status === "playing") || games[0];
    const tournament = liveTournaments.find((t) => t.id === game.tournament_id);
    return NextResponse.json({
      active: true,
      destination: "game",
      gameId: game.id,
      tournamentId: game.tournament_id,
      tournamentType: tournament?.type,
    });
  }

  // Live tournament, still registered, no game yet → the tournament page
  // (arena matchmaking waves and round pairings pick them up there).
  const tournament = liveTournaments[0];
  return NextResponse.json({
    active: true,
    destination: "tournament",
    tournamentId: tournament.id,
    tournamentType: tournament.type,
  });
}
