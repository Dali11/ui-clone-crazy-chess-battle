import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get battle status — used by client to poll for match.
 * Query: ?battleId=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    // Local JWT validation — polled every few seconds during matchmaking.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const battleId = searchParams.get("battleId");
    if (!battleId) return NextResponse.json({ error: "Battle ID required" }, { status: 400 });

    const admin = createAdminClient();
    const { data: battle } = await admin
      .from("battles")
      .select("white_player_id, black_player_id, white_rating, black_rating, status, game_id, stake, winner_payout, armageddon_game_id, armageddon_round")
      .eq("id", battleId)
      .single();

    if (!battle) return NextResponse.json({ error: "Battle not found" }, { status: 404 });

    if (battle.white_player_id !== user.id && battle.black_player_id !== user.id) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const opponentId = battle.white_player_id === user.id
      ? battle.black_player_id
      : battle.white_player_id;
    const opponentRating = battle.white_player_id === user.id
      ? battle.black_rating
      : battle.white_rating;

    const { data: opponent } = await admin
      .from("profiles")
      .select("username, display_name, rating")
      .eq("id", opponentId)
      .single();

    return NextResponse.json({
      status: battle.status,
      gameId: battle.status === "draw_armageddon" ? (battle.armageddon_game_id ?? battle.game_id) : battle.game_id,
      armageddonGameId: battle.armageddon_game_id,
      armageddonRound: battle.armageddon_round,
      opponent: opponent
        ? {
            username: opponent.username,
            display_name: opponent.display_name,
            rating: opponentRating ?? opponent.rating ?? 1200,
          }
        : null,
      stake: battle.stake,
      payout: battle.winner_payout,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch battle status" }, { status: 500 });
  }
}
