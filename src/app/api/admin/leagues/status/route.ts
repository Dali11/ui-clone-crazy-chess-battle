import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentMonthStart, nextMonthStart, levelFor } from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/leagues/status — one-shot snapshot for the Leagues
 * admin panel (owner redesign 2026-09-26): the single monthly
 * leaderboard's roster, club/non-club split, current cycle boundaries,
 * and the management toggles. Admin-only.
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
    const month = currentMonthStart();
    const { data: rows } = await admin
      .from("league_xp_members")
      .select("user_id, xp, week_start, lifetime_xp, profiles!inner(membership_until)");
    const total = rows?.length ?? 0;
    const activeThisMonth = (rows ?? []).filter((r: any) => r.week_start === month).length;
    const clubPlayers = (rows ?? []).filter((r: any) =>
      levelFor(r.profiles?.membership_until) === "club").length;

    return NextResponse.json({
      monthStart: month,
      monthEnd: nextMonthStart(),
      seasonStart: cfg.season_start ?? null,
      roster: {
        total,
        activeThisMonth,
        clubPlayers,
        nonClubPlayers: total - clubPlayers,
      },
      flags: {
        // Effective payout state for the month that closes next (what
        // the next settle actually does): rewards + admin toggle + the
        // payouts_start date gate built into the settle code.
        monthlyPayouts:
          cfg.rewards_enabled &&
          cfg.monthly_rewards_enabled !== false &&
          (!cfg.payouts_start || month >= cfg.payouts_start),
        payoutsStart: cfg.payouts_start ?? null,
        rewardsEnabled: cfg.rewards_enabled,
        registrationOpen: cfg.registration_open !== false,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
