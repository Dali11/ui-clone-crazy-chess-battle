import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLeagueXpConfig, currentMonthStart, LEAGUE_TIERS } from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * POST /api/league/xp/register — join a league (or re-confirm your seat).
 *
 * Owner policy 2026-09-11 (kept): all new players join the Open League
 * (tier 1). Higher leagues are reached by promotion only. The ladder
 * and fair-share rebalance are maintained — they now ride the monthly
 * cycle (owner correction 2026-09-26).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const cfg = await getLeagueXpConfig(admin);
    if (!cfg.enabled) return NextResponse.json({ error: "The XP leaderboard is currently disabled" }, { status: 403 });
    if (cfg.registration_open === false) {
      return NextResponse.json({ error: "Registration is currently closed" }, { status: 403 });
    }

    const cycle = currentMonthStart();
    // AUDIT FIX 2026-09-11 (kept): only INSERT when the member row is
    // absent — a re-register call must never wipe a player's XP or tier.
    const { data: existing } = await admin
      .from("league_xp_members")
      .select("user_id, tier, xp, week_start, lifetime_xp")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      const info = LEAGUE_TIERS.find((t) => t.tier === existing.tier) ?? LEAGUE_TIERS[0];
      return NextResponse.json({ success: true, member: existing, league: info, alreadyRegistered: true });
    }

    const { data: member, error } = await admin
      .from("league_xp_members")
      .insert({ user_id: user.id, tier: 1, xp: 0, week_start: cycle, lifetime_xp: 0 })
      .select("user_id, tier, xp, week_start, lifetime_xp")
      .single();
    if (error) {
      // Unique constraint hit by a concurrent insert — already joined.
      if (String(error.message || "").includes("duplicate key")) {
        return NextResponse.json({ success: true, member: null, alreadyRegistered: true });
      }
      console.error("[league/register] insert failed:", error);
      return NextResponse.json({ error: "Failed to register" }, { status: 500 });
    }

    return NextResponse.json({ success: true, member, league: LEAGUE_TIERS[0], alreadyRegistered: false });
  } catch (err: any) {
    console.error("[league/register] unexpected error:", err?.message);
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}
