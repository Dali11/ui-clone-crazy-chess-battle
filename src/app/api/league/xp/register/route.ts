import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLeagueXpConfig, currentWeekStart, LEAGUE_TIERS } from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * POST /api/league/xp/register — join a league (or switch leagues).
 *
 * Owner policy 2026-09-11: registration is open and ANY player can join
 * ANY league — self-select your tier. Joining or switching resets your
 * weekly XP to 0 for the current cycle (fair play — no hopping with a
 * carried score). Tiers above Open respect tier_cap; Open is uncapped.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { tier } = await req.json();
    const tierNum = Number(tier);
    if (!Number.isInteger(tierNum) || tierNum < 1 || tierNum > LEAGUE_TIERS.length) {
      return NextResponse.json({ error: "Invalid league tier" }, { status: 400 });
    }

    const admin = createAdminClient();
    const cfg = await getLeagueXpConfig(admin);
    if (!cfg.enabled) return NextResponse.json({ error: "Leagues are currently disabled" }, { status: 403 });
    if (cfg.registration_open === false) {
      return NextResponse.json({ error: "League registration is currently closed" }, { status: 403 });
    }

    // Tier capacity — leagues above Open hold at most tier_cap players.
    if (tierNum > 1 && cfg.tier_cap > 0) {
      const { count, error: capErr } = await admin
        .from("league_xp_members")
        .select("user_id", { count: "exact", head: true })
        .eq("tier", tierNum);
      if (capErr) {
        console.error("[league/register] tier cap check failed:", capErr);
        return NextResponse.json({ error: "Failed to check league capacity" }, { status: 500 });
      }
      const isSwitching = (count ?? 0) > 0; // re-check below for own membership
      const { data: existing } = await admin
        .from("league_xp_members").select("user_id").eq("user_id", user.id).maybeSingle();
      const ownSeat = existing ? 1 : 0;
      if ((count ?? 0) - ownSeat >= cfg.tier_cap) {
        return NextResponse.json(
          { error: `${LEAGUE_TIERS[tierNum - 1].name} is full (${cfg.tier_cap} players)` },
          { status: 409 }
        );
      }
      void isSwitching;
    }

    const week = currentWeekStart();
    const { data: member, error: upErr } = await admin
      .from("league_xp_members")
      .upsert(
        { user_id: user.id, tier: tierNum, xp: 0, week_start: week },
        { onConflict: "user_id" }
      )
      .select("user_id, tier, xp, week_start")
      .single();

    if (upErr) {
      console.error("[league/register] upsert failed:", upErr);
      return NextResponse.json({ error: "Failed to register" }, { status: 500 });
    }

    const tierInfo = LEAGUE_TIERS[tierNum - 1];
    return NextResponse.json({
      success: true,
      member,
      league: tierInfo,
      resetWeeklyXp: true,
    });
  } catch (err: any) {
    console.error("[league/register] unexpected error:", err?.message);
    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}
