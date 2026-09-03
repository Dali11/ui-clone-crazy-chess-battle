import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordManualTournamentResult } from "@/lib/tournament/results";

/**
 * POST /api/admin/tournaments/[id]/override-match
 * Body: { roundNumber: number, whiteId: string, blackId: string,
 *         winner: "white" | "black" | "draw", note?: string }
 *
 * Admin manual result override for a round-based tournament pairing —
 * the human backstop for matches whose result never got recorded
 * (player closed the browser, dispute, game creation failure).
 * Mirrors the exact normal-result pipeline: stats, pairing, round
 * completion, Armageddon for knockout draws.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tournamentId } = await params;

    // ── Admin auth (same pattern as /api/admin/leagues/[id]/fixtures) ──
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

    // ── Validate input ──
    const { roundNumber, whiteId, blackId, winner, note } = await req.json();
    if (!roundNumber || !whiteId || !blackId) {
      return NextResponse.json({ error: "roundNumber, whiteId and blackId are required" }, { status: 400 });
    }
    if (!["white", "black", "draw"].includes(winner)) {
      return NextResponse.json({ error: "winner must be 'white', 'black' or 'draw'" }, { status: 400 });
    }

    const outcome = await recordManualTournamentResult({
      tournamentId,
      roundNumber,
      whiteId,
      blackId,
      winner,
    });

    if (!outcome.ok) {
      const status =
        outcome.reason === "already_recorded" ? 409 :
        outcome.reason === "tournament_not_found" ? 404 :
        outcome.reason === "no_matching_pairing" ? 404 : 400;
      const message =
        outcome.reason === "already_recorded"
          ? "This match already has a recorded result. Overriding would desync standings."
          : outcome.reason === "tournament_not_found"
          ? "Tournament not found."
          : outcome.reason === "no_matching_pairing"
          ? "No matching pairing in that round."
          : "This tournament has no rounds (arena tournaments use the games-tab override).";
      return NextResponse.json({ error: message }, { status });
    }

    // Audit log
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: `tournament_override_match:${winner}`,
        target_type: "tournament",
        target_id: tournamentId,
        notes: note || `Round ${roundNumber}: ${whiteId} vs ${blackId} → ${winner}`,
      });
    } catch {}

    return NextResponse.json({ success: true, ...outcome });
  } catch (e: any) {
    console.error("[admin/tournaments/override-match] error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
