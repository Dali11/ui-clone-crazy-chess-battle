import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-time migration endpoint — adds league_fixture_id and league_id
 * columns to the games table, and season_start_date to premier_leagues.
 *
 * Uses Supabase admin client (no raw DATABASE_URL needed).
 * Idempotent — safe to call multiple times.
 * No auth required.
 */
export async function GET() {
  const results: string[] = [];

  // Supabase REST API doesn't support ALTER TABLE, so we try a different approach:
  // We check if the columns exist by trying to select them, and only report status.

  const admin = createAdminClient();

  try {
    // Check if league_fixture_id exists on games
    const { error: checkErr } = await admin
      .from("games")
      .select("league_fixture_id")
      .limit(1);

    if (checkErr && checkErr.message.includes("does not exist")) {
      results.push("⚠️ games.league_fixture_id — column missing, needs manual migration");
    } else {
      results.push("✅ games.league_fixture_id — already exists");
    }
  } catch {
    results.push("⚠️ games.league_fixture_id — check failed");
  }

  try {
    const { error: checkErr2 } = await admin
      .from("games")
      .select("league_id")
      .limit(1);

    if (checkErr2 && checkErr2.message.includes("does not exist")) {
      results.push("⚠️ games.league_id — column missing, needs manual migration");
    } else {
      results.push("✅ games.league_id — already exists");
    }
  } catch {
    results.push("⚠️ games.league_id — check failed");
  }

  try {
    const { error: checkErr3 } = await admin
      .from("premier_leagues")
      .select("season_start_date")
      .limit(1);

    if (checkErr3 && checkErr3.message.includes("does not exist")) {
      results.push("⚠️ premier_leagues.season_start_date — column missing, needs manual migration");
    } else {
      results.push("✅ premier_leagues.season_start_date — already exists");
    }
  } catch {
    results.push("⚠️ premier_leagues.season_start_date — check failed");
  }

  // If any columns are missing, we need to run the ALTER TABLE via Supabase SQL editor
  const needsMigration = results.some(r => r.includes("column missing"));
  const sql = needsMigration
    ? `-- Run in Supabase SQL Editor:
ALTER TABLE games ADD COLUMN IF NOT EXISTS league_fixture_id UUID;
ALTER TABLE games ADD COLUMN IF NOT EXISTS league_id UUID;
ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS season_start_date TIMESTAMPTZ;`
    : null;

  return NextResponse.json({
    success: !needsMigration,
    migrations: results,
    needsManualMigration: needsMigration,
    sql: sql,
  });
}
