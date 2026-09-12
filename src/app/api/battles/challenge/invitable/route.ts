import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/battles/challenge/invitable?challengeId=...
 * Players the challenger has played against before (finished chess games),
 * suggested for bulk-inviting them to accept the challenge via DM.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const challengeId = req.nextUrl.searchParams.get("challengeId");
    if (!challengeId) return NextResponse.json({ error: "Challenge ID required" }, { status: 400 });

    const admin = createAdminClient();

    const { data: challenge } = await admin
      .from("battle_challenges")
      .select("id, challenger_id, status")
      .eq("id", challengeId)
      .single();
    if (!challenge || challenge.challenger_id !== user.id)
      return NextResponse.json({ error: "Not your challenge" }, { status: 403 });
    if (challenge.status !== "pending")
      return NextResponse.json({ error: "Challenge is no longer pending" }, { status: 400 });

    // Past opponents from finished games (most recent first)
    const { data: games } = await admin
      .from("games")
      .select("white_player_id, black_player_id, created_at")
      .not("ended_at", "is", null)
      .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(400);

    const agg = new Map<string, { games: number; lastPlayed: string }>();
    for (const g of games ?? []) {
      const opp = g.white_player_id === user.id ? g.black_player_id : g.white_player_id;
      if (!opp) continue;
      const cur = agg.get(opp);
      if (cur) {
        cur.games++;
        if (g.created_at > cur.lastPlayed) cur.lastPlayed = g.created_at;
      } else {
        agg.set(opp, { games: 1, lastPlayed: g.created_at });
      }
    }

    const ids = [...agg.keys()];
    if (ids.length === 0) return NextResponse.json({ opponents: [] });

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, avatar_url, rating, is_banned")
      .in("id", ids);

    // Users already invited for this challenge (DM containing its link)
    const { data: invitedRows } = await admin
      .from("direct_messages")
      .select("recipient_id")
      .eq("sender_id", user.id)
      .like("body", `%/battle-challenge/${challengeId}%`);
    const invited = new Set((invitedRows ?? []).map((r) => r.recipient_id));

    const opponents = (profiles ?? [])
      .filter((p) => p.id !== user.id && !p.is_banned && agg.has(p.id))
      .map((p) => ({
        id: p.id,
        username: p.username,
        avatarUrl: p.avatar_url,
        rating: p.rating,
        gamesPlayed: agg.get(p.id)!.games,
        lastPlayed: agg.get(p.id)!.lastPlayed,
        invited: invited.has(p.id),
      }))
      .sort((a, b) => (a.lastPlayed < b.lastPlayed ? 1 : -1))
      .slice(0, 50);

    return NextResponse.json({ opponents });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
