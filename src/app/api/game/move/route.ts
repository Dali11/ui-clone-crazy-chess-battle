import { processTournamentGameResult } from "@/lib/tournament/results";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateAndApplyMove } from "@/lib/game/chess-engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleBattle } from "@/lib/battles/settle";
import { awardGameXp } from "@/lib/league-xp/award";
import { resolveTimeoutForGame } from "@/lib/game/resolve-timeout";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { gameId, move } = await req.json();

    if (!gameId || !move) {
      return NextResponse.json({ error: "Game ID and move required" }, { status: 400 });
    }

    // Load current game state
    const { data: game } = await supabase
      .from("games")
      .select("id, white_player_id, black_player_id, fen, pgn, turn, status, move_count, white_clock_ms, black_clock_ms, last_move_at, increment_seconds, tournament_id, created_at, white_rating, black_rating, rated")
      .eq("id", gameId)
      .single();

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (game.status !== "playing") {
      return NextResponse.json({ error: "Game is not in progress" }, { status: 400 });
    }

    // Check it's this player's turn
    const isWhite = game.white_player_id === user.id;
    const isBlack = game.black_player_id === user.id;

    if (!isWhite && !isBlack) {
      return NextResponse.json({ error: "Not a player in this game" }, { status: 403 });
    }

    if ((isWhite && game.turn !== "white") || (isBlack && game.turn !== "black")) {
      return NextResponse.json({ error: "Not your turn" }, { status: 400 });
    }

    // Check if the player's own clock has expired (they lose on time)
    // Clock starts when the game transitions to "playing" (last_move_at is set
    // by the tournament cron at that moment). The first move consumes time
    // like any other move.
    const now = Date.now();
    const lastMoveTime = new Date(game.last_move_at || game.created_at).getTime();
    const elapsedMs = now - lastMoveTime;
    const currentClockMs = game.turn === "white" ? game.white_clock_ms : game.black_clock_ms;
    const remainingMs = (currentClockMs ?? 0) - elapsedMs;

    if (remainingMs <= 0) {
      // Player's clock expired — they lose on time
      const admin = createAdminClient();
      const result = await resolveTimeoutForGame(admin, game);
      return NextResponse.json({
        error: "Your clock has expired",
        gameEnded: true,
        status: result.status,
        winner: result.winner,
      }, { status: 400 });
    }

    // Validate and apply the move — clock has been ticking since the game
    // started (last_move_at set by cron or previous move).
    const engineLastMoveAt = game.last_move_at || new Date().toISOString();

    const result = validateAndApplyMove(
      game.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      move,
      game.pgn || "",
      game.white_clock_ms,
      game.black_clock_ms,
      engineLastMoveAt,
      game.turn as "white" | "black",
      game.increment_seconds || 0
    );

    if (!result.valid) {
      return NextResponse.json({ error: result.error || "Invalid move" }, { status: 400 });
    }

    // Update the game in Supabase
    // Realtime will automatically notify the opponent
    const gameEnded = result.status !== "playing";
    const updateData: Record<string, unknown> = {
      fen: result.fen,
      pgn: result.pgn,
      turn: result.turn,
      move_count: result.moveCount,
      white_clock_ms: result.whiteClockMs,
      black_clock_ms: result.blackClockMs,
      last_move_at: new Date().toISOString(),
    };

    if (gameEnded) {
      updateData.status = result.status;
      updateData.winner = result.winner;
      updateData.ended_at = new Date().toISOString();
    }

    const admin = createAdminClient();
    const { error, count } = await admin
      .from("games")
      .update(updateData)
      .eq("id", gameId)
      .eq("move_count", game.move_count)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If 0 rows updated, another move beat us (concurrency guard) or the
    // game state changed between our read and write. Tell the client to
    // refresh — do NOT return the optimistic fen as if it succeeded.
    if (count === 0) {
      return NextResponse.json({
        error: "Move conflict — game state changed. Please retry.",
        conflict: true,
      }, { status: 409 });
    }

    // If no rows updated, another move beat us — tell client to refresh
    // (Supabase REST API doesn't return count by default, so we check if the
    // game's move_count has changed since our read)

    // If game ended, update ratings (including draws where winner is null)
    if (gameEnded) {
      const { data: whiteProfile } = await supabase
        .from("profiles")
        .select("rating, rating_deviation, rating_volatility, games_played, wins, losses, draws")
        .eq("id", game.white_player_id)
        .single();

      const { data: blackProfile } = await supabase
        .from("profiles")
        .select("rating, rating_deviation, rating_volatility, games_played, wins, losses, draws")
        .eq("id", game.black_player_id)
        .single();

      if (whiteProfile && blackProfile) {
        // Simple Elo update for MVP (can upgrade to Glicko-2 later)
        const K = 32;
        const whiteExpected = 1 / (1 + Math.pow(10, (blackProfile.rating - whiteProfile.rating) / 400));
        const blackExpected = 1 - whiteExpected;
        const whiteScore = result.winner === "white" ? 1 : result.winner === "black" ? 0 : 0.5; // null = draw = 0.5
        const blackScore = 1 - whiteScore;

        const whiteNewRating = Math.round(whiteProfile.rating + K * (whiteScore - whiteExpected));
        const blackNewRating = Math.round(blackProfile.rating + K * (blackScore - blackExpected));

        await admin.from("profiles").update({
          rating: whiteNewRating,
          games_played: (whiteProfile.games_played || 0) + 1,
          wins: (whiteProfile.wins || 0) + (result.winner === "white" ? 1 : 0),
          losses: (whiteProfile.losses || 0) + (result.winner === "black" ? 1 : 0),
          draws: (whiteProfile.draws || 0) + (result.status === "draw" ? 1 : 0),
        }).eq("id", game.white_player_id);

        await admin.from("profiles").update({
          rating: blackNewRating,
          games_played: (blackProfile.games_played || 0) + 1,
          wins: (blackProfile.wins || 0) + (result.winner === "black" ? 1 : 0),
          losses: (blackProfile.losses || 0) + (result.winner === "white" ? 1 : 0),
          draws: (blackProfile.draws || 0) + (result.status === "draw" ? 1 : 0),
        }).eq("id", game.black_player_id);

        // Store rating changes on game record
        await admin.from("games").update({
          white_rating_change: whiteNewRating - whiteProfile.rating,
          black_rating_change: blackNewRating - blackProfile.rating,
        }).eq("id", gameId);
      }
    }

    // Process tournament game result (non-blocking — game is already saved)
    // Include draws/stalemates (result.winner is null) — tiebreak games need this
    if (gameEnded && game.tournament_id) {
      try {
        await processTournamentGameResult({
          gameId,
          whitePlayerId: game.white_player_id,
          blackPlayerId: game.black_player_id,
          winner: (result.winner || "draw") as "white" | "black" | "draw",
          status: result.status || "playing",
        });
      } catch (e) {
        console.error("[move] Tournament processing failed for game", gameId, e);
      }
    }

    // Check if this is a Battle game and settle
    if (gameEnded) {
      const { data: battle } = await admin
        .from("battles")
        .select("id, status, white_player_id, black_player_id, armageddon_game_id")
        .or(`game_id.eq.${gameId},armageddon_game_id.eq.${gameId}`)
        .in("status", ["playing", "draw_armageddon"])
        .limit(1)
        .maybeSingle();

      if (battle) {
        const isArmageddon = battle.armageddon_game_id === gameId;
        let battleWinnerId: string | null = null;

        if (result.winner === "white") {
          battleWinnerId = isArmageddon ? battle.black_player_id : battle.white_player_id;
        } else if (result.winner === "black") {
          battleWinnerId = isArmageddon ? battle.white_player_id : battle.black_player_id;
        }
        // result.winner null = draw -> battleWinnerId stays null -> triggers armageddon

        await settleBattle(battle.id, battleWinnerId, result.status || "draw").catch((e) => console.error("Battle settlement failed:", e));
      }
    }

    // XP Leagues: award XP for the finished game (idempotent, never throws).
    // AUDIT FIX 2026-09-11: gate on gameEnded, NOT result.winner !== undefined.
    // Mid-game moves return winner: null, which awardGameXp read as a DRAW —
    // every game's first move granted phantom +1 draw XP to both players and
    // the unique (user, kind, game) index then blocked the real win/loss XP.
    if (gameEnded) {
      awardGameXp({ gameId, game: { white_player_id: game.white_player_id, black_player_id: game.black_player_id, winner: result.winner ?? null, white_rating: game.white_rating, black_rating: game.black_rating }, admin }).catch(() => {});
    }

    return NextResponse.json({
      valid: true,
      fen: result.fen,
      pgn: result.pgn,
      status: result.status || "playing",
      winner: result.winner,
      turn: result.turn,
      moveCount: result.moveCount,
      whiteClockMs: result.whiteClockMs,
      blackClockMs: result.blackClockMs,
    });
  } catch (e) {
    return NextResponse.json({ error: "Move failed" }, { status: 500 });
  }
}
