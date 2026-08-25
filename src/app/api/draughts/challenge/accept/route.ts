import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { challengeId } = await req.json();
    if (!challengeId) return NextResponse.json({ error: "Challenge ID required" }, { status: 400 });

    const admin = createAdminClient();
    const { data: challenge, error } = await admin
      .from("draughts_challenges")
      .select("*")
      .eq("id", challengeId)
      .single();

    if (error || !challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    if (challenge.challenger_id === user.id)
      return NextResponse.json({ error: "You cannot accept your own challenge" }, { status: 400 });

    if (challenge.expires_at && new Date(challenge.expires_at) < new Date()) {
      await admin.from("draughts_challenges").update({ status: "expired" }).eq("id", challengeId);
      return NextResponse.json({ error: "Challenge has expired" }, { status: 400 });
    }

    // Atomic claim
    const { data: claimed, error: claimError } = await admin
      .from("draughts_challenges")
      .update({ status: "accepted", acceptor_id: user.id })
      .eq("id", challengeId)
      .eq("status", "pending")
      .select("*")
      .single();

    if (claimError || !claimed)
      return NextResponse.json({ error: "Challenge is no longer available" }, { status: 400 });

    // Determine colors
    let whitePlayer = claimed.challenger_id;
    let blackPlayer = user.id;

    if (claimed.color === "black") {
      whitePlayer = user.id;
      blackPlayer = claimed.challenger_id;
    } else if (claimed.color === "random") {
      if (Math.random() > 0.5) {
        whitePlayer = user.id;
        blackPlayer = claimed.challenger_id;
      }
    }

    // Get ratings
    const { data: whiteProfile } = await admin.from("profiles").select("draughts_rating").eq("id", whitePlayer).single();
    const { data: blackProfile } = await admin.from("profiles").select("draughts_rating").eq("id", blackPlayer).single();

    const whiteRating = whiteProfile?.draughts_rating || 1500;
    const blackRating = blackProfile?.draughts_rating || 1500;

    // Create draughts game via RPC
    const { data: gameId, error: gameError } = await supabase.rpc("create_draughts_game", {
      p_white_id: whitePlayer,
      p_black_id: blackPlayer,
      p_white_rating: whiteRating,
      p_black_rating: blackRating,
      p_time_control: claimed.time_control,
      p_initial_minutes: claimed.initial_minutes,
      p_increment_seconds: claimed.increment_seconds,
      p_rated: claimed.rated,
    });

    if (gameError || !gameId)
      return NextResponse.json({ error: "Failed to create game" }, { status: 500 });

    await admin.from("draughts_challenges").update({ game_id: gameId }).eq("id", challengeId);

    return NextResponse.json({ gameId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
