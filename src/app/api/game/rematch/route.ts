import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/game/rematch
 * Creates a rematch offer (pending) and notifies the opponent.
 * The game is NOT created yet — only when the opponent accepts.
 * Body: { gameId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { gameId } = await req.json();
    if (!gameId) return NextResponse.json({ error: "Game ID required" }, { status: 400 });

    const admin = createAdminClient();

    // Fetch the original game
    const { data: game, error: fetchError } = await admin
      .from("games")
      .select("id, status, time_control, initial_minutes, increment_seconds, rated, white_player_id, black_player_id")
      .eq("id", gameId)
      .single();

    if (fetchError || !game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    // Verify user was a player
    const isWhite = game.white_player_id === user.id;
    const isBlack = game.black_player_id === user.id;
    if (!isWhite && !isBlack) return NextResponse.json({ error: "Not a player in this game" }, { status: 403 });

    // Game must be over
    if (game.status === "playing") return NextResponse.json({ error: "Game still in progress" }, { status: 400 });

    // Check for existing pending rematch offer from this game
    const { data: existing } = await admin
      .from("rematch_offers")
      .select("id, status")
      .eq("from_game_id", gameId)
      .eq("status", "pending")
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "A rematch offer is already pending for this game", offerId: existing[0].id }, { status: 409 });
    }

    const opponentId = isWhite ? game.black_player_id : game.white_player_id;
    // Create the rematch offer
    const { data: offer, error: offerErr } = await admin
      .from("rematch_offers")
      .insert({
        from_game_id: gameId,
        requester_id: user.id,
        opponent_id: opponentId,
        status: "pending",
        time_control: game.time_control,
        initial_minutes: game.initial_minutes,
        increment_seconds: game.increment_seconds,
        rated: game.rated,
      })
      .select("id")
      .single();

    if (offerErr || !offer) {
      console.error("Rematch offer insert error:", offerErr);
      return NextResponse.json({ error: "Failed to create rematch offer" }, { status: 500 });
    }

    // No in-app notification — the game client polls for incoming offers in real-time
    return NextResponse.json({ offerId: offer.id, status: "pending" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

/**
 * GET /api/game/rematch?offerId=...
 * Check the status of a rematch offer (polled by the requester while waiting).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const offerId = req.nextUrl.searchParams.get("offerId");
    if (!offerId) return NextResponse.json({ error: "offerId required" }, { status: 400 });

    const admin = createAdminClient();
    const { data: offer } = await admin
      .from("rematch_offers")
      .select("id, status, new_game_id, from_game_id, requester_id, opponent_id")
      .eq("id", offerId)
      .single();

    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

    // Only participants can check
    if (offer.requester_id !== user.id && offer.opponent_id !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json(offer);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
