import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  stringToBoard,
  boardToString,
  applyMove,
  getLegalMoves,
  checkGameOver,
  type DraughtsMove,
  type Position,
} from "@/lib/game/draughts-engine";

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
      .from("draughts_games")
      .select("id, white_player_id, black_player_id, board_state, move_history, turn, status, move_count, moves_since_capture, must_continue_jump, white_clock_ms, black_clock_ms, last_move_at, increment_seconds, created_at, white_rating, black_rating, rated")
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

    const currentTurn = game.turn as "white" | "black";
    if ((isWhite && currentTurn !== "white") || (isBlack && currentTurn !== "black")) {
      return NextResponse.json({ error: "Not your turn" }, { status: 400 });
    }

    // Check clock
    const now = Date.now();
    const lastMoveTime = new Date(game.last_move_at || game.created_at).getTime();
    const elapsedMs = now - lastMoveTime;
    const currentClockMs = currentTurn === "white" ? game.white_clock_ms : game.black_clock_ms;
    const remainingMs = (currentClockMs ?? 0) - elapsedMs;

    if (remainingMs <= 0) {
      // Player's clock expired — they lose on time
      const admin = createAdminClient();
      const winner = currentTurn === "white" ? "black" : "white";
      await admin.from("draughts_games").update({
        status: "timeout",
        winner,
        ended_at: new Date().toISOString(),
      }).eq("id", gameId);

      // Update ratings
      await updateDraughtsRatings(admin, game, winner, "timeout");

      return NextResponse.json({
        error: "Your clock has expired",
        gameEnded: true,
        status: "timeout",
        winner,
      }, { status: 400 });
    }

    // Parse board state
    const board = stringToBoard(game.board_state);

    // Check multi-jump constraint
    if (game.must_continue_jump) {
      const mustJump = game.must_continue_jump as Position;
      if (move.from.row !== mustJump.row || move.from.col !== mustJump.col) {
        return NextResponse.json({
          error: "You must continue jumping with the same piece",
        }, { status: 400 });
      }
    }

    // Validate and apply the move
    const draughtsMove: DraughtsMove = {
      from: { row: move.from.row, col: move.from.col },
      to: { row: move.to.row, col: move.to.col },
    };

    const result = applyMove(board, draughtsMove, currentTurn, game.move_count);

    if (!result.valid) {
      return NextResponse.json({ error: result.error || "Invalid move" }, { status: 400 });
    }

    // Calculate new clock
    let newWhiteClock = game.white_clock_ms;
    let newBlackClock = game.black_clock_ms;
    if (currentTurn === "white") {
      newWhiteClock = Math.max(0, Math.floor(remainingMs + (game.increment_seconds || 0) * 1000));
    } else {
      newBlackClock = Math.max(0, Math.floor(remainingMs + (game.increment_seconds || 0) * 1000));
    }

    // Check for timeout after move
    let gameEnded = result.status !== "playing";
    let winner = result.winner;

    if (newWhiteClock <= 0) {
      gameEnded = true;
      winner = "black";
      result.status = "timeout";
    } else if (newBlackClock <= 0) {
      gameEnded = true;
      winner = "white";
      result.status = "timeout";
    }

    // Build move history entry
    const moveEntry = {
      from: move.from,
      to: move.to,
      player: currentTurn,
      captured: !!(move as any).captures?.length,
      moveNum: game.move_count + 1,
    };

    // Append to move history
    const moveHistory = Array.isArray(game.move_history) ? game.move_history : [];
    moveHistory.push(moveEntry);

    // Prepare update
    const updateData: Record<string, unknown> = {
      board_state: boardToString(result.board!),
      move_history: moveHistory,
      move_count: game.move_count + 1,
      white_clock_ms: newWhiteClock,
      black_clock_ms: newBlackClock,
      last_move_at: new Date().toISOString(),
      moves_since_capture: result.capturedCount && result.capturedCount > 0
        ? 0
        : (game.moves_since_capture || 0) + 1,
    };

    if (result.mustContinueJump) {
      // Same player must continue jumping
      updateData.must_continue_jump = result.mustContinueJump;
      updateData.turn = currentTurn; // keep same turn
    } else {
      // Switch turn
      updateData.must_continue_jump = null;
      updateData.turn = currentTurn === "white" ? "black" : "white";
    }

    // Check draw (40 moves without capture)
    if (!gameEnded && (game.moves_since_capture || 0) + 1 >= 80) {
      gameEnded = true;
      winner = null;
      result.status = "draw";
    }

    if (gameEnded) {
      updateData.status = result.status;
      updateData.winner = winner;
      updateData.ended_at = new Date().toISOString();
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("draughts_games")
      .update(updateData)
      .eq("id", gameId)
      .eq("move_count", game.move_count);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update ratings if game ended
    if (gameEnded) {
      await updateDraughtsRatings(admin, game, winner, result.status || "win");
    }

    return NextResponse.json({
      valid: true,
      board: result.board,
      status: result.status || "playing",
      winner,
      turn: updateData.turn,
      moveCount: game.move_count + 1,
      mustContinueJump: result.mustContinueJump || null,
      whiteClockMs: newWhiteClock,
      blackClockMs: newBlackClock,
    });
  } catch (e) {
    console.error("Draughts move error:", e);
    return NextResponse.json({ error: "Move failed" }, { status: 500 });
  }
}

