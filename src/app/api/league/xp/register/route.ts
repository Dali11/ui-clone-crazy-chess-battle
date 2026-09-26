import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLeagueXpConfig, currentMonthStart } from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * POST /api/league/xp/register — join the monthly XP leaderboard.
 *
 * Owner redesign 2026-09-26: there are no tiers anymore — joining
 * simply creates the player's leaderboard row. Everyone competes on
 * the same monthly board; the only player level (Non-Club / Club
 * Member) comes from membership, not from where you sit on the board.
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
    // absent — a re-register call must never wipe a player's XP.
    const { data: existing } = await admin
      .from("league_xp_members")
      .select("user_id, xp, week_start, lifetime_xp")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ success: true, member: existing, alreadyRegistered: true });
    }

    const { data: member, error } = await admin
      .from("league_xp_members")
      .insert({ user_id: user.id, tier: 1, xp: 0, week_start: cycle, lifetime_xp: 0 })
      .select("user_id, xp, week_start, lifetime_xp")
      .single();
    if (error) {
      // Unique constraint hit by a concurrent insert — already joined.
      if (String(error.message || "").includes("duplicate key")) {
        return NextResponse.json({ success: true, member: null, alreadyRegistered: true });
      }
      console.error("[league/register] insert failed:", error);
      return NextResponse.json({ error: "Failed to register" }, { status: 500 });
    }

    return NextResponse.json({ success: true, member, alreadyRegistered: false });
  } catch (err: any) {
    console.error("[league/register] unexpected error:", err?.message);
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}
