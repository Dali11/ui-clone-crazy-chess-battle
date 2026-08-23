import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/game/rematch/accept
 * Opponent accepts the rematch — creates the game and notifies the requester.
 * Body: { offerId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { offerId } = await req.json();
    if (!offerId) return NextResponse.json({ error: "offerId required" }, { status: 400 });

    const admin = createAdminClient();

    const { data: offer } = await admin
      .from("rematch_offers")
      .select("*")
      .eq("id", offerId)
      .single();

    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

    // Must be the opponent to accept
    if (offer.opponent_id !== user.id) {
      return NextResponse.json({ error: "Only the opponent can accept" }, { status: 403 });
    }

    if (offer.status !== "pending") {
      return NextResponse.json({ error: `Offer already ${offer.status}` }, { status: 400 });
    }

    // Check if expired
    if (new Date(offer.expires_at) < new Date()) {
      await admin.from("rematch_offers").update({ status: "expired" }).eq("id", offerId);
      return NextResponse.json({ error: "Offer expired" }, { status: 410 });
    }

    // Fetch player profiles for current ratings
    const [requesterProfile, opponentProfile] = await Promise.all([
      admin.from("profiles").select("rating, display_name, username").eq("id", offer.requester_id).single(),
      admin.from("profiles").select("rating, display_name, username").eq("id", user.id).single(),
    ]);

    // Swap colors: requester was white -> becomes black, opponent was black -> becomes white
    const newWhiteId = offer.opponent_id;  // opponent gets white
    const newBlackId = offer.requester_id;  // requester gets black
    const newWhiteRating = opponentProfile.data?.rating ?? 1500;
    const newBlackRating = requesterProfile.data?.rating ?? 1500;

    // Create the game
    const { data: newGameId, error: rpcError } = await admin.rpc("create_game", {
      p_white_id: newWhiteId,
      p_black_id: newBlackId,
      p_white_rating: newWhiteRating,
      p_black_rating: newBlackRating,
      p_time_control: offer.time_control || "blitz",
      p_initial_minutes: offer.initial_minutes ?? 5,
      p_increment_seconds: offer.increment_seconds ?? 2,
      p_rated: offer.rated ?? true,
    });

    if (rpcError || !newGameId) {
      console.error("Rematch accept create_game error:", rpcError);
      return NextResponse.json({ error: "Failed to create rematch game" }, { status: 500 });
    }

    // Update the offer
    await admin.from("rematch_offers").update({
      status: "accepted",
      new_game_id: newGameId,
      responded_at: new Date().toISOString(),
    }).eq("id", offerId);

    // Notify the requester that the rematch is accepted
    const opponentName = opponentProfile.data?.display_name || opponentProfile.data?.username || "Your opponent";
    await admin.from("notifications").insert({
      user_id: offer.requester_id,
      type: "rematch_accepted",
      title: "Rematch accepted!",
      body: `${opponentName} accepted your rematch. The game is starting!`,
      data: { gameId: newGameId, offerId },
      read: false,
    });

    return NextResponse.json({ gameId: newGameId, offerId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
