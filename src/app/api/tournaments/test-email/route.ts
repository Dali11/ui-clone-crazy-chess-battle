import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

/**
 * Test endpoint to send a "new_tournament" announcement email.
 * Protected by CRON_SECRET.
 *
 * GET /api/tournaments/test-email?tournamentId=xxx
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");
  const admin = createAdminClient();

  let tournament: any = null;

  if (!tournamentId) {
    const { data: latest } = await admin
      .from("tournaments")
      .select("id, name, starts_at, entry_fee, prize_pool, creator_profit_percent, type, time_control, initial_minutes, increment_seconds, rounds, duration_minutes, pool_source")
      .eq("status", "upcoming")
      .order("starts_at", { ascending: false })
      .limit(1)
      .single();
    tournament = latest;
  } else {
    const { data: t } = await admin
      .from("tournaments")
      .select("id, name, starts_at, entry_fee, prize_pool, creator_profit_percent, type, time_control, initial_minutes, increment_seconds, rounds, duration_minutes, pool_source")
      .eq("id", tournamentId)
      .single();
    tournament = t;
  }

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Query real participant count
  const { count } = await admin
    .from("tournament_participants")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournament.id);

  const result = await sendEmail({
    to: "geniuspulse22@gmail.com",
    template: "new_tournament",
    data: {
      tournamentName: tournament.name,
      tournamentId: tournament.id,
      startsAt: tournament.starts_at,
      entryFee: tournament.entry_fee || 0,
      playerCount: count || 0,
      currentPrizePool: tournament.prize_pool || 0,
      tournamentType: tournament.type,
      timeControl: tournament.time_control,
      initialMinutes: tournament.initial_minutes,
      incrementSeconds: tournament.increment_seconds,
      rounds: tournament.rounds,
      durationMinutes: tournament.duration_minutes,
      poolSource: tournament.pool_source,
      creatorProfitPercent: tournament.creator_profit_percent || 0,
    },
  });

  return NextResponse.json({ success: result, tournament: tournament.name, id: tournament.id, playerCount: count || 0 });
}
