import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// games.time_control only accepts these 4 base categories; challenge time controls
// like "blitz3" (3+2) and "rapid15" (15+10) need to map down to their base category.
const GAME_TIME_CONTROL_MAP: Record<string, string> = {
  bullet: "bullet",
  blitz3: "blitz",
  blitz: "blitz",
  rapid: "rapid",
  rapid15: "rapid",
  classical: "classical",
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { challengeId } = await req.json();

    if (!challengeId) {
      return NextResponse.json({ error: "Challenge ID required" }, { status: 400 });
    }

    // Fetch the challenge (use admin to avoid RLS issues)
    const admin = createAdminClient();
    const { data: challenge, error } = await admin
      .from("challenges")
      .select("*")
      .eq("id", challengeId)
      .single();

    if (error || !challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    if (challenge.challenger_id === user.id) {
      return NextResponse.json({ error: "You cannot accept your own challenge" }, { status: 400 });
    }

    // Check expiry
    if (challenge.expires_at && new Date(challenge.expires_at) < new Date()) {
      await createAdminClient().from("challenges").update({ status: "expired" }).eq("id", challengeId);
      return NextResponse.json({ error: "Challenge has expired" }, { status: 400 });
    }

    // Atomic claim — only succeeds if status is still 'pending'
    const { data: claimed, error: claimError } = await admin
      .from("challenges")
      .update({ status: "accepted", acceptor_id: user.id })
      .eq("id", challengeId)
      .eq("status", "pending")
      .select("*")
      .single();

    if (claimError || !claimed) {
      return NextResponse.json({ error: "Challenge is no longer available" }, { status: 400 });
    }

    // Determine colors
    let whitePlayer = challenge.challenger_id;
    let blackPlayer = user.id;

    if (challenge.color === "black") {
      whitePlayer = user.id;
      blackPlayer = challenge.challenger_id;
    } else if (challenge.color === "random") {
      // Random color assignment
      if (Math.random() > 0.5) {
        whitePlayer = user.id;
        blackPlayer = challenge.challenger_id;
      }
    }

    // Create the game using admin client (bypasses RLS for cross-user game creation)
    const { data: game, error: gameError } = await admin
      .from("games")
      .insert({
        white_player_id: whitePlayer,
        black_player_id: blackPlayer,
        status: "playing",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        turn: "white",
        move_count: 0,
        time_control: GAME_TIME_CONTROL_MAP[challenge.time_control] || "blitz",
        initial_minutes: challenge.initial_minutes,
        increment_seconds: challenge.increment_seconds,
        white_clock_ms: challenge.initial_minutes * 60 * 1000,
        black_clock_ms: challenge.initial_minutes * 60 * 1000,
        last_move_at: new Date().toISOString(),
        rated: challenge.rated,
      })
      .select("id")
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
    }

    // Update challenge with game link (status already set to accepted by atomic claim)
    await admin
      .from("challenges")
      .update({ game_id: game.id })
      .eq("id", challengeId);

    // Quick-Match interop: if the challenger is still sitting in the
    // matchmaking queue (their search auto-created this link), remove
    // their queue row — the DELETE fires their realtime listener and
    // redirects them straight into the new game. Same for the acceptor's
    // own queue entry, and cancel any other auto-posted announce links
    // for either player so nobody joins a stale match.
    await admin.from("matchmaking_queue").delete()
      .in("player_id", [challenge.challenger_id, user.id]);
    await admin.from("challenges").update({ status: "cancelled" })
      .eq("source", "quick_match_announce")
      .eq("status", "pending")
      .in("challenger_id", [challenge.challenger_id, user.id]);

    return NextResponse.json({ gameId: game.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
