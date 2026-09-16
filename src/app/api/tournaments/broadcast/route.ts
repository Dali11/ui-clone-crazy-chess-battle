import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

/**
 * Broadcast the new_tournament announcement email to ALL registered users
 * for a specific existing tournament.
 *
 * GET /api/tournaments/broadcast?tournamentId=xxx
 * Auth: CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tournamentId = searchParams.get("tournamentId");

  if (!tournamentId) {
    return NextResponse.json({ error: "tournamentId required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: tournament, error } = await admin
    .from("tournaments")
    .select(
      "id, name, starts_at, entry_fee, type, time_control, initial_minutes, increment_seconds, rounds, duration_minutes, pool_source, prize_pool, creator_profit_percent"
    )
    .eq("id", tournamentId)
    .single();

  if (error || !tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Get all user emails via RPC
  const { data: allUsers } = await admin.rpc("get_all_user_emails");

  if (!allUsers || allUsers.length === 0) {
    return NextResponse.json({ error: "No users found" }, { status: 404 });
  }

  const emails = (allUsers as any[])
    .map((u) => u.email)
    .filter((e): e is string => !!e);

  // Send in batches to avoid rate limits
  const BATCH_SIZE = 50;
  let sent = 0;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((to) =>
        sendEmail({
          to,
          template: "new_tournament",
          data: {
            tournamentName: tournament.name,
            tournamentId: tournament.id,
            startsAt: tournament.starts_at,
            entryFee: tournament.entry_fee || 0,
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
        })
      )
    );
    sent += results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    // Small delay between batches
    if (i + BATCH_SIZE < emails.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return NextResponse.json({
    success: true,
    tournament: tournament.name,
    emailsAttempted: emails.length,
    emailsSent: sent,
  });
}
