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

// GET — list registrations + roster with player info for a league
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id: leagueId } = await params;
    const admin = createAdminClient();

    const { data: league, error: leagueErr } = await admin
      .from("premier_leagues")
      .select("id, name, player_ids, status, league_size")
      .eq("id", leagueId)
      .single();
    if (leagueErr || !league) return NextResponse.json({ error: "League not found" }, { status: 404 });

    const { data: registrations, error: regErr } = await admin
      .from("league_registrations")
      .select("id, player_id, status, qualified, qualification_reason, registered_at")
      .eq("league_id", leagueId)
      .order("registered_at", { ascending: true });
    if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

    const playerIds = Array.from(new Set([
      ...(league.player_ids || []),
      ...((registrations || []).map((r: any) => r.player_id)),
    ]));

    let playersMap = new Map<string, any>();
    if (playerIds.length > 0) {
      const { data: players } = await admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, country, rating, phone_verified, identity_verified, created_at")
        .in("id", playerIds);
      (players || []).forEach((p: any) => playersMap.set(p.id, p));
    }

    const roster = (registrations || []).map((r: any) => ({
      registrationId: r.id,
      playerId: r.player_id,
      status: r.status,
      qualified: r.qualified,
      qualificationReason: r.qualification_reason,
      registeredAt: r.registered_at,
      isPlayer: (league.player_ids || []).includes(r.player_id),
      player: playersMap.get(r.player_id) || null,
    }));

    return NextResponse.json({
      success: true,
      league: { id: league.id, name: league.name, status: league.status, leagueSize: league.league_size },
      roster,
      playerCount: (league.player_ids || []).length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch players" }, { status: 500 });
  }
}

// POST — remove a player from the league (roster + registration)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id: leagueId } = await params;
    const { playerId, action } = await req.json();
    if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
    if (action !== "remove") return NextResponse.json({ error: "Unsupported action" }, { status: 400 });

    const admin = createAdminClient();
    const { data: league, error: leagueErr } = await admin
      .from("premier_leagues")
      .select("id, player_ids, status")
      .eq("id", leagueId)
      .single();
    if (leagueErr || !league) return NextResponse.json({ error: "League not found" }, { status: 404 });

    if (league.status === "active") {
      return NextResponse.json({ error: "Cannot remove players from an active league — fixtures already generated. Deactivate first or wait for season end." }, { status: 400 });
    }

    const updatedPlayerIds = (league.player_ids || []).filter((id: string) => id !== playerId);
    await admin.from("premier_leagues").update({ player_ids: updatedPlayerIds, updated_at: new Date().toISOString() }).eq("id", leagueId);
    await admin.from("league_registrations").update({ status: "removed" }).eq("league_id", leagueId).eq("player_id", playerId);

    try {
      await admin.from("admin_logs").insert({
        admin_id: auth.userId,
        action: "league_player_removed",
        target_type: "league",
        target_id: leagueId,
        details: { playerId },
      });
    } catch {}

    return NextResponse.json({ success: true, playerCount: updatedPlayerIds.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to remove player" }, { status: 500 });
  }
}