// Simple Elo rating update for draughts
async function updateDraughtsRatings(
  admin: ReturnType<typeof createAdminClient>,
  game: any,
  winner: string | null,
  status: string
) {
  const { data: whiteProfile } = await admin
    .from("profiles")
    .select("draughts_rating, draughts_games_played, draughts_wins, draughts_losses, draughts_draws")
    .eq("id", game.white_player_id)
    .single();

  const { data: blackProfile } = await admin
    .from("profiles")
    .select("draughts_rating, draughts_games_played, draughts_wins, draughts_losses, draughts_draws")
    .eq("id", game.black_player_id)
    .single();

  if (!whiteProfile || !blackProfile) return;

  const whiteRating = whiteProfile.draughts_rating || 1500;
  const blackRating = blackProfile.draughts_rating || 1500;

  const K = 32;
  const whiteExpected = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
  const whiteScore = winner === "white" ? 1 : winner === "black" ? 0 : 0.5;
  const blackScore = 1 - whiteScore;

  const whiteNewRating = Math.round(whiteRating + K * (whiteScore - whiteExpected));
  const blackNewRating = Math.round(blackRating + K * (blackScore - (1 - whiteExpected)));

  await admin.from("profiles").update({
    draughts_rating: whiteNewRating,
    draughts_games_played: (whiteProfile.draughts_games_played || 0) + 1,
    draughts_wins: (whiteProfile.draughts_wins || 0) + (winner === "white" ? 1 : 0),
    draughts_losses: (whiteProfile.draughts_losses || 0) + (winner === "black" ? 1 : 0),
    draughts_draws: (whiteProfile.draughts_draws || 0) + (status === "draw" ? 1 : 0),
  }).eq("id", game.white_player_id);

  await admin.from("profiles").update({
    draughts_rating: blackNewRating,
    draughts_games_played: (blackProfile.draughts_games_played || 0) + 1,
    draughts_wins: (blackProfile.draughts_wins || 0) + (winner === "black" ? 1 : 0),
    draughts_losses: (blackProfile.draughts_losses || 0) + (winner === "white" ? 1 : 0),
    draughts_draws: (blackProfile.draughts_draws || 0) + (status === "draw" ? 1 : 0),
  }).eq("id", game.black_player_id);

  // Store rating changes on game record
  await admin.from("draughts_games").update({
    white_rating_change: whiteNewRating - whiteRating,
    black_rating_change: blackNewRating - blackRating,
  }).eq("id", game.id);
}
