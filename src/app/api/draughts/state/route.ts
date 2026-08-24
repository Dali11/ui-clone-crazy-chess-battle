import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lightweight endpoint that returns the current draughts game state.
// Used as a polling fallback when Supabase realtime drops.
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
      .from("draughts_games")
      .select("id, board_state, move_history, turn, status, winner, move_count, moves_since_capture, must_continue_jump, white_clock_ms, black_clock_ms, last_move_at, white_player_id, black_player_id, white_rating, black_rating, white_rating_change, black_rating_change, time_control, initial_minutes, increment_seconds, rated, created_at")
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
