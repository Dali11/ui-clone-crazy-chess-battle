import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { gameId } = await req.json();

    if (!gameId) {
      return NextResponse.json({ error: "Game ID required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch the original game
    const { data: originalGame, error: fetchError } = await admin
      .from("games")
      .select("id, status, time_control, initial_minutes, increment_seconds, rated, white_player_id, black_player_id, white_rating, black_rating")
      .eq("id", gameId)
      .single();

    if (fetchError || !originalGame) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Verify user was a player in that game
    const isWhite = originalGame.white_player_id === user.id;
    const isBlack = originalGame.black_player_id === user.id;

    if (!isWhite && !isBlack) {
      return NextResponse.json({ error: "Not a player in this game" }, { status: 403 });
    }

    // Verify game status is not 'playing'
    if (originalGame.status === "playing") {
      return NextResponse.json({ error: "Game is still in progress" }, { status: 400 });
    }

    // Fetch player profiles for ratings and display names
    const { data: whiteProfile } = await admin
      .from("profiles")
      .select("rating, display_name, username")
      .eq("id", originalGame.white_player_id)
      .single();

    const { data: blackProfile } = await admin
      .from("profiles")
      .select("rating, display_name, username")
      .eq("id", originalGame.black_player_id)
      .single();

    // Swap colors: white becomes black and black becomes white
    const newWhiteId = originalGame.black_player_id;
    const newBlackId = originalGame.white_player_id;
    const newWhiteRating = blackProfile?.rating ?? originalGame.black_rating ?? 1500;
    const newBlackRating = whiteProfile?.rating ?? originalGame.white_rating ?? 1500;

    // Create new game via admin RPC create_game
    const { data: newGameId, error: rpcError } = await admin.rpc("create_game", {
      p_white_id: newWhiteId,
      p_black_id: newBlackId,
      p_white_rating: newWhiteRating,
      p_black_rating: newBlackRating,
      p_time_control: originalGame.time_control || "blitz",
      p_initial_minutes: originalGame.initial_minutes ?? 3,
      p_increment_seconds: originalGame.increment_seconds ?? 2,
      p_rated: originalGame.rated ?? true,
    });

    if (rpcError || !newGameId) {
      console.error("Rematch create_game error:", rpcError);
      return NextResponse.json({ error: "Failed to create rematch game" }, { status: 500 });
    }

    // Determine requester name and opponent ID for notification
    const requesterProfile = isWhite ? whiteProfile : blackProfile;
    const requesterName = requesterProfile?.display_name || requesterProfile?.username || "Your opponent";
    const opponentId = isWhite ? originalGame.black_player_id : originalGame.white_player_id;

    // Insert notification for opponent
    await admin.from("notifications").insert({
      user_id: opponentId,
      type: "rematch",
      title: `Rematch request from ${requesterName}`,
      body: `${requesterName} challenged you to a rematch. Tap to play!`,
      data: { gameId: newGameId, fromGame: originalGame.id },
      read: false,
    });

    return NextResponse.json({ gameId: newGameId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
