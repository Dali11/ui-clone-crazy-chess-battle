import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lightweight endpoint that returns the current game state.
 * Used as a polling fallback when SUPABASE realtime drops (common on mobile
 * networks). The client polls this frequently and ignores responses where the
 * move_count hasn't advanced, so it's a cheap single-row SELECT.
 *
 * IMPORTANT: This endpoint must work for spectators too. If the user's auth
 * session has expired (common on mobile), we fall back to the admin client
 * to read the game — games are publicly viewable (RLS policy: USING TRUE),
 * so this is safe.
 *
 * ALSO: If a game is in "waiting" status and its scheduled_start has passed,
 * this endpoint auto-transitions it to "playing" and sets last_move_at.
 * This ensures games start on time even without a cron job — as soon as
 * any player or spectator polls the state after the countdown, the game
 * begins.
 */
export async function GET(req: NextRequest) {
  try {
    const gameId = req.nextUrl.searchParams.get("gameId");
    if (!gameId) {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }

    // Try user-scoped client first (respects RLS, uses user's session)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: game, error } = await supabase
        .from("games")
        .select("id, fen, pgn, turn, status, winner, move_count, white_clock_ms, black_clock_ms, last_move_at, white_player_id, black_player_id, white_rating, black_rating, white_rating_change, black_rating_change, time_control, initial_minutes, increment_seconds, rated, created_at, scheduled_start, tournament_id")
        .eq("id", gameId)
        .single();

      if (!error && game) {
        // Auto-transition waiting → playing when scheduled_start has passed
        if (game.status === "waiting" && game.scheduled_start) {
          const now = Date.now();
          const start = new Date(game.scheduled_start).getTime();
          if (now >= start) {
            const admin = createAdminClient();
            const nowIso = new Date().toISOString();
            await admin
              .from("games")
              .update({ status: "playing", last_move_at: nowIso })
              .eq("id", gameId);
            // Return updated state immediately
            return NextResponse.json({ ...game, status: "playing", last_move_at: nowIso });
          }
        }
        return NextResponse.json(game);
      }
    }

    // Fallback for spectators or expired sessions — games are publicly readable
    const admin = createAdminClient();
    const { data: game, error } = await admin
      .from("games")
      .select("id, fen, pgn, turn, status, winner, move_count, white_clock_ms, black_clock_ms, last_move_at, white_player_id, black_player_id, white_rating, black_rating, white_rating_change, black_rating_change, time_control, initial_minutes, increment_seconds, rated, created_at, scheduled_start, tournament_id")
      .eq("id", gameId)
      .single();

    if (error || !game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Auto-transition waiting → playing when scheduled_start has passed
    if (game.status === "waiting" && game.scheduled_start) {
      const now = Date.now();
      const start = new Date(game.scheduled_start).getTime();
      if (now >= start) {
        const nowIso = new Date().toISOString();
        await admin
          .from("games")
          .update({ status: "playing", last_move_at: nowIso })
          .eq("id", gameId);
        return NextResponse.json({ ...game, status: "playing", last_move_at: nowIso });
      }
    }

    return NextResponse.json(game);
  } catch {
    return NextResponse.json({ error: "Failed to fetch game state" }, { status: 500 });
  }
}
