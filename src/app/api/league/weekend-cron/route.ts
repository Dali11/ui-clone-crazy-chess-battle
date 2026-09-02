import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWeekendLeagueCron } from "@/lib/league/weekend-scheduler";

/**
 * Weekend League Cron — fires at 8AM CAT (6AM UTC) on Saturdays & Sundays.
 *
 * Does three things:
 * 1. Notifies all players with fixtures scheduled for today:
 *    "Your match against [opponent] is today at [time] CAT"
 * 2. Auto-advances any matchdays whose scheduled time + grace period has passed
 * 3. Auto-resolves unplayed fixtures from the previous matchday
 *
 * Triggered by Vercel cron: "0 6 * * 6,0" (6AM UTC = 8AM CAT, Sat & Sun)
 * Also safe to call from the main tournament cron heartbeat.
 */
export async function GET(req: NextRequest) {
  return handleWeekendCron(req);
}

export async function POST(req: NextRequest) {
  return handleWeekendCron(req);
}

async function handleWeekendCron(req: NextRequest) {
  try {
    // ── Auth: only Vercel cron or admin can trigger this ──
    const authHeader = req.headers.get("authorization");
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    if (!isCron) {
      // Also allow authenticated admin requests
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const admin = createAdminClient();
      const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
      if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // ── One-time migration: add league columns to games table ──
    // Safe to run multiple times — uses IF NOT EXISTS
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        const { Client } = await import("pg");
        const client = new Client({ connectionString: dbUrl });
        await client.connect();
        await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS league_fixture_id UUID");
        await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS league_id UUID");
        await client.query("ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS season_start_date TIMESTAMPTZ");
        await client.end();
        console.log("[weekend-cron] Migration check complete");
      }
    } catch (migErr) {
      console.error("[weekend-cron] Migration error (non-fatal):", migErr);
    }

    const now = new Date();
    const todayUTC = now.toISOString().split("T")[0]; // YYYY-MM-DD

    // Only run on weekends (Saturday = 6, Sunday = 0)
    const dayOfWeek = now.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      return NextResponse.json({ success: true, message: "Not a weekend day — skipping" });
    }

    // ── 1. Notify players with fixtures scheduled for today ──
    let notificationsSent = 0;
    const notifications: any[] = [];

    // Get all active leagues
    const { data: leagues, error: leagueErr } = await admin
      .from("premier_leagues")
      .select("id, name, tier")
      .in("status", ["active", "registration"]);

    if (leagueErr || !leagues) {
      return NextResponse.json({ error: "Failed to fetch leagues" }, { status: 500 });
    }

    for (const league of leagues) {
      // Get fixtures scheduled for today that haven't been played
      const startOfDay = new Date(todayUTC + "T00:00:00Z");
      const endOfDay = new Date(todayUTC + "T23:59:59Z");

      const { data: fixtures, error: fixtureErr } = await admin
        .from("league_fixtures")
        .select("id, matchday, home_player_id, away_player_id, scheduled_date, league_id")
        .eq("league_id", league.id)
        .eq("played", false)
        .gte("scheduled_date", startOfDay.toISOString())
        .lte("scheduled_date", endOfDay.toISOString());

      if (fixtureErr || !fixtures || fixtures.length === 0) continue;

      // Batch-fetch player profiles
      const allPlayerIds = new Set<string>();
      fixtures.forEach((f: any) => {
        allPlayerIds.add(f.home_player_id);
        allPlayerIds.add(f.away_player_id);
      });

      const { data: profiles } = await admin
        .from("profiles")
        .select("id, display_name, username")
        .in("id", Array.from(allPlayerIds));

      const profileMap = new Map<string, any>();
      (profiles || []).forEach((p: any) => profileMap.set(p.id, p));

      for (const fixture of fixtures) {
        const homePlayer = profileMap.get(fixture.home_player_id);
        const awayPlayer = profileMap.get(fixture.away_player_id);

        // Format the match time in CAT (UTC+2)
        const matchTime = new Date(fixture.scheduled_date);
        const catHour = (matchTime.getUTCHours() + 2) % 24;
        const timeStr = `${catHour}:00`;

        // Notify home player
        if (homePlayer) {
          notifications.push({
            user_id: fixture.home_player_id,
            type: "league_match_today",
            title: `⚔️ ${league.name} — Match Today`,
            body: `Your match against ${awayPlayer?.display_name || "TBD"} is today at ${timeStr} CAT (Matchday ${fixture.matchday}). Don't be late!`,
            data: {
              leagueId: league.id,
              fixtureId: fixture.id,
              matchday: fixture.matchday,
              opponentId: fixture.away_player_id,
              scheduledDate: fixture.scheduled_date,
            },
            read: false,
          });
        }

        // Notify away player
        if (awayPlayer) {
          notifications.push({
            user_id: fixture.away_player_id,
            type: "league_match_today",
            title: `⚔️ ${league.name} — Match Today`,
            body: `Your match against ${homePlayer?.display_name || "TBD"} is today at ${timeStr} CAT (Matchday ${fixture.matchday}). Don't be late!`,
            data: {
              leagueId: league.id,
              fixtureId: fixture.id,
              matchday: fixture.matchday,
              opponentId: fixture.home_player_id,
              scheduledDate: fixture.scheduled_date,
            },
            read: false,
          });
        }
      }
    }

    // Batch insert notifications
    if (notifications.length > 0) {
      // Insert in batches of 100 to avoid payload limits
      for (let i = 0; i < notifications.length; i += 100) {
        const batch = notifications.slice(i, i + 100);
        const { error: notifErr } = await admin.from("notifications").insert(batch);
        if (notifErr) {
          console.error("[weekend-cron] Notification insert error:", notifErr.message);
        } else {
          notificationsSent += batch.length;
        }
      }
    }

    // ── 2. Auto-advance matchdays whose time has passed ──
    const advanceResults = await runWeekendLeagueCron();

    return NextResponse.json({
      success: true,
      date: todayUTC,
      notificationsSent,
      leaguesAdvanced: advanceResults.advanced.length,
      leaguesCompleted: advanceResults.completed.length,
      leaguesSkipped: advanceResults.skipped.length,
      advanced: advanceResults.advanced,
      completed: advanceResults.completed,
    });
  } catch (error: any) {
    console.error("[weekend-cron] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
