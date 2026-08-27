import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin stats for Chess Battles.
 * GET: returns battle stats (active, queued, completed, volume, revenue, disputed)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    // Active battles
    const { count: activeBattles } = await admin
      .from("battles")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "playing", "draw_armageddon"]);

    // Waiting queue
    const { count: waitingPlayers } = await admin
      .from("battle_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting");

    // Completed battles
    const { count: completedBattles } = await admin
      .from("battles")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed");

    // Disputed battles
    const { count: disputedBattles } = await admin
      .from("battles")
      .select("id", { count: "exact", head: true })
      .eq("status", "disputed");

    // Total volume & revenue from completed battles
    const { data: revenueData } = await admin
      .from("battles")
      .select("pot, platform_fee")
      .eq("status", "completed")
      .eq("settled", true);

    const totalVolume = revenueData?.reduce((sum, b) => sum + (b.pot || 0), 0) ?? 0;
    const totalRevenue = revenueData?.reduce((sum, b) => sum + (b.platform_fee || 0), 0) ?? 0;

    // Locked funds (escrow)
    const { data: escrowData } = await admin
      .from("battle_escrow")
      .select("amount")
      .eq("status", "locked");
    const lockedFunds = escrowData?.reduce((sum, e) => sum + (e.amount || 0), 0) ?? 0;

    // Queue by stake level
    const { data: queueByStake } = await admin
      .from("battle_queue")
      .select("stake")
      .eq("status", "waiting");
    const queueCounts: Record<number, number> = {};
    for (const q of queueByStake ?? []) {
      queueCounts[q.stake] = (queueCounts[q.stake] || 0) + 1;
    }

    // Recent battles
    const { data: recentBattles } = await admin
      .from("battles")
      .select(`
        id, status, stake, pot, winner_payout,
        white_player_id, black_player_id, winner_id,
        white_rating, black_rating, created_at, completed_at,
        result, armageddon_round
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    // Get usernames for recent battles
    const playerIds = new Set<string>();
    for (const b of recentBattles ?? []) {
      playerIds.add(b.white_player_id);
      playerIds.add(b.black_player_id);
      if (b.winner_id) playerIds.add(b.winner_id);
    }
    const { data: players } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .in("id", Array.from(playerIds));
    const playerMap = new Map((players ?? []).map((p) => [p.id, p]));

    return NextResponse.json({
      stats: {
        activeBattles: activeBattles ?? 0,
        waitingPlayers: waitingPlayers ?? 0,
        completedBattles: completedBattles ?? 0,
        disputedBattles: disputedBattles ?? 0,
        totalVolume,
        totalRevenue,
        lockedFunds,
        queueByStake: queueCounts,
      },
      recentBattles: (recentBattles ?? []).map((b) => ({
        ...b,
        white_player: playerMap.get(b.white_player_id),
        black_player: playerMap.get(b.black_player_id),
        winner: b.winner_id ? playerMap.get(b.winner_id) : null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to fetch stats" }, { status: 500 });
  }
}
