import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentWeekStart, nextWeekStart, LEAGUE_TIERS } from "@/lib/league-xp";
import { planWeeklySettlement } from "@/lib/league-xp/plan";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/leagues/settle-preview — a DRY RUN of the weekly settle
 * against the current week's live data: what would pay out, who'd move,
 * and whether the payout gate is open — computed by the exact same pure
 * planWeeklySettlement the real settle executes. No writes of any kind.
 * Admin-only. This is the "how can we test it" answer for payouts: run
 * the preview any time, compare with the Tuesday settle's result object.
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
      .select("user_id, tier, xp, week_start, profiles!inner(display_name, username)")
      .order("xp", { ascending: false })
      .order("updated_at", { ascending: true });

    const rows = (members ?? []).map((m: any) => ({
      user_id: m.user_id as string,
      tier: m.tier as number,
      xp: (m.xp ?? 0) as number,
      week_start: m.week_start as string,
      display_name: (m.profiles?.display_name || m.profiles?.username) || "Player",
    }));
    const nameById = new Map(rows.map((m) => [m.user_id, m.display_name]));

    // Preview of the in-progress week: what would happen if it closed now.
    const closingWeek = currentWeekStart();
    const plan = planWeeklySettlement({ members: rows, cfg, closingWeek, newWeek: nextWeekStart() });

    return NextResponse.json({
      previewForWeek: closingWeek,
      wouldSettleOn: nextWeekStart(),
      wouldPayOn: plan.payOn,
      unpaidReason: plan.unpaidReason,
      totalPayoutMwk: plan.payouts.reduce((s, p) => s + p.rewardMwk, 0),
      paidCount: plan.payouts.length,
      resetCount: plan.snapshots.length,
      standardMoves: plan.totals.moves,
      cappedAtCapacity: plan.totals.capped,
      rebalance: { up: plan.rebalanceUp.length, down: plan.rebalanceDown.length },
      tiers: plan.tiers.map((t) => ({
        tier: t.tier,
        name: LEAGUE_TIERS[t.tier - 1]?.name ?? `Tier ${t.tier}`,
        roster: t.roster,
        active: t.active,
        payouts: t.payouts.map((p) => ({
          rank: p.rank,
          userId: p.userId,
          name: nameById.get(p.userId) ?? "Player",
          xp: p.xp,
          rewardMwk: p.rewardMwk,
        })),
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Preview failed" }, { status: 500 });
  }
}
