import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentWeekStart, nextWeekStart, LEAGUE_TIERS } from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/leagues/status — one-shot snapshot for the Leagues
 * admin panel: per-tier roster vs fair-share target, current week
 * boundaries, and the management toggles. Admin-only.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const cfg = await getLeagueXpConfig(admin);
    const { data: rows } = await admin.from("league_xp_members").select("tier");
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of rows ?? []) counts[r.tier] = (counts[r.tier] ?? 0) + 1;
    const total = rows?.length ?? 0;
    const fair = Math.floor(total / 5);
    const rem = total % 5;
    // Same top-heavy fair-share split the settle rebalance uses.
    const target = (t: number) => fair + (rem > 5 - t ? 1 : 0);

    return NextResponse.json({
      tiers: [1, 2, 3, 4, 5].map((t) => ({
        tier: t,
        name: LEAGUE_TIERS[t - 1]?.name ?? `Tier ${t}`,
        count: counts[t] ?? 0,
        target: target(t),
      })),
      total,
      weekStart: currentWeekStart(),
      weekEnd: nextWeekStart(),
      seasonStart: cfg.season_start ?? null,
      flags: {
        // Effective payout state for the week that closes next (what the
        // next settle actually does): rewards + admin toggle + the
        // payouts_start date gate built into the settle code.
        weeklyPayouts:
          cfg.rewards_enabled &&
          cfg.weekly_payouts_enabled !== false &&
          (!cfg.payouts_start || currentWeekStart() >= cfg.payouts_start),
        // Date gate: the settle pays only for weeks starting on/after
        // this date ("automation in code" — no external scheduler).
        payoutsStart: cfg.payouts_start ?? null,
        firstPaidSettle: cfg.payouts_start
          ? nextWeekStart(new Date(cfg.payouts_start + "T00:00:00+02:00"))
          : null,
        // Raw switches:
        rewardsEnabled: cfg.rewards_enabled,
        weeklyPayoutsEnabled: cfg.weekly_payouts_enabled !== false,
        tierMoves: cfg.tier_moves_enabled === true,
        monthlyPayouts: cfg.monthly_rewards_enabled === true,
        registrationOpen: cfg.registration_open !== false,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
