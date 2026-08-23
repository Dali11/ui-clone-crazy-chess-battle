import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/game/rematch/incoming?gameId=...
 * Checks if there's a pending rematch offer for this game where the current
 * user is the opponent (i.e., the OTHER player sent us a rematch request).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const gameId = req.nextUrl.searchParams.get("gameId");
    if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

    const admin = createAdminClient();

    // Find rematch offers for this game where the current user is the opponent
    const { data: offers } = await admin
      .from("rematch_offers")
      .select("id, from_game_id, status, new_game_id, requester_id, opponent_id")
      .eq("from_game_id", gameId)
      .eq("opponent_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!offers || offers.length === 0) {
      return NextResponse.json({ offer: null });
    }

    const offer = offers[0];

    // Auto-expire if the offer is pending but the opponent (current user) has
    // started playing another game — rematch is no longer relevant.
    if (offer.status === "pending") {
      const { data: activeGames } = await admin
        .from("games")
        .select("id")
        .eq("status", "playing")
        .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`);

      if (activeGames && activeGames.length > 0) {
        await admin.from("rematch_offers").update({
          status: "expired",
          responded_at: new Date().toISOString(),
        }).eq("id", offer.id);
        return NextResponse.json({ offer: null });
      }

      // Also auto-expire if the offer has passed its expiry time
      const { data: fullOffer } = await admin
        .from("rematch_offers")
        .select("expires_at")
        .eq("id", offer.id)
        .single();
      if (fullOffer && new Date(fullOffer.expires_at) < new Date()) {
        await admin.from("rematch_offers").update({
          status: "expired",
          responded_at: new Date().toISOString(),
        }).eq("id", offer.id);
        return NextResponse.json({ offer: null });
      }
    }

    return NextResponse.json({ offer });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
