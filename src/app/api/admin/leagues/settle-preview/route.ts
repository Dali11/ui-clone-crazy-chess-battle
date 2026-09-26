import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentMonthStart, nextMonthStart } from "@/lib/league-xp";
import { planMonthlySettlement } from "@/lib/league-xp/plan";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/leagues/settle-preview — a DRY RUN of the monthly
 * settle against the current month's live data: what would pay out and
 * whether the payout gate is open — computed by the exact same pure
 * planMonthlySettlement the real settle executes. No writes of any
 * kind. Admin-only.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const cfg = await getLeagueXpConfig(admin);
    const { data: members } = await admin
      .from("league_xp_members")
      .select("user_id, xp, week_start, lifetime_xp, profiles!inner(display_name, username)")
      .order("xp", { ascending: false })
      .order("updated_at", { ascending: true });

    const rows = (members ?? []).map((m: any) => ({
      user_id: m.user_id as string,
      xp: Number(m.xp ?? 0),
      cycle_start: m.week_start as string,
      lifetime_xp: Number(m.lifetime_xp ?? 0),
      display_name: (m.profiles?.display_name || m.profiles?.username) || "Player",
    }));
    const nameById = new Map(rows.map((m) => [m.user_id, m.display_name]));

    // Preview of the in-progress month: what would happen if it closed now.
    const closingMonth = currentMonthStart();
    const plan = planMonthlySettlement({
      members: rows,
      cfg,
      closingMonth,
      newMonth: nextMonthStart(),
    });

    return NextResponse.json({
      previewForMonth: closingMonth,
      wouldSettleOn: nextMonthStart(),
      wouldPayOn: plan.payOn,
      unpaidReason: plan.unpaidReason,
      totalPayoutMwk: plan.payouts.reduce((s, p) => s + p.rewardMwk, 0),
      paidCount: plan.payouts.length,
      ranked: plan.totals.ranked,
      activePlayers: plan.totals.activePlayers,
      resetCount: plan.resetUserIds.length,
      payouts: plan.payouts.map((p) => ({
        rank: p.rank,
        userId: p.userId,
        name: nameById.get(p.userId) ?? "Player",
        xp: p.xp,
        rewardMwk: p.rewardMwk,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Preview failed" }, { status: 500 });
  }
}
