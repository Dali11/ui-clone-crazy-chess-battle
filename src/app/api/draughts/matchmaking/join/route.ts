import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DRAUGHTS_TC_MAP: Record<string, string> = {
  bullet: "bullet",
  blitz: "blitz",
  rapid: "rapid",
};

const tcConfig: Record<string, { minutes: number; increment: number }> = {
  bullet: { minutes: 1, increment: 0 },
  blitz: { minutes: 5, increment: 0 },
  rapid: { minutes: 10, increment: 0 },
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { timeControl, rated, variant } = await req.json();

    if (!timeControl) {
      return NextResponse.json({ error: "Time control required" }, { status: 400 });
    }

    // Get player's draughts rating
    const { data: profile } = await supabase
      .from("profiles")
      .select("draughts_rating")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const myRating = profile.draughts_rating || 1500;

    // Remove any existing queue entry
    await supabase
      .from("draughts_matchmaking_queue")
      .delete()
      .eq("player_id", user.id);

    // Add to queue
    const { error } = await supabase
      .from("draughts_matchmaking_queue")
      .insert({
        player_id: user.id,
        time_control: timeControl,
        rated: rated ?? true,
        rating: myRating,
        variant: variant || "international",
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Try to find an immediate match
    const { data: opponents } = await supabase
      .from("draughts_matchmaking_queue")
      .select("id, player_id, rating, time_control, rated, joined_at")
      .neq("player_id", user.id)
      .eq("time_control", timeControl)
      .eq("rated", rated ?? true)
      .eq("variant", variant || "international")
      .order("joined_at", { ascending: true })
      .limit(10);

    if (opponents && opponents.length > 0) {
      const opponent = opponents.reduce((closest, p) => {
        const diff = Math.abs(p.rating - myRating);
        const closestDiff = Math.abs(closest.rating - myRating);
        return diff < closestDiff ? p : closest;
      });

      const tc = tcConfig[timeControl] || tcConfig.blitz;
      const dbTC = DRAUGHTS_TC_MAP[timeControl] || "blitz";

      const { data: gameId, error: gameError } = await supabase.rpc("create_draughts_game", {
        p_white_id: user.id,
        p_black_id: opponent.player_id,
        p_white_rating: myRating,
        p_black_rating: opponent.rating,
        p_time_control: dbTC,
        p_initial_minutes: tc.minutes,
        p_increment_seconds: tc.increment,
        p_rated: rated ?? true,
        p_variant: variant || "international",
      });

      if (gameError || !gameId) {
        return NextResponse.json({ status: "searching" });
      }

      const admin = createAdminClient();
      await supabase.from("draughts_matchmaking_queue").delete().eq("player_id", user.id);
      await admin.from("draughts_matchmaking_queue").delete().eq("id", opponent.id);

      return NextResponse.json({
        status: "matched",
        gameId,
        opponent: { rating: opponent.rating },
        color: "white",
      });
    }

    return NextResponse.json({ status: "searching" });
  } catch {
    return NextResponse.json({ error: "Failed to join matchmaking" }, { status: 500 });
  }
}
