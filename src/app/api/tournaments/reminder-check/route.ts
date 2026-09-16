import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

/**
 * Cron endpoint: sends "tournament_reminder" emails to users who haven't
 * joined a tournament that starts in ~5 hours.
 *
 * Runs every 30 minutes. For each upcoming tournament whose starts_at falls
 * within the next 5 hours (4.5h–5.5h window), it finds all registered users
 * who are NOT already participants and sends them a reminder email.
 *
 * Idempotency: uses a `reminder_sent_at` timestamp on the tournament to
 * ensure we only send once per tournament.
 *
 * Auth: CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const now = new Date();
    const fiveHoursFromNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);

    // Find all upcoming tournaments starting at or before 5 hours from now
    // that haven't had a reminder sent yet. The reminder_sent_at flag ensures
    // each tournament only triggers one reminder, regardless of cron frequency.
    const { data: tournaments, error } = await admin
      .from("tournaments")
      .select(
        "id, name, starts_at, entry_fee, prize_pool, type, time_control, initial_minutes, increment_seconds, rounds, duration_minutes, pool_source, creator_profit_percent"
      )
      .eq("status", "upcoming")
      .lte("starts_at", fiveHoursFromNow.toISOString())
      .is("reminder_sent_at", null);

    if (error) {
      console.error("[reminder-check] Query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!tournaments || tournaments.length === 0) {
      return NextResponse.json({ success: true, message: "No tournaments in the 5-hour reminder window", sent: 0 });
    }

    let totalEmailsSent = 0;
    const results: any[] = [];

    for (const tournament of tournaments) {
      try {
        // Get all user emails who have NOT joined this tournament
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("user_id")
          .eq("tournament_id", tournament.id);

        const participantIds = new Set((participants || []).map((p) => p.user_id));

        // Get all users with an email via RPC (emails are in auth.users, not profiles)
        const { data: allUsers } = await admin
          .rpc("get_all_user_emails");

        const nonJoiners = ((allUsers as any[]) || []).filter(
          (u: any) => u.email && !participantIds.has(u.user_id)
        );

        if (nonJoiners.length === 0) {
          // Everyone already joined — still mark as sent so we don't keep checking
          await admin
            .from("tournaments")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", tournament.id);
          results.push({ tournament: tournament.name, sent: 0, reason: "All users already joined" });
          continue;
        }

        // Send reminder emails
        const emailPromises = nonJoiners.map((user: any) =>
          sendEmail({
            to: user.email,
            template: "tournament_reminder",
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
        );

        const settled = await Promise.allSettled(emailPromises);
        const sent = settled.filter((s) => s.status === "fulfilled" && s.value === true).length;
        totalEmailsSent += sent;

        // Mark reminder as sent
        await admin
          .from("tournaments")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", tournament.id);

        results.push({ tournament: tournament.name, sent, totalNonJoiners: nonJoiners.length });
      } catch (e: any) {
        results.push({ tournament: tournament.name, error: e.message });
      }
    }

    console.log(`[reminder-check] Sent ${totalEmailsSent} reminder emails across ${tournaments.length} tournaments`);

    return NextResponse.json({
      success: true,
      checked: tournaments.length,
      emailsSent: totalEmailsSent,
      results,
    });
  } catch (e: any) {
    console.error("[reminder-check] Error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
