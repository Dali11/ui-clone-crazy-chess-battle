import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Chess } from "chess.js";
import { settleBattle } from "@/lib/battles/settle";
import { processTournamentGameResult } from "@/lib/tournament/results";

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

    // Fetch game
    const { data: game, error } = await admin
      .from("games")
      .select("id, status, white_player_id, black_player_id, fen, rated, white_rating, black_rating, time_control, tournament_id, tournament_round")
      .eq("id", gameId)
      .single();

    if (error || !game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (game.status !== "playing") {
      return NextResponse.json({ error: "Game is not active" }, { status: 400 });
    }

    // Verify user is a player in this game
    const isWhite = game.white_player_id === user.id;
    const isBlack = game.black_player_id === user.id;
    if (!isWhite && !isBlack) {
      return NextResponse.json({ error: "You are not a player in this game" }, { status: 403 });
    }

    if (action === "offer") {
      // Broadcast draw offer to opponent via realtime
      const channel = admin.channel(`game:${gameId}`);
      await channel.send({
        type: "broadcast",
        event: "draw_offer",
        payload: { from: user.id },
      });
      return NextResponse.json({ success: true, message: "Draw offer sent" });
    }

    if (action === "accept") {
      // End the game as a draw
      const chess = new Chess(game.fen);

      await admin
        .from("games")
        .update({
          status: chess.isStalemate() ? "stalemate" : "draw",
          winner: null,
          ended_at: new Date().toISOString(),
        })
        .eq("id", gameId);

      // Update ratings for draw
      if (game.rated && game.white_rating && game.black_rating) {
        const whiteRating = game.white_rating;
        const blackRating = game.black_rating;
        const expectedWhite = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
        const K = 32;
        const whiteChange = Math.round(K * (0.5 - expectedWhite));
        const blackChange = -whiteChange;

        await admin
          .from("games")
          .update({
            white_rating_change: whiteChange,
            black_rating_change: blackChange,
          })
          .eq("id", gameId);

        // Fetch current stats
        const { data: whiteProfile } = await admin.from("profiles").select("draws, games_played, rating").eq("id", game.white_player_id).single();
        const { data: blackProfile } = await admin.from("profiles").select("draws, games_played, rating").eq("id", game.black_player_id).single();

        await admin.from("profiles").update({
          rating: whiteRating + whiteChange,
          draws: (whiteProfile?.draws ?? 0) + 1,
          games_played: (whiteProfile?.games_played ?? 0) + 1,
        }).eq("id", game.white_player_id);

        await admin.from("profiles").update({
          rating: blackRating + blackChange,
          draws: (blackProfile?.draws ?? 0) + 1,
          games_played: (blackProfile?.games_played ?? 0) + 1,
        }).eq("id", game.black_player_id);
      }

      // Broadcast draw_accepted so the opponent's UI clears the "waiting" state
      const channel = admin.channel(`game:${gameId}`);
      await channel.send({
        type: "broadcast",
        event: "draw_accepted",
        payload: { from: user.id },
      });

      // Check if this is a Battle game — draw triggers armageddon
      const { data: battle } = await admin
        .from("battles")
        .select("id, status, white_player_id, black_player_id, armageddon_game_id")
        .or(`game_id.eq.${gameId},armageddon_game_id.eq.${gameId}`)
        .in("status", ["playing", "draw_armageddon"])
        .limit(1)
        .single();

      if (battle) {
        settleBattle(battle.id, null, "draw").catch((e) => console.error("Battle settlement failed:", e));
      }

      // Process tournament game result if this is a tournament game
      if (game.tournament_id) {
        try {
        await processTournamentGameResult({
          gameId,
          whitePlayerId: game.white_player_id,
          blackPlayerId: game.black_player_id,
          winner: "draw",
          status: chess.isStalemate() ? "stalemate" : "draw",
        });
      } catch (e) {
        console.error("[draw] Tournament processing failed for game", gameId, e);
      }
      }

      return NextResponse.json({ success: true, status: "draw" });
    }

    if (action === "decline") {
      // Broadcast the decline
      const channel = admin.channel(`game:${gameId}`);
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
