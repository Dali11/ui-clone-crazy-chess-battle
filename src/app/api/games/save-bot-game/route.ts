import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Bot user ID (chessbot@ccb.internal — created via admin API)
const BOT_USER_ID = "3699502b-57bf-498a-bc2d-11385fd9d317";

// Maps difficulty to time control classification
function classifyTimeControl(minutes: number): "bullet" | "blitz" | "rapid" | "classical" {
  if (minutes <= 2) return "bullet";
  if (minutes <= 5) return "blitz";
  if (minutes <= 15) return "rapid";
  return "classical";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      difficulty,
      playerColor,
      status,        // "checkmate" | "stalemate" | "draw" | "resign" | "timeout"
      winner,        // "white" | "black" | null
      pgn,
      fen,
      moveCount,
      initialMinutes,
      incrementSeconds,
      whiteClockMs,
      blackClockMs,
    } = body;

    if (!userId || !difficulty || !playerColor || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get the player's current profile including games_played, wins, losses, draws
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, rating, games_played, wins, losses, draws")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Player profile not found" }, { status: 404 });
    }

    // Get the bot's rating
    const { data: botProfile } = await supabase
      .from("profiles")
      .select("id, rating")
      .eq("id", BOT_USER_ID)
      .single();

    const playerRating = profile.rating || 1500;
    const botRating = botProfile?.rating || 1500;

    const whitePlayerId = playerColor === "white" ? userId : BOT_USER_ID;
    const blackPlayerId = playerColor === "white" ? BOT_USER_ID : userId;
    const whiteRating = playerColor === "white" ? playerRating : botRating;
    const blackRating = playerColor === "white" ? botRating : playerRating;

    const timeControl = classifyTimeControl(initialMinutes);
    const endedAt = new Date().toISOString();

    // Insert the game record
    const { data: game, error: insertError } = await supabase
      .from("games")
      .insert({
        white_player_id: whitePlayerId,
        black_player_id: blackPlayerId,
        white_rating: whiteRating,
        black_rating: blackRating,
        white_rating_change: 0,
        black_rating_change: 0,
        time_control: timeControl,
        initial_minutes: initialMinutes,
        increment_seconds: incrementSeconds,
        status: status,
        winner: winner,
        pgn: pgn || null,
        fen: fen || null,
        move_count: moveCount || 0,
        rated: false,
        created_at: new Date(Date.now() - (moveCount || 0) * 3000).toISOString(),
        ended_at: endedAt,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to save bot game:", insertError);
      return NextResponse.json({ error: "Failed to save game" }, { status: 500 });
    }

    // Determine player's result
    const playerWon = (playerColor === "white" && winner === "white") || (playerColor === "black" && winner === "black");
    const playerLost = (playerColor === "white" && winner === "black") || (playerColor === "black" && winner === "white");
    const isDraw = winner === null && (status === "draw" || status === "stalemate");

    // Update player's stats: games_played always increments, wins/losses/draws as appropriate
    const updateData: Record<string, number> = {
      games_played: (profile.games_played || 0) + 1,
    };

    if (playerWon) {
      updateData.wins = (profile.wins || 0) + 1;
    } else if (playerLost) {
      updateData.losses = (profile.losses || 0) + 1;
    } else if (isDraw) {
      updateData.draws = (profile.draws || 0) + 1;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to update player stats:", updateError);
    }

    // Trigger referral activation for ALL bot games (win or lose)
    // This counts toward the 10 quick matches needed to activate a referral
    try {
      await supabase.rpc("check_referral_activation", {
        p_user_id: userId,
        p_action: "quick_match",
      });
    } catch (refErr) {
      console.error("Referral activation check failed:", refErr);
    }

    return NextResponse.json({ success: true, gameId: game.id });
  } catch (err) {
    console.error("Save bot game error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
