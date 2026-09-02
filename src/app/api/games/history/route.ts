import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/games/history?offset=0&limit=50
 * Returns paginated game records for the authenticated user, plus opponent profiles.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

  const { data: games, error } = await supabase
    .from("games")
    .select(`
      id, status, winner, time_control, initial_minutes, increment_seconds,
      rated, white_player_id, black_player_id, white_rating, black_rating,
      white_rating_change, black_rating_change, move_count, created_at, ended_at,
      tournament_id
    `)
    .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch opponent profiles
  const opponentIds = new Set<string>();
  for (const g of games || []) {
    if (g.white_player_id !== user.id) opponentIds.add(g.white_player_id);
    if (g.black_player_id !== user.id) opponentIds.add(g.black_player_id);
  }

  const { data: opponents } = await supabase
    .from("profiles")
    .select("id, username, display_name, rating, avatar_url")
    .in("id", Array.from(opponentIds));

  const opponentMap: Record<string, any> = {};
  (opponents || []).forEach((o) => { opponentMap[o.id] = o; });

  return NextResponse.json({ games: games || [], opponents: opponentMap });
}
