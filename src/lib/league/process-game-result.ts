import { createAdminClient } from "@/lib/supabase/admin";
import { recalcStandings } from "@/lib/league/engine";

interface LeagueGameResult {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  winner: "white" | "black" | "draw";
  status: string;
}

/**
 * Process a finished league game:
 * 1. Find the league fixture linked to this game
 * 2. Update the fixture result (home_win / away_win / draw)
 * 3. Recalculate league standings
 *
 * This mirrors processTournamentGameResult but for league fixtures.
 * Called from game-ending endpoints (resign, timeout, move) when the
 * game has a league_fixture_id.
 */
export async function processLeagueGameResult(result: LeagueGameResult) {
  try {
    const admin = createAdminClient();

    // Check if this game is linked to a league fixture
    const { data: game, error: gameErr } = await admin
      .from("games")
      .select("league_fixture_id, league_id")
      .eq("id", result.gameId)
      .single();

    if (gameErr || !game || !game.league_fixture_id) return;

    const fixtureId = game.league_fixture_id;
    const leagueId = game.league_id;

    // Get the fixture to know home/away players
    const { data: fixture, error: fixtureErr } = await admin
      .from("league_fixtures")
      .select("id, league_id, home_player_id, away_player_id, played")
      .eq("id", fixtureId)
      .single();

    if (fixtureErr || !fixture) {
      console.error("[league] Fixture not found for game", result.gameId, fixtureErr?.message);
      return;
    }

    if (fixture.played) {
      console.log("[league] Fixture already played, skipping:", fixtureId);
      return;
    }

    // Map game winner to fixture result
    // home_player_id is "white" (home = white), away_player_id is "black" (away = black)
    let fixtureResult: string;
    if (result.winner === "draw") {
      fixtureResult = "draw";
    } else if (result.winner === "white") {
      // White won → home player won (assuming home = white)
      fixtureResult = fixture.home_player_id === result.whitePlayerId ? "home_win" : "away_win";
    } else {
      // Black won → the black player won
      fixtureResult = fixture.home_player_id === result.blackPlayerId ? "home_win" : "away_win";
    }

    // Update the fixture
    await admin
      .from("league_fixtures")
      .update({
        result: fixtureResult,
        played: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fixtureId);

    // Recalculate standings
    if (leagueId || fixture.league_id) {
      await recalcStandings(admin as any, leagueId || fixture.league_id);
    }

    console.log(`[league] Fixture ${fixtureId} resolved: ${fixtureResult}`);
  } catch (err) {
    console.error("[processLeagueGameResult] FATAL error processing game", result.gameId, err);
  }
}
