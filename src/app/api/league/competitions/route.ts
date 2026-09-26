import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/league/competitions
 *
 * Tournament listing for the public Tournaments page (and the legacy
 * /league/tournaments route, which shares the same client component).
 *
 * NOTE: this used to also return the old "Premier Leagues" (tiered,
 * gender-separated weekend fixtures) as `tiered`. That system was fully
 * retired in favor of the Duolingo-style XP League (see /api/league/xp/*),
 * so this route now only ever returns `tournaments`. Kept at this path
 * (instead of renaming) so the existing tournaments-client.tsx and any
 * bookmarked/cached calls keep working without a client change.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();

    let isAdmin = false;
    if (user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();
      isAdmin = !!profile?.is_admin;
    }

    const { data: tournaments, error: tournamentError } = await admin
      .from("tournaments")
      .select("id, name, status, entry_fee, max_players, min_rating, max_rating, rounds, starts_at, time_control, created_by")
      .in("status", ["upcoming", "active", "pending_approval", "completed", "finished"])
      .order("starts_at", { ascending: true })
      .limit(50);

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 500 });
    }

    const tournamentIds = (tournaments || []).map((t) => t.id);
    const [participantsRes, myParticipantsRes] = await Promise.all([
      tournamentIds.length
        ? admin.from("tournament_participants").select("tournament_id").in("tournament_id", tournamentIds)
        : Promise.resolve({ data: [] as any[] }),
      user && tournamentIds.length
        ? admin.from("tournament_participants").select("tournament_id").eq("player_id", user.id).in("tournament_id", tournamentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const participantCounts: Record<string, number> = {};
    for (const r of participantsRes.data || []) {
      participantCounts[r.tournament_id] = (participantCounts[r.tournament_id] || 0) + 1;
    }
    const myTournamentIds = new Set((myParticipantsRes.data || []).map((r: any) => r.tournament_id));

    const tournamentList = (tournaments || []).map((tournament) => {
      const participantCount = participantCounts[tournament.id] || 0;
      const isRegistered = user ? myTournamentIds.has(tournament.id) : false;
      const isCreator = user ? tournament.created_by === user.id : false;

      // Registered-player counts are hidden until it's time to start
      // (owner decision 2026-09-25). Admins and the tournament creator
      // always see real counts (owner rule 2026-09-26) — same policy as
      // the tournament detail page.
      const started =
        ["active", "completed", "finished"].includes(tournament.status) ||
        (tournament.starts_at ? new Date(tournament.starts_at).getTime() <= Date.now() : false);
      const showCount = started || isAdmin || isCreator;

      let canJoin = true;
      let reason: string | null = null;
      if (!user) { canJoin = false; reason = "not_authenticated"; }
      else if (isRegistered) { canJoin = false; reason = "already_registered"; }
      else if (tournament.status === "active") { canJoin = false; reason = "already_started"; }
      else if (tournament.status === "pending_approval") { canJoin = false; reason = "pending_approval"; }
      else if (tournament.status === "completed" || tournament.status === "finished") { canJoin = false; reason = "completed"; }
      else if (tournament.status !== "upcoming") { canJoin = false; reason = "not_joinable"; }

      return {
        type: "tournament" as const,
        id: tournament.id,
        name: tournament.name,
        status: tournament.status === "pending_approval" ? "pending" : tournament.status === "finished" ? "completed" : tournament.status,
        entryType: (tournament.entry_fee || 0) > 0 ? "paid" : "free",
        entryFee: tournament.entry_fee || 0,
        playerCount: showCount ? participantCount : null,
        maxPlayers: tournament.max_players || null,
        rounds: tournament.rounds,
        startsAt: tournament.starts_at,
        timeControl: tournament.time_control,
        isRegistered,
        isCreator,
        qualification: { canJoin, reason },
      };
    });

    return NextResponse.json({
      success: true,
      isAdmin,
      user: user ? { id: user.id } : null,
      tournaments: tournamentList,
    });
  } catch (error: any) {
    console.error("Competitions API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
