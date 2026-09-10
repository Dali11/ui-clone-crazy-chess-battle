import { NextRequest, NextResponse } from "next/server";
import { awardGameXp } from "@/lib/league-xp/award";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { gameId, action } = await req.json();
    if (!gameId || !action) {
      return NextResponse.json({ error: "Game ID and action required" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: game, error } = await admin
      .from("draughts_games")
      .select("id, status, white_player_id, black_player_id, rated, white_rating, black_rating, time_control, variant")
      .eq("id", gameId)
      .single();

    if (error || !game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (game.status !== "playing") {
      return NextResponse.json({ error: "Game is not active" }, { status: 400 });
    }

    const isWhite = game.white_player_id === user.id;
    const isBlack = game.black_player_id === user.id;
    if (!isWhite && !isBlack) {
      return NextResponse.json({ error: "You are not a player in this game" }, { status: 403 });
    }

    if (action === "offer") {
      const channel = admin.channel(`draughts_game:${gameId}`);
      await channel.send({
        type: "broadcast",
        event: "draw_offer",
        payload: { from: user.id },
      });
      return NextResponse.json({ success: true, message: "Draw offer sent" });
    }

    if (action === "accept") {
      // End the game as a draw
      await admin
        .from("draughts_games")
        .update({
          status: "draw",
          winner: null,
          ended_at: new Date().toISOString(),
        })
        .eq("id", gameId);

      // XP Leagues: award draw XP for the finished game (idempotent).
      awardGameXp({
        gameId,
        gameKind: "draughts",
        game: { white_player_id: game.white_player_id, black_player_id: game.black_player_id, winner: null, white_rating: game.white_rating, black_rating: game.black_rating },
        admin,
      }).catch(() => {});

      // Update ratings for draw
      if (game.rated && game.white_rating && game.black_rating) {
        const whiteRating = game.white_rating;
        const blackRating = game.black_rating;
        const expectedWhite = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
        const K = 32;
        const whiteChange = Math.round(K * (0.5 - expectedWhite));
        const blackChange = -whiteChange;

        await admin
          .from("draughts_games")
          .update({
            white_rating_change: whiteChange,
            black_rating_change: blackChange,
          })
          .eq("id", gameId);

        const { data: whiteProfile } = await admin
          .from("profiles")
          .select("draughts_rating, draughts_games_played, draughts_draws")
          .eq("id", game.white_player_id)
          .single();

        const { data: blackProfile } = await admin
          .from("profiles")
          .select("draughts_rating, draughts_games_played, draughts_draws")
          .eq("id", game.black_player_id)
          .single();

        if (whiteProfile) {
          await admin.from("profiles").update({
            draughts_rating: whiteRating + whiteChange,
            draughts_draws: (whiteProfile.draughts_draws ?? 0) + 1,
            draughts_games_played: (whiteProfile.draughts_games_played ?? 0) + 1,
          }).eq("id", game.white_player_id);
        }

        if (blackProfile) {
          await admin.from("profiles").update({
            draughts_rating: blackRating + blackChange,
            draughts_draws: (blackProfile.draughts_draws ?? 0) + 1,
            draughts_games_played: (blackProfile.draughts_games_played ?? 0) + 1,
          }).eq("id", game.black_player_id);
        }
      }

      // Broadcast draw_accepted
      const channel = admin.channel(`draughts_game:${gameId}`);
      await channel.send({
        type: "broadcast",
        event: "draw_accepted",
        payload: { from: user.id },
      });

      return NextResponse.json({ success: true, status: "draw" });
    }

    if (action === "decline") {
      const channel = admin.channel(`draughts_game:${gameId}`);
      await channel.send({
        type: "broadcast",
        event: "draw_declined",
        payload: { from: user.id },
      });
      return NextResponse.json({ success: true, message: "Draw declined" });
    }

    return NextResponse.json({ error: "Invalid action. Use: offer, accept, or decline" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to process draw action" }, { status: 500 });
  }
}
