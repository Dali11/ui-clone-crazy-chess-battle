import { NextResponse } from "next/server";

/**
 * One-time migration endpoint — adds league_fixture_id and league_id
 * columns to the games table, and season_start_date to premier_leagues.
 *
 * No auth required — safe because ALTER TABLE IF NOT EXISTS is idempotent.
 * Can be called once after deployment to set up the schema.
 */
export async function GET() {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 500 });
    }

    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    const results: string[] = [];

    await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS league_fixture_id UUID");
    results.push("✅ games.league_fixture_id");

    await client.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS league_id UUID");
    results.push("✅ games.league_id");

    await client.query("ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS season_start_date TIMESTAMPTZ");
    results.push("✅ premier_leagues.season_start_date");

    await client.end();

    return NextResponse.json({ success: true, migrations: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
