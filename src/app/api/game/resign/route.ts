import { processTournamentGameResult } from "@/lib/tournament/results";
import { processLeagueGameResult } from "@/lib/league/process-game-result";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleBattle } from "@/lib/battles/settle";

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
      .from("games")
      .select("id, white_player_id, black_player_id, status")
      .eq("id", gameId)
      .single();

    if (!game || game.status !== "playing") {
      return NextResponse.json({ error: "Game not found or not in progress" }, { status: 400 });
    }

    const isWhite = game.white_player_id === user.id;
    const isBlack = game.black_player_id === user.id;

    if (!isWhite && !isBlack) {
      return NextResponse.json({ error: "Not a player in this game" }, { status: 403 });
    }

    // Resign — opponent wins
    const winner = isWhite ? "black" : "white";
    const admin = createAdminClient();

    // Atomic claim: only succeed if the game is still "playing" at the
    // moment of update. This prevents a race where the cron's no-show/
    // timeout sweep (or a duplicate client request) resolves the same
    // game concurrently, which would double-process the tournament result
    const { data: claimedGame, error: updateError } = await admin.from("games").update({
      status: "resign",
      winner,
      ended_at: new Date().toISOString(),
    }).eq("id", gameId).eq("status", "playing").select("id").single();

    if (updateError || !claimedGame) {
      // Someone else (cron sweep, duplicate request) already resolved this
      // game — treat as already-resigned rather than an error.
      return NextResponse.json({ error: "Game already resolved" }, { status: 409 });
    }

    // Broadcast resignation to opponent via realtime for instant notification
    const channel = admin.channel(`game:${gameId}`);
    await channel.send({
      type: "broadcast",
      event: "resign",
      payload: { from: user.id, winner },
    });

    // Update ratings
    const { data: whiteProfile } = await admin
      .from("profiles")
      .select("rating, games_played, wins, losses, draws")
      .eq("id", game.white_player_id)
      .single();

    const { data: blackProfile } = await admin
      .from("profiles")
      .select("rating, games_played, wins, losses, draws")
      .eq("id", game.black_player_id)
      .single();

    if (whiteProfile && blackProfile) {
      const K = 32;
      const whiteExpected = 1 / (1 + Math.pow(10, (blackProfile.rating - whiteProfile.rating) / 400));
      const blackExpected = 1 - whiteExpected;
      const whiteScore = winner === "white" ? 1 : 0;
      const blackScore = 1 - whiteScore;

      const whiteNewRating = Math.round(whiteProfile.rating + K * (whiteScore - whiteExpected));
      const blackNewRating = Math.round(blackProfile.rating + K * (blackScore - blackExpected));

      await admin.from("profiles").update({
        rating: whiteNewRating,
        games_played: (whiteProfile.games_played || 0) + 1,
        wins: (whiteProfile.wins || 0) + (winner === "white" ? 1 : 0),
        losses: (whiteProfile.losses || 0) + (winner === "black" ? 1 : 0),
      }).eq("id", game.white_player_id);

      await admin.from("profiles").update({
        rating: blackNewRating,
        games_played: (blackProfile.games_played || 0) + 1,
        wins: (blackProfile.wins || 0) + (winner === "black" ? 1 : 0),
        losses: (blackProfile.losses || 0) + (winner === "white" ? 1 : 0),
      }).eq("id", game.black_player_id);

      await admin.from("games").update({
        white_rating_change: whiteNewRating - whiteProfile.rating,
        black_rating_change: blackNewRating - blackProfile.rating,
      }).eq("id", gameId);
    }

    // Process tournament game result if this is a tournament game
    const { data: fullGame } = await admin
      .from("games")
      .select("tournament_id, league_fixture_id")
      .eq("id", gameId)
      .single();

    if (fullGame?.tournament_id) {
      try {
        await processTournamentGameResult({
          gameId,
          whitePlayerId: game.white_player_id,
          blackPlayerId: game.black_player_id,
          winner: winner as "white" | "black",
          status: "resign",
        });
      } catch (e) {
        console.error("[resign] Tournament processing failed for game", gameId, e);
      }
    }

    // Process league game result if this is a league fixture game
    if (fullGame?.league_fixture_id) {
      try {
        await processLeagueGameResult({
          gameId,
          whitePlayerId: game.white_player_id,
          blackPlayerId: game.black_player_id,
          winner: winner as "white" | "black" | "draw",
          status: "resign",
        });
      } catch (e) {
        console.error("[resign] League processing failed for game", gameId, e);
      }
    }

    // Check if this is a Battle game and settle
    const { data: battle } = await admin
      .from("battles")
      .select("id, status, white_player_id, black_player_id, armageddon_game_id")
      .or(`game_id.eq.${gameId},armageddon_game_id.eq.${gameId}`)
      .in("status", ["playing", "draw_armageddon"])
      .limit(1)
      .maybeSingle();

    if (battle) {
      const isArmageddon = fullGame?.tournament_id === null && battle.armageddon_game_id === gameId;
      const battleWinnerId = winner === "white"
        ? (isArmageddon ? battle.black_player_id : battle.white_player_id)
        : (isArmageddon ? battle.white_player_id : battle.black_player_id);

      await settleBattle(battle.id, battleWinnerId, "resign").catch((e) => console.error("Battle settlement failed:", e));
    }

    return NextResponse.json({ status: "resigned", winner });
  } catch {
    return NextResponse.json({ error: "Resign failed" }, { status: 500 });
  }
}
