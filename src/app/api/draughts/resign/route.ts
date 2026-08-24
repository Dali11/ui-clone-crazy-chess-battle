import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { gameId } = await req.json();
    if (!gameId) {
      return NextResponse.json({ error: "Game ID required" }, { status: 400 });
    }

    const { data: game } = await supabase
      .from("draughts_games")
      .select("id, white_player_id, black_player_id, status, white_rating, black_rating, rated")
      .eq("id", gameId)
      .single();

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (game.status !== "playing") {
      return NextResponse.json({ error: "Game is not in progress" }, { status: 400 });
    }

    const isWhite = game.white_player_id === user.id;
    const isBlack = game.black_player_id === user.id;

    if (!isWhite && !isBlack) {
      return NextResponse.json({ error: "Not a player in this game" }, { status: 403 });
    }

    const winner = isWhite ? "black" : "white";
    const admin = createAdminClient();

    await admin.from("draughts_games").update({
      status: "resign",
      winner,
      ended_at: new Date().toISOString(),
    }).eq("id", gameId);

    // Update ratings
    const { data: whiteProfile } = await admin
      .from("profiles")
      .select("draughts_rating, draughts_games_played, draughts_wins, draughts_losses")
      .eq("id", game.white_player_id)
      .single();

    const { data: blackProfile } = await admin
      .from("profiles")
      .select("draughts_rating, draughts_games_played, draughts_wins, draughts_losses")
      .eq("id", game.black_player_id)
      .single();

    if (whiteProfile && blackProfile) {
      const whiteRating = whiteProfile.draughts_rating || 1500;
      const blackRating = blackProfile.draughts_rating || 1500;
      const K = 32;
      const whiteExpected = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
      const whiteScore = winner === "white" ? 1 : 0;
      const whiteNewRating = Math.round(whiteRating + K * (whiteScore - whiteExpected));
      const blackNewRating = Math.round(blackRating + K * ((1 - whiteScore) - (1 - whiteExpected)));

      await admin.from("profiles").update({
        draughts_rating: whiteNewRating,
        draughts_games_played: (whiteProfile.draughts_games_played || 0) + 1,
        draughts_wins: (whiteProfile.draughts_wins || 0) + (winner === "white" ? 1 : 0),
        draughts_losses: (whiteProfile.draughts_losses || 0) + (winner === "black" ? 1 : 0),
      }).eq("id", game.white_player_id);

      await admin.from("profiles").update({
        draughts_rating: blackNewRating,
        draughts_games_played: (blackProfile.draughts_games_played || 0) + 1,
        draughts_wins: (blackProfile.draughts_wins || 0) + (winner === "black" ? 1 : 0),
        draughts_losses: (blackProfile.draughts_losses || 0) + (winner === "white" ? 1 : 0),
      }).eq("id", game.black_player_id);

      await admin.from("draughts_games").update({
        white_rating_change: whiteNewRating - whiteRating,
        black_rating_change: blackNewRating - blackRating,
      }).eq("id", gameId);
    }

    return NextResponse.json({ ok: true, winner });
  } catch {
    return NextResponse.json({ error: "Resign failed" }, { status: 500 });
  }
}
