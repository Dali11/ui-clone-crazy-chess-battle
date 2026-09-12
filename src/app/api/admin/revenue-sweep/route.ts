import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { runRevenueSweep, computeWindowRevenue, nextWindow } from "@/lib/revenue/sweep";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/revenue-sweep — summary + history for the admin panel.
 * POST /api/admin/revenue-sweep — run a sweep NOW (admin-only; bypasses the
 *   weekly guard; still respects the enabled toggle unless force=true).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const cfg = await getPlatformConfig(admin, "revenue_sweep");

    // All-time revenue (whole history)
    const [battlesRes, withdrawalsRes, membershipRes] = await Promise.all([
      admin
        .from("battles")
        .select("stake, winner_payout")
        .eq("settled", true)
        .eq("status", "completed")
        .not("winner_id", "is", null),
      admin
        .from("withdrawals")
        .select("fee")
        .eq("status", "completed")
        .gt("fee", 0)
        .neq("payment_provider", "ontech"),
      admin
        .from("deposits")
        .select("amount")
        .eq("method", "membership_purchase")
        .eq("status", "success"),
    ]);
    const battleFeeSum = (battlesRes.data || []).reduce(
      (s, b) => s + Math.max(0, (b.stake || 0) * 2 - (b.winner_payout || 0)), 0);
    const withdrawalFeeSum = (withdrawalsRes.data || []).reduce((s, w) => s + (w.fee || 0), 0);
    const membershipSum = (membershipRes.data || []).reduce((s, m) => s + (m.amount || 0), 0);
    const allTime = battleFeeSum + withdrawalFeeSum + membershipSum;

    // Swept so far (credited sweeps)
    const { data: sweptRows } = await admin
      .from("platform_revenue_sweeps")
      .select("total_mwk")
      .eq("credited", true);
    const swept = (sweptRows || []).reduce((s, r) => s + (r.total_mwk || 0), 0);

    // Unswept (live preview of the next window)
    const window = await nextWindow(admin, cfg.epoch);
    const pending = await computeWindowRevenue(admin, window);

    const { data: history } = await admin
      .from("platform_revenue_sweeps")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12);

    return NextResponse.json({
      allTime: { battleFees: battleFeeSum, withdrawalFees: withdrawalFeeSum, membershipRevenue: membershipSum, total: allTime },
      swept,
      unswept: pending,
      window,
      history: history || [],
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dry = body?.dry === true;
    // Always force: admins explicitly clicked the button. The dry flag exits
    // inside the sweep BEFORE any wallet credit / withdrawal is touched.
    const result = await runRevenueSweep({ force: true, dry });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
