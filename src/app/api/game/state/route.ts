import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lightweight endpoint that returns the current game state.
// Used as a polling fallback when Supabase realtime drops (common on mobile
// networks). The client polls this every ~2s and ignores responses where the
// move_count hasn't advanced, so it's a cheap single-row SELECT.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gameId = req.nextUrl.searchParams.get("gameId");
    if (!gameId) {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }

    const { data: game, error } = await supabase
      .from("games")
      .select("id, fen, pgn, turn, status, winner, move_count, white_clock_ms, black_clock_ms, last_move_at, white_player_id, black_player_id, white_rating, black_rating, white_rating_change, black_rating_change, time_control, initial_minutes, increment_seconds, rated, created_at, scheduled_start, tournament_id")
      .eq("id", gameId)
      .single();

    if (error || !game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    return NextResponse.json(game);
  } catch {
    return NextResponse.json({ error: "Failed to fetch game state" }, { status: 500 });
  }
}
