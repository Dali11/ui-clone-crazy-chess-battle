import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/league/xp/game-earned?gameId=...&kind=chess|draughts
 *
 * XP the signed-in player earned from one specific finished game — used
 * by the end-of-game screen to show "+3 XP" / "+1 XP". Returns amount 0
 * for losses (no event is written when loss XP is 0), bot games, and
 * games the caller never played.
 *
 * The award itself is fire-and-forget on the server, so the client may
 * poll this before the event row is committed — hence the light-weight
 * "amount: 0, pending: true" shape it can retry on.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get("gameId");
    const kind = searchParams.get("kind") === "draughts" ? "draughts" : "chess";
    if (!gameId) return NextResponse.json({ error: "Missing gameId" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ authenticated: false, amount: 0 }, { status: 401 });

    const admin = createAdminClient();
    const { data: events } = await admin
      .from("league_xp_events")
      .select("amount, reason")
      .eq("user_id", user.id)
      .eq("game_kind", kind)
      .eq("game_id", gameId);

    const amount = (events ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
    return NextResponse.json({ amount, reason: events?.[0]?.reason ?? null });
  } catch (err: any) {
    console.error("game-earned xp error:", err);
    return NextResponse.json({ error: "Could not load XP" }, { status: 500 });
  }
}
