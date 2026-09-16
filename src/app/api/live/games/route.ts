import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET — returns all currently live chess games.
 * Prioritizes the requesting user's own games first.
 *
 * NOTE: spectator_count is fetched with a graceful fallback — if the column
 * doesn't exist yet (pre-migration), we retry without it so live tracking
 * never breaks due to a missing optional column.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    const baseFields = `
        id, status, time_control, initial_minutes, increment_seconds, rated,
        turn, move_count, white_clock_ms, black_clock_ms,
        last_move_at, tournament_id, league_id, league_fixture_id,
        white_player_id, black_player_id,
        white_player:profiles!games_white_player_id_fkey(id, username, display_name, avatar_url, rating),
        black_player:profiles!games_black_player_id_fkey(id, username, display_name, avatar_url, rating)`;

    // Try with spectator_count first; fall back if the column isn't migrated yet.
    let chessGames: any[] | null = null;
    {
      const { data, error } = await admin
        .from("games")
        .select(`${baseFields}, spectator_count`)
        .eq("status", "playing")
        .order("last_move_at", { ascending: false })
        .limit(50);

      if (!error) {
        chessGames = data;
      } else {
        const { data: fallbackData } = await admin
          .from("games")
          .select(baseFields)
          .eq("status", "playing")
          .order("last_move_at", { ascending: false })
          .limit(50);
        chessGames = fallbackData;
      }
    }

    const allGames: any[] = [];

    for (const g of chessGames || []) {
      const isMyGame = user && (g.white_player_id === user.id || g.black_player_id === user.id);
      allGames.push({
        id: g.id,
        status: g.status,
        time_control: g.time_control,
        initial_minutes: g.initial_minutes,
        increment_seconds: g.increment_seconds || 0,
        rated: g.rated,
        turn: g.turn,
        move_count: g.move_count || 0,
        white_clock_ms: g.white_clock_ms,
        black_clock_ms: g.black_clock_ms,
        last_move_at: g.last_move_at,
        tournament_id: g.tournament_id,
        league_id: g.league_id,
        league_fixture_id: g.league_fixture_id,
        spectator_count: g.spectator_count || 0,
        white_player: g.white_player,
        black_player: g.black_player,
        is_my_game: !!isMyGame,
        game_type: "chess" as const,
      });
    }

    // Sort: my games first, then by most recent activity
    allGames.sort((a, b) => {
      if (a.is_my_game && !b.is_my_game) return -1;
      if (!a.is_my_game && b.is_my_game) return 1;
      return new Date(b.last_move_at).getTime() - new Date(a.last_move_at).getTime();
    });

    return NextResponse.json({ games: allGames });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, games: [] }, { status: 500 });
  }
}
