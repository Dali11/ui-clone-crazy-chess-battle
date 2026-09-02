import { finalizeLeagueSeason } from "@/lib/league/season-end";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalcStandings } from "@/lib/league/engine";

// ============================================================
// Weekend Scheduler — assigns fixtures to Saturdays & Sundays
// 4 matchdays per weekend day, all leagues in parallel
// ============================================================

// Default season start: first Saturday of September 2026
const DEFAULT_SEASON_START = "2026-09-05T10:00:00Z";

/**
 * Map each matchday number to a weekend date.
 * 4 matchdays per day, alternating Saturdays and Sundays.
 *
 * @param totalMatchdays - e.g. 99 for a 100-player round robin
 * @param seasonStartDate - ISO string, the first weekend day
 * @returns Record<matchdayNumber, ISO date string>
 */
export function scheduleFixtureDates(
  totalMatchdays: number,
  seasonStartDate: string
): Record<number, string> {
  const result: Record<number, string> = {};
  const start = new Date(seasonStartDate);

  // Find the first Saturday on or after the start date
  const firstSaturday = new Date(start);
  const dayOfWeek = firstSaturday.getUTCDay(); // 0=Sun, 6=Sat
  if (dayOfWeek !== 6) {
    firstSaturday.setUTCDate(firstSaturday.getUTCDate() + (6 - dayOfWeek));
  }
  // Normalize to midnight UTC
  firstSaturday.setUTCHours(0, 0, 0, 0);

  let matchday = 1;
  let weekendIndex = 0; // 0 = first Saturday, 1 = first Sunday, 2 = second Saturday, ...

  while (matchday <= totalMatchdays) {
    // Calculate the date for this weekend day
    const weekOffset = Math.floor(weekendIndex / 2) * 7; // each pair = 1 week
    const isSunday = weekendIndex % 2 === 1;
    const date = new Date(firstSaturday);
    date.setUTCDate(date.getUTCDate() + weekOffset + (isSunday ? 1 : 0));

    // Assign up to 4 matchdays to this date
    // 4 time slots per day: 10:00, 13:00, 16:00, 19:00 UTC (12:00, 15:00, 18:00, 21:00 CAT)
    for (let slot = 0; slot < 4 && matchday <= totalMatchdays; slot++) {
      const hourUTC = 10 + slot * 3;
      const scheduledDate = new Date(date);
      scheduledDate.setUTCHours(hourUTC, 0, 0, 0);
      result[matchday] = scheduledDate.toISOString();
      matchday++;
    }

    weekendIndex++;
  }

  return result;
}

/**
 * Advance a league to the next matchday.
 * Called by the weekend cron when the current time slot has passed.
 * Also auto-completes the league if all matchdays are done.
 */
export async function advanceLeagueMatchday(leagueId: string): Promise<{
  success: boolean;
  leagueId: string;
  currentMatchday: number | null;
  status: string;
  message?: string;
}> {
  const supabase = createAdminClient();
  const { data: league, error } = await supabase
    .from("premier_leagues")
    .select("*")
    .eq("id", leagueId)
    .single();
  if (error || !league) {
    return { success: false, leagueId, currentMatchday: null, status: "error", message: "League not found" };
  }

  if (league.status !== "active") {
    return { success: false, leagueId, currentMatchday: league.current_matchday, status: league.status, message: "League not active" };
  }

  const current = league.current_matchday || 1;
  const total = league.total_matchdays || 1;

  if (current >= total) {
    // Season complete — finalize
    await supabase
      .from("premier_leagues")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", leagueId);

    // Recalculate final standings
    await recalcStandings(supabase as any, leagueId);

    // Finalize season (promotions, relegations, payouts, archive, auto-renew)
    await finalizeLeagueSeason(leagueId);

    return { success: true, leagueId, currentMatchday: total, status: "completed", message: "League season completed!" };
  }

  const next = current + 1;

  // Auto-forfeit any unplayed fixtures in the current matchday
  const { data: unplayed } = await supabase
    .from("league_fixtures")
    .select("id")
    .eq("league_id", leagueId)
    .eq("matchday", current)
    .eq("played", false);

  if (unplayed && unplayed.length > 0) {
    // Mark unplayed fixtures as double forfeit — neither player gets points.
    // This is standard in competitive chess: non-appearance = loss for both.
    const fixtureIds = unplayed.map(f => f.id);
    for (const fid of fixtureIds) {
      await supabase
        .from("league_fixtures")
        .update({ result: "double_forfeit", played: true, updated_at: new Date().toISOString() })
        .eq("id", fid);
    }
    console.log(`[league] Auto-resolved ${fixtureIds.length} unplayed fixtures in matchday ${current} as double forfeits`);
  }

  // Advance to next matchday
  await supabase
    .from("premier_leagues")
    .update({ current_matchday: next, updated_at: new Date().toISOString() })
    .eq("id", leagueId);

  // Recalculate standings
  await recalcStandings(supabase as any, leagueId);

  return {
    success: true,
    leagueId,
    currentMatchday: next,
    status: "active",
    message: `Advanced from matchday ${current} to ${next}`,
  };
}

/**
 * Weekend league cron — checks if any league's current matchday
 * scheduled time has passed and auto-advances.
 *
 * This runs on the same 5-minute heartbeat as the tournament cron.
 * It only advances leagues on weekends (Sat/Sun) and only when
 * the scheduled time for the current matchday has elapsed.
 */
export async function runWeekendLeagueCron(): Promise<{
  advanced: string[];
  completed: string[];
  skipped: string[];
}> {
  const supabase = createAdminClient();
  const now = new Date();

  // Only run on weekends (Saturday = 6, Sunday = 0)
  const dayOfWeek = now.getUTCDay();
  if (dayOfWeek !== 0 && dayOfWeek !== 6) {
    return { advanced: [], completed: [], skipped: ["not_weekend"] };
  }

  // Get all active leagues
  const { data: leagues, error } = await supabase
    .from("premier_leagues")
    .select("id, name, current_matchday, total_matchdays, status")
    .eq("status", "active");

  if (error || !leagues || leagues.length === 0) {
    return { advanced: [], completed: [], skipped: ["no_active_leagues"] };
  }

  const advanced: string[] = [];
  const completed: string[] = [];
  const skipped: string[] = [];

  for (const league of leagues) {
    const currentMatchday = league.current_matchday || 1;

    // Get the scheduled date for the current matchday
    const { data: fixture } = await supabase
      .from("league_fixtures")
      .select("scheduled_date")
      .eq("league_id", league.id)
      .eq("matchday", currentMatchday)
      .limit(1)
      .single();

    if (!fixture || !fixture.scheduled_date) {
      // No scheduled date — skip (can't determine if time has passed)
      skipped.push(league.id);
      continue;
    }

    const scheduledTime = new Date(fixture.scheduled_date);

    // Only advance if the scheduled time has passed
    if (now < scheduledTime) {
      skipped.push(league.id);
      continue;
    }

    // Give a 2-hour grace period after scheduled time before auto-advancing
    // This lets players finish their games even if they started late
    const gracePeriodMs = 2 * 60 * 60 * 1000; // 2 hours
    if (now.getTime() - scheduledTime.getTime() < gracePeriodMs) {
      skipped.push(league.id);
      continue;
    }

    // Advance the league
    const result = await advanceLeagueMatchday(league.id);
    if (result.success) {
      if (result.status === "completed") {
        completed.push(league.id);
      } else {
        advanced.push(league.id);
      }
    } else {
      skipped.push(league.id);
    }
  }

  return { advanced, completed, skipped };
}
