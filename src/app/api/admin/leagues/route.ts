import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: leagues, error } = await admin
      .from("premier_leagues")
      .select("*")
      .order("tier", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch registration counts per league (source of truth)
    const leagueIds = (leagues || []).map((l: any) => l.id);
    let regCounts: Record<string, number> = {};
    if (leagueIds.length > 0) {
      const { data: regs } = await admin
        .from("league_registrations")
        .select("league_id")
        .in("league_id", leagueIds)
        .in("status", ["pending", "approved"]);
      for (const r of regs || []) {
        regCounts[r.league_id] = (regCounts[r.league_id] || 0) + 1;
      }
    }

    const formatted = (leagues || []).map((league: any) => ({
      ...league,
      participant_count: regCounts[league.id] || 0,
    }));

    return NextResponse.json(formatted);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch leagues" }, { status: 500 });
  }
}
