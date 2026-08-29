import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET — returns all currently live games (chess + draughts)
 * Prioritizes the requesting user's own games first.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch live chess games
    const { data: chessGames } = await admin
      .from("games")
      .select(`
        id, status, time_control, initial_minutes, increment_seconds, rated,
        turn, move_count, fen, pgn, white_clock_ms, black_clock_ms,
        last_move_at, tournament_id, league_id, league_fixture_id,
        white_player_id, black_player_id,
        white_player:profiles!games_white_player_id_fkey(id, username, display_name, avatar_url, rating),
        black_player:profiles!games_black_player_id_fkey(id, username, display_name, avatar_url, rating)
      `)
      .eq("status", "playing")
      .order("last_move_at", { ascending: false })
      .limit(50);

    // Fetch live draughts games
    const { data: draughtsGames } = await admin
      .from("draughts_games")
      .select(`
        id, status, time_control, initial_minutes, increment_seconds, rated,
        turn, move_count, white_clock_ms, black_clock_ms,
        last_move_at, variant,
        white_player_id, black_player_id,
        white_player:profiles!draughts_games_white_player_id_fkey(id, username, display_name, avatar_url, rating),
        black_player:profiles!draughts_games_black_player_id_fkey(id, username, display_name, avatar_url, rating)
      `)
      .eq("status", "playing")
      .order("last_move_at", { ascending: false })
      .limit(20);

    const allGames: any[] = [];

    // Normalize chess games
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
        fen: g.fen,
        pgn: g.pgn,
        white_clock_ms: g.white_clock_ms,
        black_clock_ms: g.black_clock_ms,
        last_move_at: g.last_move_at,
        tournament_id: g.tournament_id,
        league_id: g.league_id,
        league_fixture_id: g.league_fixture_id,
        white_player: g.white_player,
        black_player: g.black_player,
        is_my_game: !!isMyGame,
        game_type: "chess" as const,
      });
    }

    // Normalize draughts games
    for (const g of draughtsGames || []) {
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
        fen: null,
        pgn: null,
        white_clock_ms: g.white_clock_ms,
        black_clock_ms: g.black_clock_ms,
        last_move_at: g.last_move_at,
        tournament_id: null,
        league_id: null,
        league_fixture_id: null,
        white_player: g.white_player,
        black_player: g.black_player,
        is_my_game: !!isMyGame,
        game_type: "draughts" as const,
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
