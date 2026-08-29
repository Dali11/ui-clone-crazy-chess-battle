import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Self-serve "leave league" — only allowed while the league is still in
 * "registration" status (before the season starts and fixtures are
 * generated). This exists so a player who joined the wrong tier can switch
 * without needing an admin, while leagues stay strictly one-at-a-time
 * (see /api/league/join exclusivity check).
 *
 * Once a league goes "active", leaving requires an admin (roster changes
 * mid-season affect fixtures/standings) — use the admin players endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leagueId } = await req.json();
    if (!leagueId) return NextResponse.json({ error: "leagueId required" }, { status: 400 });

    const admin = createAdminClient();

    const { data: league, error } = await admin
      .from("premier_leagues")
      .select("*")
      .eq("id", leagueId)
      .single();
    if (error || !league) return NextResponse.json({ error: "League not found" }, { status: 404 });

    if (league.status !== "registration") {
      return NextResponse.json({
        error: "This league has already started — contact an admin to change your league.",
      }, { status: 400 });
    }

    const { data: reg } = await admin
      .from("league_registrations")
      .select("id")
      .eq("league_id", leagueId)
      .eq("player_id", user.id)
      .maybeSingle();

    if (!reg) {
      return NextResponse.json({ error: "You're not registered in this league" }, { status: 400 });
    }

    await admin.from("league_registrations").delete().eq("id", reg.id);
    await admin.from("league_standings").delete().eq("league_id", leagueId).eq("player_id", user.id);

    const updatedPlayerIds = (league.player_ids || []).filter((id: string) => id !== user.id);
    await admin
      .from("premier_leagues")
      .update({ player_ids: updatedPlayerIds, updated_at: new Date().toISOString() })
      .eq("id", leagueId);

    return NextResponse.json({ success: true, message: "You've left the league." });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to leave league" }, { status: 500 });
  }
}
