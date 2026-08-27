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

  if (!tournamentId) {
    // Find the most recent upcoming tournament
    const admin = createAdminClient();
    const { data: latest } = await admin
      .from("tournaments")
      .select("id, name, starts_at, entry_fee, prize_pool, creator_profit_percent")
      .eq("status", "upcoming")
      .order("starts_at", { ascending: false })
      .limit(1)
      .single();

    if (!latest) {
      return NextResponse.json({ error: "No upcoming tournament found" }, { status: 404 });
    }

    const result = await sendEmail({
      to: "geniuspulse22@gmail.com",
      template: "new_tournament",
      data: {
        tournamentName: latest.name,
        tournamentId: latest.id,
        startsAt: latest.starts_at,
        entryFee: latest.entry_fee || 500,
        playerCount: 0,
        currentPrizePool: latest.prize_pool || 0,
      },
    });

    return NextResponse.json({ success: result, tournament: latest.name, id: latest.id });
  }

  const admin = createAdminClient();
  const { data: tournament, error } = await admin
    .from("tournaments")
    .select("id, name, starts_at, entry_fee, prize_pool, creator_profit_percent")
    .eq("id", tournamentId)
    .single();

  if (error || !tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const result = await sendEmail({
    to: "geniuspulse22@gmail.com",
    template: "new_tournament",
    data: {
      tournamentName: tournament.name,
      tournamentId: tournament.id,
      startsAt: tournament.starts_at,
      entryFee: tournament.entry_fee || 500,
      playerCount: 0,
      currentPrizePool: tournament.prize_pool || 0,
    },
  });

  return NextResponse.json({ success: result, tournament: tournament.name });
}
