import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, userId: user.id };
}

// GET — all fixtures for a league, grouped by matchday, with player info
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id: leagueId } = await params;
    const admin = createAdminClient();

    const { data: league } = await admin
      .from("premier_leagues")
      .select("id, name, current_matchday, total_matchdays, status")
      .eq("id", leagueId)
      .single();
    if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });

    const { data: fixtures, error } = await admin
      .from("league_fixtures")
      .select("*")
      .eq("league_id", leagueId)
      .order("matchday", { ascending: true })
      .order("scheduled_date", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get player info
    const playerIds = new Set<string>();
    (fixtures || []).forEach((f: any) => {
      if (f.home_player_id) playerIds.add(f.home_player_id);
      if (f.away_player_id) playerIds.add(f.away_player_id);
    });

    let playersMap = new Map<string, any>();
    if (playerIds.size > 0) {
      const { data: players } = await admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, rating, country")
        .in("id", Array.from(playerIds));
      (players || []).forEach((p: any) => playersMap.set(p.id, p));
    }

    const enriched = (fixtures || []).map((f: any) => ({
      ...f,
      home_player: f.home_player_id ? playersMap.get(f.home_player_id) : null,
      away_player: f.away_player_id ? playersMap.get(f.away_player_id) : null,
    }));

    // Group by matchday
    const byMatchday: Record<number, any[]> = {};
    (enriched || []).forEach((f: any) => {
      if (!byMatchday[f.matchday]) byMatchday[f.matchday] = [];
      byMatchday[f.matchday].push(f);
    });

    return NextResponse.json({
      success: true,
      league,
      fixtures: enriched,
      byMatchday,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch fixtures" }, { status: 500 });
  }
}

// POST — manually set a fixture result (admin override)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id: leagueId } = await params;
    const { fixtureId, result } = await req.json();
    if (!fixtureId) return NextResponse.json({ error: "Missing fixtureId" }, { status: 400 });
    if (!result || !["home_win", "away_win", "draw", "double_forfeit", "pending"].includes(result)) {
      return NextResponse.json({ error: "Invalid result" }, { status: 400 });
    }

    const admin = createAdminClient();

    const played = result !== "pending";
    const { error } = await admin
      .from("league_fixtures")
      .update({
        result,
        played,
        admin_override: played,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fixtureId)
      .eq("league_id", leagueId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Recalculate standings whenever a result changes (set or reset)
    const { recalcStandings } = await import("@/lib/league/engine");
    await recalcStandings(admin as any, leagueId);

    try {
      await admin.from("admin_logs").insert({
        admin_id: auth.userId,
        action: "league_fixture_override",
        target_type: "league",
        target_id: leagueId,
        details: { fixtureId, result },
      });
    } catch {}

    return NextResponse.json({ success: true, fixtureId, result, played });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update fixture" }, { status: 500 });
  }
}
