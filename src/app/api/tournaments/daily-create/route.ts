import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIZE_SPLITS_BY_TYPE } from "@/lib/tournament/prizes";
import { sendEmail } from "@/lib/email";

/**
 * Cron endpoint: automatically creates the daily Crazy Chess Battles tournament.
 *
 * Fires at 00:00 Africa/Blantyre (22:00 UTC previous day) via Vercel cron.
 * Creates one tournament per day, scheduled to start at 20:30 Blantyre the same day.
 *
 * Day-specific names:
 *   Mon — Blitz Wars, Tue — Crazy Clash, Wed — Midweek Masters,
 *   Thu — Thursday Showdown, Fri — Friday Night Battle,
 *   Sat — Weekend Warriors, Sun — Crazy Grand Prix
 *
 * Settings: MK500 entry, 5-round Swiss, rapid 10+0, min 6 players,
 * pool_source = entry_fees, creator_profit_percent = 10.
 *
 * Duplicate prevention: checks if a tournament with the same name already
 * exists for today's date before creating.
 *
 * Auth: CRON_SECRET header (same as other cron endpoints).
 */

const DAILY_TOURNAMENTS: Record<number, string> = {
  0: "Crazy Grand Prix",     // Sunday
  1: "Blitz Wars",           // Monday
  2: "Crazy Clash",          // Tuesday
  3: "Midweek Masters",      // Wednesday
  4: "Thursday Showdown",    // Thursday
  5: "Friday Night Battle",  // Friday
  6: "Weekend Warriors",     // Saturday
};

// Admin user who "owns" the daily tournaments
const SYSTEM_ADMIN_ID = "2128390f-9724-44a7-86fe-014227be300e";

// Africa/Blantyre is UTC+2, no DST
const BLANTYRE_OFFSET_MS = 2 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  return handleCreate(req);
}
export async function GET(req: NextRequest) {
  return handleCreate(req);
}

async function handleCreate(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get current time in Blantyre
    const nowUtc = new Date();
    const nowBlantyre = new Date(nowUtc.getTime() + BLANTYRE_OFFSET_MS);
    const dayOfWeek = nowBlantyre.getDay(); // 0=Sun, 1=Mon, ...
    const tournamentName = DAILY_TOURNAMENTS[dayOfWeek];

    if (!tournamentName) {
      return NextResponse.json({ error: "No tournament defined for today" }, { status: 400 });
    }

    // ── Duplicate prevention ──
    // Calculate today's date range in Blantyre (as UTC ISO strings for Supabase)
    const blantyreYear = nowBlantyre.getFullYear();
    const blantyreMonth = nowBlantyre.getMonth();  // 0-indexed (for Date.UTC)
    const blantyreDate = nowBlantyre.getDate();    // 1-indexed (for Date.UTC)

    // Start of today in Blantyre = 00:00 Blantyre = 22:00 UTC previous day
    const startOfTodayBlantyre = new Date(
      Date.UTC(blantyreYear, blantyreMonth, blantyreDate, 0, 0, 0) - BLANTYRE_OFFSET_MS
    );
    // End of today in Blantyre = 23:59:59 Blantyre
    const endOfTodayBlantyre = new Date(
      startOfTodayBlantyre.getTime() + 24 * 60 * 60 * 1000 - 1
    );

    const { data: existing } = await admin
      .from("tournaments")
      .select("id, name, starts_at")
      .eq("name", tournamentName)
      .gte("starts_at", startOfTodayBlantyre.toISOString())
      .lte("starts_at", endOfTodayBlantyre.toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        skipped: true,
        reason: "Tournament already exists for today",
        tournament: existing[0],
      });
    }

    // ── Calculate start time: 20:30 Blantyre today ──
    // 20:30 Blantyre = 18:30 UTC
    const startsAt = new Date(
      Date.UTC(blantyreYear, blantyreMonth, blantyreDate, 20, 30, 0) - BLANTYRE_OFFSET_MS
    );

    // ── Prize distribution (Swiss format) ──
    const payouts = PRIZE_SPLITS_BY_TYPE["swiss"];

    // ── Create tournament ──
    const { data: tournament, error } = await admin
      .from("tournaments")
      .insert({
        name: tournamentName,
        description: `Daily ${tournamentName} — 5-round Swiss rapid 10+5. MK500 entry. Prize pool from entries.`,
        type: "swiss",
        time_control: "rapid",
        initial_minutes: 10,
        increment_seconds: 5,
        max_players: 128,
        min_players: 6,
        rounds: 5,
        starts_at: startsAt.toISOString(),
        ends_at: null,
        entry_fee: 500,
        prize_pool: 0,  // grows as players join (pool_source = entry_fees)
        pool_source: "entry_fees",
        creator_profit_percent: 10,
        prize_distribution: { type: "percentage", payouts },
        min_rating: 0,
        max_rating: null,
        thumbnail_url: null,
        knockout_format: "pure",
        created_by: SYSTEM_ADMIN_ID,
        status: "upcoming",
      })
      .select()
      .single();

    if (error) {
      console.error("Daily tournament creation failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[daily-tournament] Created "${tournamentName}" starting at ${startsAt.toISOString()}`);

    // ── Notify all registered users that a new tournament is open ──
    let emailsSent = 0;
    try {
      const { data: allUsers } = await admin
        .rpc("get_all_user_emails") as { data: { user_id: string; email: string }[] | null };

      if (allUsers && allUsers.length > 0) {
        const emails = (allUsers as any[])
          .map((u: any) => u.email)
          .filter((e: any): e is string => !!e)
          .map((to: string) =>
            sendEmail({
              to,
              template: "new_tournament" as const,
              data: {
                tournamentName,
                tournamentId: tournament.id,
                startsAt: startsAt.toISOString(),
                entryFee: 500,
                playerCount: 0,
                currentPrizePool: 0,
              },
            })
          );
        await Promise.allSettled(emails);
        emailsSent = allUsers.length;
        console.log(`[daily-tournament] Queued ${emailsSent} new-tournament emails`);
      }
    } catch (emailErr) {
      console.error("[daily-tournament] Failed to send new-tournament emails:", emailErr);
    }

    return NextResponse.json({
      success: true,
      tournament,
      name: tournamentName,
      startsAt: startsAt.toISOString(),
      emailsSent,
    });
  } catch (e: any) {
    console.error("Daily tournament creation error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
