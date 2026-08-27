import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Total users
    const { count: totalUsers } = await admin
      .from("profiles").select("*", { count: "exact", head: true });

    // Games today
    const { count: gamesToday } = await admin
      .from("games").select("*", { count: "exact", head: true })
      .gte("created_at", todayISO);

    // Total games (all-time count from games table)
    const { count: totalGames } = await admin
      .from("games").select("*", { count: "exact", head: true });

    // Active tournaments
    const { count: activeTournaments } = await admin
      .from("tournaments").select("*", { count: "exact", head: true })
      .in("status", ["upcoming", "active"]);

    // Pending tournament approvals
    const { count: pendingTournamentApprovals } = await admin
      .from("tournaments").select("*", { count: "exact", head: true })
      .eq("status", "pending_approval");

    // Pending withdrawals
    const { count: pendingWithdrawals } = await admin
      .from("withdrawals").select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // Pending deposits
    const { count: pendingDeposits } = await admin
      .from("deposits").select("*", { count: "exact", head: true })
      .in("status", ["pending", "processing"]);

    // Total deposits — real money entering the platform (method IN ('mobile_money', 'card'))
    const { data: depositsData } = await admin
      .from("deposits").select("amount")
      .eq("status", "success")
      .in("method", ["mobile_money", "card"]);
    const totalDeposits = depositsData?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;

    // Total withdrawals (only completed — approved is transient during payout)
    const { data: withdrawalsData } = await admin
      .from("withdrawals").select("amount")
      .eq("status", "completed");
    const totalWithdrawals = withdrawalsData?.reduce((sum, w) => sum + (w.amount || 0), 0) || 0;

    // Completed + settled battles stats
    const { data: completedBattles } = await admin
      .from("battles")
      .select("pot, platform_fee")
      .eq("status", "completed")
      .eq("settled", true);

    const totalBattleVolume = completedBattles?.reduce((sum, b) => sum + (b.pot || 0), 0) || 0;
    const battleRevenue = completedBattles?.reduce((sum, b) => sum + (b.platform_fee || 0), 0) || 0;

    // Platform revenue from finished tournaments (10% of entry fees)
    const { data: finishedTournaments } = await admin
      .from("tournaments")
      .select("id, entry_fee")
      .eq("status", "finished");

    let tournamentEntryFees = 0;
    if (finishedTournaments && finishedTournaments.length > 0) {
      const finishedIds = finishedTournaments.map((t) => t.id);
      const { data: participants } = await admin
        .from("tournament_participants")
        .select("tournament_id")
        .in("tournament_id", finishedIds);

      const feeMap = new Map(finishedTournaments.map((t) => [t.id, t.entry_fee || 0]));
      for (const p of participants || []) {
        tournamentEntryFees += feeMap.get(p.tournament_id) || 0;
      }
    }
    const tournamentRevenue = Math.floor(tournamentEntryFees * 0.1);
    const platformRevenue = battleRevenue + tournamentRevenue;

    // Total prize pools (non-cancelled tournaments)
    const { data: tournamentsData } = await admin
      .from("tournaments").select("prize_pool")
      .neq("status", "cancelled");
    let totalPrizePools = 0;
    for (const t of tournamentsData || []) {
      totalPrizePools += t.prize_pool || 0;
    }

    // Wallet liquidity — net money in the wallet system
    const walletLiquidity = totalDeposits - totalWithdrawals;

    return NextResponse.json({
      totalUsers: totalUsers ?? 0,
      gamesToday: gamesToday ?? 0,
      totalGames: totalGames ?? 0,
      activeTournaments: activeTournaments ?? 0,
      pendingTournamentApprovals: pendingTournamentApprovals ?? 0,
      pendingWithdrawals: pendingWithdrawals ?? 0,
      pendingDeposits: pendingDeposits ?? 0,
      totalDeposits,
      totalWithdrawals,
      totalBattleVolume,
      platformRevenue,
      totalPrizePools,
      walletLiquidity,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
