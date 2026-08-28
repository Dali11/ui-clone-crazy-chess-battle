import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/open-matches
 * Returns active matchmaking_queue and battle_queue entries (status = waiting)
 * so a site-wide banner can show "Player X is looking for a game — Accept".
 *
 * Does NOT return challenge links (challenges / battle_challenges tables) —
 * those are private to the specific friend the challenger shared the link with.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const admin = createAdminClient();

    // ─── Quick Match / Free Play (matchmaking_queue) ────────────────────
    // Clean up stale entries first (older than 120s)
    const twoMinsAgo = new Date(Date.now() - 120 * 1000).toISOString();
    await admin.from("matchmaking_queue").delete().lt("joined_at", twoMinsAgo);

    const { data: mmQueue } = await admin
      .from("matchmaking_queue")
      .select("id, player_id, time_control, rated, rating, joined_at")
      .order("joined_at", { ascending: true })
      .limit(20);

    // ─── Battle Queue ──────────────────────────────────────────────────
    const { data: battleQueue } = await admin
      .from("battle_queue")
      .select("id, player_id, stake, rating, time_control, created_at")
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(20);

    // ─── Fetch player profiles for all entries ─────────────────────────
    const allPlayerIds = new Set<string>();
    for (const e of mmQueue || []) allPlayerIds.add(e.player_id);
    for (const e of battleQueue || []) allPlayerIds.add(e.player_id);

    let profileMap = new Map<string, { name: string; rating: number; avatar_url: string | null }>();
    if (allPlayerIds.size > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, username, display_name, rating, avatar_url")
        .in("id", Array.from(allPlayerIds));

      for (const p of profiles || []) {
        profileMap.set(p.id, {
          name: p.display_name || p.username || "Anonymous",
          rating: p.rating || 1200,
          avatar_url: p.avatar_url || null,
        });
      }
    }

    // ─── Build response ───────────────────────────────────────────────
    const timeControlLabels: Record<string, string> = {
      bullet: "Bullet · 1+0",
      blitz: "Blitz · 5+0",
      blitz3: "Blitz · 3+2",
      rapid: "Rapid · 10+0",
      rapid15: "Rapid · 15+10",
      classical: "Classical · 30+0",
    };

    const quickMatches = (mmQueue || [])
      .filter((e) => e.player_id !== user?.id)
      .map((e) => {
        const profile = profileMap.get(e.player_id);
        return {
          id: e.id,
          type: "quick_match" as const,
          playerId: e.player_id,
          playerName: profile?.name || "Anonymous",
          playerRating: profile?.rating || e.rating || 1200,
          avatarUrl: profile?.avatar_url || null,
          timeControl: e.time_control,
          timeControlLabel: timeControlLabels[e.time_control] || e.time_control,
          rated: e.rated,
          joinedAt: e.joined_at,
        };
      });

    const battles = (battleQueue || [])
      .filter((e) => e.player_id !== user?.id)
      .map((e) => {
        const profile = profileMap.get(e.player_id);
        return {
          id: e.id,
          type: "battle" as const,
          playerId: e.player_id,
          playerName: profile?.name || "Anonymous",
          playerRating: profile?.rating || e.rating || 1200,
          avatarUrl: profile?.avatar_url || null,
          stake: e.stake,
          timeControl: e.time_control || "rapid15",
          timeControlLabel: timeControlLabels[e.time_control || "rapid15"] || "Rapid",
          createdAt: e.created_at,
        };
      });

    return NextResponse.json({
      quickMatches,
      battles,
      authenticated: !!user,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch open matches" }, { status: 500 });
  }
}
